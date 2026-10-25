import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isFileTooLargeError } from '../lib/multipart.js';
import { BizError, ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import {
  deleteMaterials,
  listMaterials,
  MAX_MATERIAL_BYTES,
  saveMaterialThumb,
  uploadMaterial
} from '../services/material.js';
import { ALL_ROLES } from '../types.js';

interface MultipartFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

const categorySchema = z.enum(['model', 'map', 'image2d'], {
  errorMap: () => ({ message: 'category 只能为 model、map 或 image2d' })
});
const scopeSchema = z.enum(['public', 'private'], {
  errorMap: () => ({ message: 'scope 只能为 public 或 private' })
});

const listQuerySchema = z.object({
  category: categorySchema.optional(),
  scope: scopeSchema.optional(),
  keyword: z.string().trim().max(50, 'keyword 不能超过 50 个字符').default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const uploadFieldsSchema = z.object({
  category: categorySchema,
  name: z
    .string({ required_error: '素材名称不能为空' })
    .trim()
    .min(1, '素材名称不能为空')
    .max(100, '素材名称不能超过 100 个字符'),
  scope: scopeSchema.default('private')
});

const deleteQuerySchema = z.object({
  ids: z.string({ required_error: 'ids 不能为空' }).min(1, 'ids 不能为空')
});

const idQuerySchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空')
});

async function readMultipart(
  request: FastifyRequest,
  fieldName: string,
  maxBytes: number,
  tooLargeMessage: string
): Promise<{ fields: Record<string, string>; file: MultipartFile | null }> {
  if (!request.isMultipart()) {
    throw new BizError(400, '请使用 multipart/form-data 上传');
  }

  const fields: Record<string, string> = {};
  let file: MultipartFile | null = null;
  try {
    for await (const part of request.parts({
      limits: { fileSize: maxBytes + 1, files: 5, fields: 20 }
    })) {
      if (part.type === 'file') {
        if (part.fieldname === fieldName && !file) {
          const buffer = await part.toBuffer();
          if (part.file.truncated || buffer.byteLength > maxBytes) {
            throw new BizError(400, tooLargeMessage);
          }
          file = { buffer, filename: part.filename, mimetype: part.mimetype };
        } else {
          part.file.resume();
        }
        continue;
      }
      fields[part.fieldname] = String(part.value);
    }
  } catch (error) {
    if (isFileTooLargeError(error)) throw new BizError(400, tooLargeMessage);
    throw error;
  }

  return { fields, file };
}

const materialRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/material/list', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(listQuerySchema, request.query);
    const { data, count } = await listMaterials(fastify.prisma, request.currentUser!, query);
    return ok(data, { count });
  });

  fastify.post('/material/upload', { config: { auth: ALL_ROLES } }, async (request) => {
    const { fields, file } = await readMultipart(
      request,
      'file',
      MAX_MATERIAL_BYTES,
      '素材文件不能超过 200MB'
    );
    if (!file) throw new BizError(400, '请上传字段名为 file 的文件');

    const input = parseInput(uploadFieldsSchema, fields);
    const data = await uploadMaterial(fastify.prisma, request.currentUser!, fastify.config.dataDir, {
      ...input,
      filename: file.filename,
      buffer: file.buffer
    });
    return ok(data);
  });

  fastify.post('/material/thumb', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(idQuerySchema, request.query);
    const { file } = await readMultipart(
      request,
      'file',
      10 * 1024 * 1024,
      '缩略图不能超过 10MB'
    );
    if (!file) throw new BizError(400, '请上传字段名为 file 的缩略图');
    const data = await saveMaterialThumb(
      fastify.prisma,
      request.currentUser!,
      fastify.config.dataDir,
      query.id,
      file.buffer,
      file.filename
    );
    return ok(data);
  });

  fastify.delete('/material/delete', { config: { auth: ALL_ROLES } }, async (request) => {
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
    await deleteMaterials(fastify.prisma, request.currentUser!, fastify.config.dataDir, ids);
    return ok({});
  });
};

export default materialRoutes;
