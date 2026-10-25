import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  finishUploadSession,
  mergeUploadChunks,
  uploadDirectory
} from '../lib/chunk-upload.js';
import { BizError } from '../lib/resp.js';
import { dataFileDirectory, formatFromFileName } from './datafile.js';

export async function completeUploadToDataFile(
  prisma: PrismaClient,
  dataDir: string,
  ownerId: string,
  uploadId: string,
  srs?: string
): Promise<{ id: string }> {
  const session = await prisma.uploadSession.findFirst({ where: { id: uploadId, ownerId } });
  if (!session) throw new BizError(404, '上传任务不存在');
  if (session.status !== 'uploading') throw new BizError(400, '上传任务已完成');

  const mergedDir = path.join(uploadDirectory(dataDir, session.id), 'merged');
  const mergedPath = path.join(mergedDir, session.fileName);
  try {
    await mergeUploadChunks(prisma, dataDir, ownerId, uploadId, mergedPath);
  } catch (error) {
    await rm(mergedDir, { recursive: true, force: true });
    throw error;
  }

  const id = randomUUID();
  const sourceDir = path.join(dataFileDirectory(dataDir, id), 'source');
  const storedPath = path.join(sourceDir, session.fileName);
  await mkdir(sourceDir, { recursive: true });
  let fileId: string;
  try {
    await rename(mergedPath, storedPath);
    const file = await prisma.dataFile.create({
      data: {
        id,
        name: session.fileName,
        originFormat: formatFromFileName(session.fileName),
        kind: '',
        status: 'pending',
        progress: 0,
        errorMsg: '',
        srs: srs ?? null,
        outputUrl: '',
        storedPath,
        size: session.size,
        ownerId
      }
    });
    fileId = file.id;
  } catch (error) {
    await rm(dataFileDirectory(dataDir, id), { recursive: true, force: true });
    throw error;
  }
  await finishUploadSession(prisma, dataDir, uploadId, fileId).catch(() => undefined);
  return { id: fileId };
}
