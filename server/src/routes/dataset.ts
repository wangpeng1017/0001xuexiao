import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BizError, fail, ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import {
  createDataset,
  deleteDatasets,
  editDataset,
  listDatasets,
  testDataset
} from '../services/dataset.js';
import { DatasetOpenService } from '../services/dataset-open.js';
import { ALL_ROLES } from '../types.js';

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  keyword: z.string().max(100).optional()
});

const nameSchema = z
  .string({ required_error: '名称不能为空' })
  .trim()
  .min(1, '名称不能为空')
  .max(50, '名称不能超过 50 个字符');

const createSchema = z.object({
  name: nameSchema,
  type: z.enum(['http', 'mysql'], { required_error: '类型不能为空' }),
  config: z.record(z.unknown(), { required_error: 'config 不能为空' })
});

const editSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  name: nameSchema.optional(),
  config: z.record(z.unknown()).optional()
});

const deleteQuerySchema = z.object({
  ids: z.string({ required_error: 'ids 不能为空' }).min(1, 'ids 不能为空')
});

const testSchema = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({ type: z.enum(['http', 'mysql']), config: z.record(z.unknown()) })
]);

const openParamsSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空')
});

function parseIds(raw: string): string[] {
  return [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))];
}

const datasetRoutes: FastifyPluginAsync = async (fastify) => {
  const openService = new DatasetOpenService();

  fastify.get('/dataset/list', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(pageQuerySchema, request.query);
    const { data, count } = await listDatasets(fastify.prisma, request.currentUser!, fastify.config.jwtSecret, {
      ...query,
      keyword: query.keyword || undefined
    });
    return ok(data, { count });
  });

  fastify.post('/dataset/create', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(createSchema, request.body);
    const result = await createDataset(
      fastify.prisma,
      request.currentUser!,
      fastify.config.jwtSecret,
      input
    );
    return ok(result);
  });

  fastify.post('/dataset/edit', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(editSchema, request.body);
    await editDataset(fastify.prisma, request.currentUser!, fastify.config.jwtSecret, input);
    openService.invalidate(input.id);
    return ok({});
  });

  fastify.delete('/dataset/delete', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(deleteQuerySchema, request.query);
    const ids = parseIds(query.ids);
    if (ids.length === 0) throw new BizError(400, 'ids 不能为空');
    await deleteDatasets(fastify.prisma, request.currentUser!, ids);
    for (const id of ids) openService.invalidate(id);
    return ok({});
  });

  fastify.post('/dataset/test', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(testSchema, request.body);
    const result = await testDataset(
      fastify.prisma,
      request.currentUser!,
      fastify.config.jwtSecret,
      input as { id?: string; type?: string; config?: unknown }
    );
    return ok(result.data, { truncated: result.truncated });
  });

  fastify.get('/open/dataset/:id/data', { config: { auth: 'public' } }, async (request, reply) => {
    if (!openService.checkRate(request.ip)) {
      return reply.status(200).send(fail(429, '请求过于频繁，请稍后再试'));
    }
    const params = parseInput(openParamsSchema, request.params);
    const data = await openService.getData(fastify.prisma, fastify.config.jwtSecret, params.id);
    return ok(data);
  });
};

export default datasetRoutes;
