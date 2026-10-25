import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { FlvParser, type FlvTag } from '../lib/flv.js';
import { geoTools, type GeoTools, type SpawnHandle } from '../lib/geo-tools.js';
import { BizError } from '../lib/resp.js';

const IDLE_KILL_MS = 30_000;
const READY_TIMEOUT_MS = 15_000;
const MAX_PENDING_BYTES = 16 * 1024 * 1024;

interface Viewer {
  started: boolean;
  closed: boolean;
  pending: Buffer[];
  pendingBytes: number;
  raw: ServerResponse | null;
  onClose: () => void;
}

interface StreamState {
  id: string;
  url: string;
  fileMode: boolean;
  handle: SpawnHandle | null;
  parser: FlvParser;
  header: Buffer | null;
  metadata: Buffer | null;
  avcSequence: Buffer | null;
  viewers: Set<Viewer>;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  readySettled: boolean;
  hasData: boolean;
  finished: boolean;
  stderr: string;
  readyTimer: NodeJS.Timeout | null;
  killTimer: NodeJS.Timeout | null;
}

export interface VideoSession {
  ready: Promise<void>;
  bind: (raw: ServerResponse) => void;
  detach: () => void;
}

function lastLines(text: string, count = 3): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-count)
    .join(' ');
}

export class VideoStreamManager {
  private readonly streams = new Map<string, StreamState>();

  constructor(private readonly tools: GeoTools = geoTools) {}

  activeCount(): number {
    return this.streams.size;
  }

