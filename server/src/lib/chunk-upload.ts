import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient, UploadSession } from '@prisma/client';
import { BizError } from './resp.js';

export const CHUNK_SIZE = 8 * 1024 * 1024;
export const UPLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 * 1024;

export interface InitUploadResult {
  uploadId: string;
  chunkSize: number;
  uploadedChunks: number[];
  resumed: boolean;
}

export interface SaveChunkResult {
  index: number;
  receivedChunks: number;
}

export function sanitizeFileName(fileName: string): string {
  const base = path.basename(String(fileName).replace(/\\/g, '/').replace(/\0/g, '')).trim();
  if (!base || base === '.' || base === '..') {
    throw new BizError(400, '文件名无效');
  }
  return base.slice(0, 200);
}

export function uploadDirectory(dataDir: string, uploadId: string): string {
  return path.join(dataDir, 'uploads', uploadId);
}

function chunkPath(dir: string, index: number): string {
  return path.join(dir, `${index}.part`);
}

export function expectedChunkSize(session: Pick<UploadSession, 'size' | 'chunkSize' | 'totalChunks'>, index: number): number {
  const size = Number(session.size);
  if (index < session.totalChunks - 1) return session.chunkSize;
  return size - session.chunkSize * (session.totalChunks - 1);
}

export async function listUploadedChunks(
  dir: string,
  totalChunks: number
): Promise<number[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const chunks: number[] = [];
  for (const name of names) {
    const match = /^(\d+)\.part$/.exec(name);
    if (!match) continue;
    const index = Number(match[1]);
    if (index < 0 || index >= totalChunks) continue;
    try {
      const info = await stat(path.join(dir, name));
      if (info.isFile() && info.size > 0) chunks.push(index);
    } catch {
      // 分片在扫描期间被删除，忽略
    }
  }
  return chunks.sort((a, b) => a - b);
}

export async function initUpload(
  prisma: PrismaClient,
  dataDir: string,
  ownerId: string,
  rawFileName: string,
  size: number
): Promise<InitUploadResult> {
  const fileName = sanitizeFileName(rawFileName);
  if (!Number.isInteger(size) || size <= 0) throw new BizError(400, '文件大小无效');
  if (size > MAX_UPLOAD_BYTES) throw new BizError(400, '文件不能超过 100GB');

  const existing = await prisma.uploadSession.findFirst({
    where: {
      ownerId,
      fileName,
      size: BigInt(size),
      status: 'uploading',
      createdAt: { gte: new Date(Date.now() - UPLOAD_EXPIRY_MS) }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (existing) {
    const dir = uploadDirectory(dataDir, existing.id);
    const uploadedChunks = await listUploadedChunks(dir, existing.totalChunks);
    await mkdir(dir, { recursive: true });
    return {
      uploadId: existing.id,
      chunkSize: existing.chunkSize,
      uploadedChunks,
      resumed: uploadedChunks.length > 0
    };
  }

  const totalChunks = Math.ceil(size / CHUNK_SIZE);
  const session = await prisma.uploadSession.create({
    data: {
      fileName,
      size: BigInt(size),
      chunkSize: CHUNK_SIZE,
      totalChunks,
      ownerId,
      status: 'uploading'
    }
  });
  await mkdir(uploadDirectory(dataDir, session.id), { recursive: true });
  return { uploadId: session.id, chunkSize: CHUNK_SIZE, uploadedChunks: [], resumed: false };
}

async function findSessionOrThrow(
  prisma: PrismaClient,
  ownerId: string,
  uploadId: string
): Promise<UploadSession> {
  const session = await prisma.uploadSession.findFirst({ where: { id: uploadId, ownerId } });
  if (!session) throw new BizError(404, '上传任务不存在');
  if (session.status !== 'uploading') throw new BizError(400, '上传任务已完成');
  return session;
}

export async function saveUploadChunk(
  prisma: PrismaClient,
  dataDir: string,
  ownerId: string,
  uploadId: string,
  index: number,
  data: Buffer
): Promise<SaveChunkResult> {
  const session = await findSessionOrThrow(prisma, ownerId, uploadId);
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
    throw new BizError(400, '分片序号无效');
  }
  if (!Buffer.isBuffer(data) || data.length === 0) throw new BizError(400, '分片内容为空');
  const expected = expectedChunkSize(session, index);
  if (data.length > expected) throw new BizError(400, '分片大小超出限制');
  if (index < session.totalChunks - 1 && data.length !== session.chunkSize) {
    throw new BizError(400, '分片大小不正确');
  }

  const dir = uploadDirectory(dataDir, session.id);
  await mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `${index}.part.tmp`);
  await writeFile(tempPath, data);
  await rename(tempPath, chunkPath(dir, index));
  const uploaded = await listUploadedChunks(dir, session.totalChunks);
  return { index, receivedChunks: uploaded.length };
}

export async function mergeUploadChunks(
  prisma: PrismaClient,
  dataDir: string,
  ownerId: string,
  uploadId: string,
  targetPath: string
): Promise<UploadSession> {
  const session = await findSessionOrThrow(prisma, ownerId, uploadId);
  const dir = uploadDirectory(dataDir, session.id);
  const missing: number[] = [];
  for (let index = 0; index < session.totalChunks; index += 1) {
    try {
      const info = await stat(chunkPath(dir, index));
      if (!info.isFile() || info.size !== expectedChunkSize(session, index)) {
        missing.push(index);
      }
    } catch {
      missing.push(index);
    }
  }
  if (missing.length > 0) {
    throw new BizError(400, `分片不完整，缺少第 ${missing.slice(0, 5).join('、')} 片`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const handle = await open(targetPath, 'w');
  try {
    for (let index = 0; index < session.totalChunks; index += 1) {
      for await (const chunk of createReadStream(chunkPath(dir, index))) {
        await handle.write(chunk as Buffer);
      }
    }
  } finally {
    await handle.close();
  }

  const merged = await stat(targetPath);
  if (merged.size !== Number(session.size)) {
    await rm(targetPath, { force: true });
    throw new BizError(400, '合并后的文件大小与声明不一致');
  }
  return session;
}

export async function finishUploadSession(
  prisma: PrismaClient,
  dataDir: string,
  uploadId: string,
  dataFileId: string
): Promise<void> {
  await prisma.uploadSession.update({
    where: { id: uploadId },
    data: { status: 'completed', dataFileId }
  });
  await rm(uploadDirectory(dataDir, uploadId), { recursive: true, force: true });
}

export async function cleanupExpiredUploads(
  prisma: PrismaClient,
  dataDir: string,
  now: Date = new Date()
): Promise<number> {
  const expired = await prisma.uploadSession.findMany({
    where: { status: 'uploading', createdAt: { lt: new Date(now.getTime() - UPLOAD_EXPIRY_MS) } },
    select: { id: true }
  });
  for (const session of expired) {
    await rm(uploadDirectory(dataDir, session.id), { recursive: true, force: true });
  }
  if (expired.length > 0) {
    await prisma.uploadSession.deleteMany({ where: { id: { in: expired.map((item) => item.id) } } });
  }
  return expired.length;
}
