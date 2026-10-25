import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { GeoTools, SpawnHandle } from '../src/lib/geo-tools.js';
import { VideoStreamManager } from '../src/services/video.js';
import { authHeaders, createTestContext, loginToken, seedUser, type TestContext } from './helpers.js';
import { envelope } from './datafile-helpers.js';
import {
  avcSequenceBody,
  buildFlv,
  buildTag,
  interFrameBody,
  keyframeBody,
  metadataBody
} from './flv-fixture.js';

function fakeRaw(): ServerResponse & { chunks: Buffer[]; statusCodeWritten: number } {
  const chunks: Buffer[] = [];
  const raw = {
    chunks,
    statusCodeWritten: 0,
    writableEnded: false,
    destroyed: false,
    writeHead(status: number) {
      this.statusCodeWritten = status;
      return this;
    },
    write(chunk: Buffer) {
      chunks.push(Buffer.from(chunk));
      return true;
    },
    end() {
      this.writableEnded = true;
    },
    on() {
      return this;
    },
    removeListener() {
      return this;
    }
  };
  return raw as unknown as ServerResponse & { chunks: Buffer[]; statusCodeWritten: number };
}

interface FakeFfmpeg {
  tools: GeoTools;
  stdout: PassThrough;
  spawnCount: () => number;
  killCount: () => number;
  failWith: (error: Error) => void;
}

function createFakeFfmpeg(): FakeFfmpeg {
  const stdout = new PassThrough();
  let spawns = 0;
  let kills = 0;
  const errorCallbacks: Array<(error: Error) => void> = [];
  const handle: SpawnHandle = {
    stdout,
    kill: () => {
      kills += 1;
    },
    onExit: () => undefined,
    onError: (callback) => errorCallbacks.push(callback)
  };
  const tools = {
    spawnFfmpeg: () => {
      spawns += 1;
      return handle;
    }
  } as unknown as GeoTools;
  return {
    tools,
    stdout,
    spawnCount: () => spawns,
    killCount: () => kills,
    failWith: (error) => {
      for (const callback of errorCallbacks.splice(0)) callback(error);
    }
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

describe('视频流管理器：多人共享一个 ffmpeg', () => {
  it('两个观看者只拉起一个进程，新观看者从下一个关键帧开始', async () => {
    const fake = createFakeFfmpeg();
    const manager = new VideoStreamManager(fake.tools);

    const first = manager.attach('s1', 'rtsp://camera/live');
    expect(fake.spawnCount()).toBe(1);
    fake.stdout.write(
      buildFlv([
        buildTag(18, metadataBody),
        buildTag(9, avcSequenceBody),
        buildTag(9, keyframeBody, 1)
      ])
    );
    await first.ready;
    const raw1 = fakeRaw();
    first.bind(raw1);
    await tick();
    expect(Buffer.concat(raw1.chunks).subarray(0, 3).toString('ascii')).toBe('FLV');

    const second = manager.attach('s1', 'rtsp://camera/live');
    expect(fake.spawnCount()).toBe(1);
    await second.ready;
    const raw2 = fakeRaw();
    second.bind(raw2);

    fake.stdout.write(buildTag(9, interFrameBody, 2));
    await tick();
    expect(raw2.chunks).toHaveLength(0);

    fake.stdout.write(buildTag(9, keyframeBody, 3));
    await tick();
    const secondData = Buffer.concat(raw2.chunks);
    expect(secondData.subarray(0, 3).toString('ascii')).toBe('FLV');
    expect(secondData.includes(buildTag(9, keyframeBody, 3))).toBe(true);

    first.detach();
    second.detach();
    expect(fake.killCount()).toBe(0);
    expect(manager.activeCount()).toBe(1);

    manager.shutdown();
    expect(fake.killCount()).toBe(1);
    expect(manager.activeCount()).toBe(0);
  });

  it('ffmpeg 启动失败时 ready 拒绝，并清理所有观看者', async () => {
    const fake = createFakeFfmpeg();
    const manager = new VideoStreamManager(fake.tools);
    const session = manager.attach('s2', 'rtsp://camera/live');
    fake.failWith(new Error('spawn ffmpeg ENOENT'));
    await expect(session.ready).rejects.toThrow('无法启动 ffmpeg');
    expect(manager.activeCount()).toBe(0);
  });
});

describe('视频注册与开放流接口', () => {
  let ctx: TestContext;
  let token: string;
  const dir = mkdtempSync(path.join(tmpdir(), 'video-test-'));
  const videoFile = path.join(dir, 'test.mp4');

  beforeAll(async () => {
    writeFileSync(videoFile, 'fake mp4');
    ctx = await createTestContext();
    await seedUser(ctx.app, { username: 'alice' });
    token = await loginToken(ctx.app, 'alice');
  });

  afterAll(async () => {
    await ctx.close();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await ctx.app.prisma.videoStream.deleteMany();
    delete process.env.VIDEO_ALLOW_FILE;
    delete process.env.FFMPEG_PATH;
  });

  afterEach(() => {
    delete process.env.VIDEO_ALLOW_FILE;
    delete process.env.FFMPEG_PATH;
  });

  it('默认只允许 rtsp:// 地址', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/video/register',
      headers: authHeaders(token),
      payload: { rtspUrl: 'http://camera/live' }
    });
    const body = envelope(response);
    expect(body.code).toBe(400);
    expect(body.msg).toContain('rtsp://');
  });

  it('开发模式下允许本地文件，同一地址复用 streamId', async () => {
    process.env.VIDEO_ALLOW_FILE = '1';
    const first = envelope<{ streamId: string }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/video/register',
        headers: authHeaders(token),
        payload: { rtspUrl: videoFile }
      })
    );
    expect(first.code).toBe(200);
    const second = envelope<{ streamId: string }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/video/register',
        headers: authHeaders(token),
        payload: { rtspUrl: videoFile }
      })
    );
    expect(second.data.streamId).toBe(first.data.streamId);

    const missing = envelope(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/video/register',
        headers: authHeaders(token),
        payload: { rtspUrl: path.join(dir, 'nope.mp4') }
      })
    );
    expect(missing.code).toBe(400);
  });

  it('ffmpeg 不存在时开放流返回 502 与文字原因', async () => {
    process.env.VIDEO_ALLOW_FILE = '1';
    const registered = envelope<{ streamId: string }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/video/register',
        headers: authHeaders(token),
        payload: { rtspUrl: videoFile }
      })
    );
    process.env.FFMPEG_PATH = path.join(dir, 'missing-ffmpeg');
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/open/video/${registered.data.streamId}.flv`
    });
    expect(response.statusCode).toBe(502);
    expect(response.body).toContain('无法启动 ffmpeg');
  });

  it('未知 streamId 返回 404', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/open/video/not-exists.flv'
    });
    expect(response.statusCode).toBe(404);
  });
});
