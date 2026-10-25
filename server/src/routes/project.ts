import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MAX_BODY_BYTES } from '../config.js';
import { isFileTooLargeError } from '../lib/multipart.js';
import { BizError, ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import { saveProjectImage } from '../services/file.js';
import {
  copyProject,
  createProject,
  deleteProjects,
  editProject,
  getProjectData,
  listProjects,
  saveProjectContent,
  setProjectState,
  sortProjects,
  VersionConflictError
} from '../services/project.js';
import { ALL_ROLES } from '../types.js';

const listQuerySchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: 'page 必须为数字' })
    .int('page 必须为整数')
    .min(1, 'page 必须大于 0')
    .default(1),
  limit: z.coerce
    .number({ invalid_type_error: 'limit 必须为数字' })
    .int('limit 必须为整数')
    .min(1, 'limit 必须大于 0')
    .max(100, 'limit 不能超过 100')
    .default(10),
  scope: z.enum(['mine', 'team', 'all'], {
    errorMap: () => ({ message: 'scope 只能为 mine、team 或 all' })
  }).optional(),
  teamId: z.string().trim().min(1).optional()
});

const projectNameSchema = z
  .string({ required_error: '项目名称不能为空' })
  .trim()
  .min(1, '项目名称不能为空')
  .max(50, '项目名称不能超过 50 个字符');

const remarksSchema = z.string().max(2000, '备注不能超过 2000 个字符');
const indexImageSchema = z.string().max(2048, '封面地址不能超过 2048 个字符');

const createProjectSchema = z.object({
  projectName: projectNameSchema,
  remarks: remarksSchema.optional(),
  indexImage: indexImageSchema.optional(),
  teamId: z.string().trim().min(1, 'teamId 不能为空').optional()
});

const idSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空')
});

const getDataQuerySchema = z.object({
  projectId: z
    .string({ required_error: 'projectId 不能为空' })
    .min(1, 'projectId 不能为空')
});

const saveDataSchema = z.object({
  projectId: z
    .string({ required_error: 'projectId 不能为空' })
    .min(1, 'projectId 不能为空'),
  content: z.string({ required_error: 'content 不能为空' }),
  version: z.coerce
    .number({ invalid_type_error: 'version 必须为数字' })
    .int('version 必须为整数')
    .min(0, 'version 不能为负数')
    .optional(),
  force: z.coerce.number().int().optional()
});

const editProjectSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  projectName: projectNameSchema.optional(),
  indexImage: indexImageSchema.optional(),
  remarks: remarksSchema.optional()
});

const deleteQuerySchema = z.object({
  ids: z.string({ required_error: 'ids 不能为空' }).min(1, 'ids 不能为空')
});

const publishSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  state: z
    .number({ invalid_type_error: 'state 只能为 1 或 -1' })
    .refine((value) => value === 1 || value === -1, 'state 只能为 1 或 -1')
});

const sortSchema = z.object({
  ids: z
    .array(z.string().min(1), { required_error: 'ids 不能为空' })
    .max(1000, '一次最多排序 1000 个项目')
});

async function readSaveBody(request: FastifyRequest): Promise<Record<string, unknown>> {
  if (!request.isMultipart()) {
    return (request.body ?? {}) as Record<string, unknown>;
  }

  const fields: Record<string, unknown> = {};
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      part.file.resume();
      continue;
    }
    fields[part.fieldname] = part.value;
  }
  return fields;
}

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/project/list', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(listQuerySchema, request.query);
    const { data, count } = await listProjects(fastify.prisma, request.currentUser!, query);
    return ok(data, { count });
  });

  fastify.post('/project/create', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(createProjectSchema, request.body);
    const created = await createProject(fastify.prisma, request.currentUser!, input);
    return ok(created);
  });

  fastify.get('/project/getData', { config: { auth: 'public' } }, async (request) => {
    const query = parseInput(getDataQuerySchema, request.query);
    const data = await getProjectData(
      fastify.prisma,
      request.currentUser,
      query.projectId
    );
    return ok(data);
  });

  fastify.post(
    '/project/save/data',
    { config: { auth: ALL_ROLES } },
    async (request) => {
      const rawBody = await readSaveBody(request);
      const input = parseInput(saveDataSchema, rawBody);
      if (Buffer.byteLength(input.content, 'utf8') > MAX_BODY_BYTES) {
        throw new BizError(400, 'content 不能超过 50MB');
      }
      try {
        const result = await saveProjectContent(
          fastify.prisma,
          request.currentUser!,
          input.projectId,
          input.content,
          { version: input.version, force: input.force === 1 }
        );
        return ok(result);
      } catch (error) {
        if (error instanceof VersionConflictError) {
          return { code: error.code, msg: error.message, data: error.data };
        }
        throw error;
      }
    }
  );

  fastify.post('/project/edit', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(editProjectSchema, request.body);
    await editProject(fastify.prisma, request.currentUser!, input);
    return ok({});
  });

  fastify.delete('/project/delete', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(deleteQuerySchema, request.query);
    const ids = [
      ...new Set(
        query.ids
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ];
    if (ids.length === 0) throw new BizError(400, 'ids 不能为空');
    await deleteProjects(fastify.prisma, request.currentUser!, ids);
    return ok({});
  });

  fastify.put('/project/publish', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(publishSchema, request.body);
    await setProjectState(fastify.prisma, request.currentUser!, input.id, input.state as 1 | -1);
    return ok({});
  });

  fastify.post('/project/upload', { config: { auth: ALL_ROLES } }, async (request) => {
    if (!request.isMultipart()) {
      throw new BizError(400, '请使用 multipart/form-data 上传图片');
    }

    let uploaded: Awaited<ReturnType<typeof request.file>>;
    try {
      uploaded = await request.file();
    } catch (error) {
      if (isFileTooLargeError(error)) {
        throw new BizError(400, '图片大小不能超过 10MB');
      }
      throw new BizError(400, '上传内容解析失败');
    }

    if (!uploaded || uploaded.fieldname !== 'object') {
      uploaded?.file.resume();
      throw new BizError(400, '请上传字段名为 object 的图片文件');
    }

    let buffer: Buffer;
    try {
      buffer = await uploaded.toBuffer();
    } catch (error) {
      if (isFileTooLargeError(error)) {
        throw new BizError(400, '图片大小不能超过 10MB');
      }
      throw error;
    }

    if (uploaded.file.truncated) {
      throw new BizError(400, '图片大小不能超过 10MB');
    }

    const result = await saveProjectImage(
      fastify.config.dataDir,
      buffer,
      uploaded.filename,
      uploaded.mimetype
    );
    return ok(result);
  });

  fastify.post('/project/copy', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(idSchema, request.body);
    const result = await copyProject(fastify.prisma, request.currentUser!, input.id);
    return ok(result);
  });

  fastify.put('/project/sort', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(sortSchema, request.body);
    await sortProjects(fastify.prisma, request.currentUser!, input.ids);
    return ok({});
  });
};

export default projectRoutes;
