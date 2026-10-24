import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MAX_IMPORT_BYTES } from '../config.js';
import { isFileTooLargeError } from '../lib/multipart.js';
import { BizError, ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import {
  createUser,
  editUser,
  importUsersFromCsv,
  listUsers,
  resetUserPassword
} from '../services/user.js';

const roleSchema = z.enum(['admin', 'teacher', 'student'], {
  errorMap: () => ({ message: '角色必须为 admin、teacher 或 student' })
});

const usernameSchema = z
  .string({ required_error: '用户名不能为空' })
  .trim()
  .min(4, '用户名需为 4~32 位字母、数字或下划线')
  .max(32, '用户名需为 4~32 位字母、数字或下划线')
  .regex(/^[A-Za-z0-9_]+$/, '用户名需为 4~32 位字母、数字或下划线');

const nicknameSchema = z
  .string({ required_error: '姓名不能为空' })
  .trim()
  .min(1, '姓名不能为空')
  .max(50, '姓名不能超过 50 个字符');

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
  keyword: z.string().trim().max(50, 'keyword 不能超过 50 个字符').default('')
});

const createUserSchema = z.object({
  username: usernameSchema,
  nickname: nicknameSchema,
  role: roleSchema,
  password: z.string().optional()
});

const editUserSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  nickname: nicknameSchema.optional(),
  role: roleSchema.optional(),
  disabled: z.boolean({ invalid_type_error: 'disabled 必须为布尔值' }).optional()
});

const idSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空')
});

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/user/list', { config: { auth: ['admin'] } }, async (request) => {
    const query = parseInput(listQuerySchema, request.query);
    const { data, count } = await listUsers(fastify.prisma, query);
    return ok(data, { count });
  });

  fastify.post('/user/create', { config: { auth: ['admin'] } }, async (request) => {
    const input = parseInput(createUserSchema, request.body);
    const created = await createUser(fastify.prisma, input);
    return ok(created);
  });

  fastify.post('/user/edit', { config: { auth: ['admin'] } }, async (request) => {
    const input = parseInput(editUserSchema, request.body);
    await editUser(fastify.prisma, request.currentUser!.id, input);
    return ok({});
  });

  fastify.post(
    '/user/resetPassword',
    { config: { auth: ['admin'] } },
    async (request) => {
      const input = parseInput(idSchema, request.body);
      const result = await resetUserPassword(fastify.prisma, input.id);
      return ok(result);
    }
  );

  fastify.post('/user/import', { config: { auth: ['admin'] } }, async (request) => {
    let uploaded: Awaited<ReturnType<typeof request.file>>;
    try {
      uploaded = await request.file({
        limits: { fileSize: MAX_IMPORT_BYTES + 1, files: 1 }
      });
    } catch (error) {
      if (isFileTooLargeError(error)) {
        throw new BizError(400, 'CSV 文件不能超过 1MB');
      }
      throw new BizError(400, '请使用 multipart/form-data 上传 CSV 文件');
    }

    if (!uploaded || uploaded.fieldname !== 'file') {
      uploaded?.file.resume();
      throw new BizError(400, '请上传字段名为 file 的 CSV 文件');
    }

    let buffer: Buffer;
    try {
      buffer = await uploaded.toBuffer();
    } catch (error) {
      if (isFileTooLargeError(error)) {
        throw new BizError(400, 'CSV 文件不能超过 1MB');
      }
      throw error;
    }

    if (uploaded.file.truncated || buffer.byteLength > MAX_IMPORT_BYTES) {
      throw new BizError(400, 'CSV 文件不能超过 1MB');
    }

    const results = await importUsersFromCsv(fastify.prisma, buffer.toString('utf8'));
    return ok(results);
  });
};

export default userRoutes;
