import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CHUNK_SIZE, cleanupExpiredUploads, initUpload, saveUploadChunk } from '../lib/chunk-upload.js';
import { geoTools } from '../lib/geo-tools.js';
import { BizError, ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import {
  deleteDataFiles,
  getDataFile,
  listDataFiles,
  normalizeSrs,
  resetDataFileForRetry
} from '../services/datafile.js';
import { getSupportedFormats } from '../services/datafile-formats.js';
import { createDataFileQueue } from '../services/datafile-queue.js';
import { completeUploadToDataFile } from '../services/datafile-upload.js';
import { ALL_ROLES } from '../types.js';

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  kind: z.enum(['vector', 'raster', 'pointcloud', 'tiles3d']).optional(),
  status: z.enum(['pending', 'converting', 'success', 'failed']).optional(),
  keyword: z.string().max(100).optional()
});

const initSchema = z.object({
  fileName: z.string({ required_error: 'fileName 不能为空' }).min(1, 'fileName 不能为空').max(255),
  size: z
    .number({ invalid_type_error: 'size 必须为数字' })
    .int('size 必须为整数')
    .positive('size 必须大于 0')
});

const chunkQuerySchema = z.object({
  uploadId: z.string({ required_error: 'uploadId 不能为空' }).min(1, 'uploadId 不能为空'),
  index: z.coerce.number({ invalid_type_error: 'index 必须为数字' }).int('index 必须为整数').min(0)
});

const completeSchema = z.object({
  uploadId: z.string({ required_error: 'uploadId 不能为空' }).min(1, 'uploadId 不能为空'),
  srs: z.string().max(64).optional()
});

const idQuerySchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空')
});

const deleteQuerySchema = z.object({
  ids: z.string({ required_error: 'ids 不能为空' }).min(1, 'ids 不能为空')
});

const retrySchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  srs: z.string().max(64).optional()
});

function parseIds(raw: string): string[] {
  return [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))];
}

const datafileRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  const queue = createDataFileQueue(fastify.prisma, fastify.config.dataDir, geoTools);
  const cleanupTimer = setInterval(() => {
    void cleanupExpiredUploads(fastify.prisma, fastify.config.dataDir).catch((error) => {
      fastify.log.warn({ err: error }, '清理过期上传失败');
    });
  }, 60 * 60 * 1000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  fastify.addHook('onReady', async () => {
    await cleanupExpiredUploads(fastify.prisma, fastify.config.dataDir).catch(() => undefined);
    await queue.start();
  });
  fastify.addHook('onClose', async () => {
    clearInterval(cleanupTimer);
    queue.stop();
  });

  fastify.post('/datafile/upload/init', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(initSchema, request.body);
    const result = await initUpload(
      fastify.prisma,
      fastify.config.dataDir,
      request.currentUser!.id,
      input.fileName,
      input.size
    );
    return ok(result);
  });

  fastify.put(
    '/datafile/upload/chunk',
    { config: { auth: ALL_ROLES }, bodyLimit: CHUNK_SIZE + 1024 * 1024 },
    async (request) => {
      const query = parseInput(chunkQuerySchema, request.query);
      if (!Buffer.isBuffer(request.body)) {
        throw new BizError(400, '请使用 application/octet-stream 上传分片');
      }
      const result = await saveUploadChunk(
        fastify.prisma,
        fastify.config.dataDir,
        request.currentUser!.id,
        query.uploadId,
        query.index,
        request.body
      );
      return ok(result);
    }
  );

  fastify.post('/datafile/upload/complete', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(completeSchema, request.body);
    const srs = normalizeSrs(input.srs);
    const result = await completeUploadToDataFile(
      fastify.prisma,
      fastify.config.dataDir,
      request.currentUser!.id,
      input.uploadId,
      srs
    );
    queue.enqueue(result.id);
    return ok(result);
  });

  fastify.get('/datafile/list', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(pageQuerySchema, request.query);
    const { data, count } = await listDataFiles(fastify.prisma, request.currentUser!, {
      ...query,
      keyword: query.keyword || undefined,
      kind: query.kind || undefined,
      status: query.status || undefined
    });
    return ok(data, { count });
  });

  fastify.get('/datafile/detail', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(idQuerySchema, request.query);
    const data = await getDataFile(fastify.prisma, request.currentUser!, query.id);
    return ok(data);
  });

  fastify.delete('/datafile/delete', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(deleteQuerySchema, request.query);
    const ids = parseIds(query.ids);
    if (ids.length === 0) throw new BizError(400, 'ids 不能为空');
    await deleteDataFiles(fastify.prisma, request.currentUser!, fastify.config.dataDir, ids);
    return ok({});
  });

  fastify.post('/datafile/retry', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(retrySchema, request.body);
    const srs = normalizeSrs(input.srs);
    await resetDataFileForRetry(fastify.prisma, request.currentUser!, input.id, srs);
    queue.enqueue(input.id);
    return ok({});
  });

  fastify.get('/datafile/formats', { config: { auth: ALL_ROLES } }, async () => {
    return ok(await getSupportedFormats(geoTools));
  });
};

export default datafileRoutes;