  attach(streamId: string, url: string): VideoSession {
    const state = this.ensureState(streamId, url);
    if (state.killTimer) {
      clearTimeout(state.killTimer);
      state.killTimer = null;
    }

    const viewer: Viewer = {
      started: false,
      closed: false,
      pending: [],
      pendingBytes: 0,
      raw: null,
      onClose: () => undefined
    };
    viewer.onClose = () => this.detachViewer(state, viewer);
    state.viewers.add(viewer);

    return {
      ready: state.ready,
      bind: (raw) => {
        if (viewer.closed || state.finished) {
          raw.end();
          return;
        }
        viewer.raw = raw;
        raw.writeHead(200, {
          'Content-Type': 'video/x-flv',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        for (const chunk of viewer.pending) raw.write(chunk);
        viewer.pending = [];
        viewer.pendingBytes = 0;
        raw.on('close', viewer.onClose);
        if (viewer.closed || state.finished) raw.end();
      },
      detach: () => this.detachViewer(state, viewer)
    };
  }

  shutdown(): void {
    for (const state of [...this.streams.values()]) this.stop(state);
  }

  private ensureState(streamId: string, url: string): StreamState {
    const existing = this.streams.get(streamId);
    if (existing) return existing;

    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    ready.catch(() => undefined);

    const state: StreamState = {
      id: streamId,
      url,
      fileMode: !/^rtsp:\/\//i.test(url),
      handle: null,
      parser: new FlvParser(),
      header: null,
      metadata: null,
      avcSequence: null,
      viewers: new Set(),
      ready,
      resolveReady,
      rejectReady,
      readySettled: false,
      hasData: false,
      finished: false,
      stderr: '',
      readyTimer: null,
      killTimer: null
    };
    this.streams.set(streamId, state);
    this.startProcess(state);
    return state;
  }

  private startProcess(state: StreamState): void {
    const handle = this.tools.spawnFfmpeg(state.url, state.fileMode, (chunk) => {
      state.stderr = `${state.stderr}${chunk}`.slice(-8000);
    });
    state.handle = handle;

    handle.onError((error) => {
      this.fail(state, `无法启动 ffmpeg：${error.message}`);
    });
    handle.onExit((code, signal, stderr) => {
      if (state.finished) return;
      if (stderr.trim()) state.stderr = `${state.stderr}${stderr}`.slice(-8000);
      const detail = lastLines(state.stderr || stderr);
      const reason =
        detail ||
        `ffmpeg 已退出（code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）`;
      this.fail(state, `视频流中断：${reason}`);
    });
    handle.stdout?.on('data', (chunk: Buffer) => this.handleData(state, chunk));
    handle.stdout?.on('error', (error: Error) => this.fail(state, `读取视频流失败：${error.message}`));

    state.readyTimer = setTimeout(() => {
      this.fail(state, '拉流超时（15 秒），请检查地址或摄像头是否在线');
    }, READY_TIMEOUT_MS);
    if (typeof state.readyTimer.unref === 'function') state.readyTimer.unref();
  }

  private handleData(state: StreamState, chunk: Buffer): void {
    if (state.finished) return;
    if (!state.hasData) {
      state.hasData = true;
      if (state.readyTimer) {
        clearTimeout(state.readyTimer);
        state.readyTimer = null;
      }
      if (!state.readySettled) {
        state.readySettled = true;
        state.resolveReady();
      }
    }
    try {
      state.parser.push(chunk, (tag) => this.handleTag(state, tag));
    } catch (error) {
      this.fail(state, `FLV 解析失败：${(error as Error).message}`);
    }
  }

  private handleTag(state: StreamState, tag: FlvTag): void {
    if (!state.header && state.parser.headerBytes) state.header = state.parser.headerBytes;
    if (tag.isScript && !state.metadata) state.metadata = Buffer.from(tag.raw);
    if (tag.isAvcSequenceHeader && !state.avcSequence) state.avcSequence = Buffer.from(tag.raw);

    for (const viewer of state.viewers) {
      if (viewer.closed) continue;
      if (!viewer.started) {
        if (!tag.isVideoKeyframe) continue;
        viewer.started = true;
        if (state.header) this.pushViewer(viewer, state.header);
        if (state.metadata) this.pushViewer(viewer, state.metadata);
        if (state.avcSequence) this.pushViewer(viewer, state.avcSequence);
        this.pushViewer(viewer, Buffer.from(tag.raw));
        continue;
      }
      if (tag.isAvcSequenceHeader) continue;
      this.pushViewer(viewer, Buffer.from(tag.raw));
    }
  }

  private pushViewer(viewer: Viewer, chunk: Buffer): void {
    if (viewer.closed) return;
    if (viewer.raw) {
      viewer.raw.write(chunk);
      return;
    }
    viewer.pending.push(chunk);
    viewer.pendingBytes += chunk.length;
    if (viewer.pendingBytes > MAX_PENDING_BYTES) {
      viewer.closed = true;
      viewer.pending = [];
      viewer.pendingBytes = 0;
    }
  }

  private detachViewer(state: StreamState, viewer: Viewer): void {
    if (viewer.closed && !state.viewers.has(viewer)) return;
    viewer.closed = true;
    if (viewer.raw) {
      viewer.raw.removeListener('close', viewer.onClose);
      if (!viewer.raw.writableEnded) viewer.raw.end();
    }
    state.viewers.delete(viewer);
    if (state.viewers.size === 0 && !state.finished && !state.killTimer) {
      state.killTimer = setTimeout(() => {
        state.killTimer = null;
        if (state.viewers.size === 0) this.stop(state);
      }, IDLE_KILL_MS);
      if (typeof state.killTimer.unref === 'function') state.killTimer.unref();
    }
  }

  private fail(state: StreamState, message: string): void {
    if (state.finished) return;
    state.finished = true;
    if (state.readyTimer) clearTimeout(state.readyTimer);
    if (state.killTimer) clearTimeout(state.killTimer);
    if (!state.readySettled) {
      state.readySettled = true;
      state.rejectReady(new Error(message));
    }
    for (const viewer of [...state.viewers]) {
      viewer.closed = true;
      if (viewer.raw && !viewer.raw.writableEnded) viewer.raw.end();
    }
    state.viewers.clear();
    state.handle?.kill();
    this.streams.delete(state.id);
  }

  private stop(state: StreamState): void {
    if (state.finished) return;
    state.finished = true;
    if (state.readyTimer) clearTimeout(state.readyTimer);
    if (state.killTimer) clearTimeout(state.killTimer);
    for (const viewer of [...state.viewers]) {
      viewer.closed = true;
      if (viewer.raw && !viewer.raw.writableEnded) viewer.raw.end();
    }
    state.viewers.clear();
    state.handle?.kill();
    this.streams.delete(state.id);
  }
}

export function isAllowedVideoSource(url: string, allowFile: boolean): boolean {
  if (/^rtsp:\/\//i.test(url)) return true;
  if (!allowFile) return false;
  return /^[A-Za-z]:[\\/]/.test(url) || url.startsWith('/') || url.startsWith('\\\\');
}

export async function registerVideoStream(
  prisma: PrismaClient,
  createdBy: string,
  rtspUrl: string
): Promise<{ streamId: string }> {
  const url = rtspUrl.trim();
  const allowFile = process.env.VIDEO_ALLOW_FILE === '1';
  if (!url || url.length > 2048) throw new BizError(400, '视频地址无效');
  if (!isAllowedVideoSource(url, allowFile)) {
    throw new BizError(
      400,
      allowFile ? '视频地址必须是 rtsp:// 或本地文件路径' : '视频地址必须是 rtsp:// 开头'
    );
  }
  if (!/^rtsp:\/\//i.test(url)) {
    const info = await stat(url).catch(() => null);
    if (!info?.isFile()) throw new BizError(400, '本地视频文件不存在');
  }

  const existing = await prisma.videoStream.findUnique({ where: { url } });
  if (existing) return { streamId: existing.id };
  const created = await prisma.videoStream.create({ data: { url, createdBy } });
  return { streamId: created.id };
}
