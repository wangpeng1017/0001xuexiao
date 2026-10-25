import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import {
  createProjectFromTemplate,
  listTemplates,
  setProjectTemplate
} from '../services/template.js';
import { ALL_ROLES } from '../types.js';

const categorySchema = z.enum(['campus', 'device', 'data', 'other'], {
  errorMap: () => ({ message: '模板分类不合法' })
});

const setTemplateSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  isTemplate: z.boolean({ required_error: 'isTemplate 不能为空' }),
  templateCategory: categorySchema.optional()
});

const templatesQuerySchema = z.object({
  category: categorySchema.optional()
});

const createFromTemplateSchema = z.object({
  templateId: z
    .string({ required_error: 'templateId 不能为空' })
    .min(1, 'templateId 不能为空'),
  projectName: z
    .string({ required_error: '项目名称不能为空' })
    .trim()
    .min(1, '项目名称不能为空')
    .max(50, '项目名称不能超过 50 个字符'),
  teamId: z.string().trim().min(1, 'teamId 不能为空').optional()
});

const templateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/project/setTemplate',
    { config: { auth: ['admin', 'teacher'] } },
    async (request) => {
      const input = parseInput(setTemplateSchema, request.body);
      await setProjectTemplate(fastify.prisma, request.currentUser!, input);
      return ok({});
    }
  );

  fastify.get('/project/templates', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(templatesQuerySchema, request.query);
    const data = await listTemplates(fastify.prisma, query.category);
    return ok(data);
  });

  fastify.post(
    '/project/createFromTemplate',
    { config: { auth: ALL_ROLES } },
    async (request) => {
      const input = parseInput(createFromTemplateSchema, request.body);
      const data = await createProjectFromTemplate(fastify.prisma, request.currentUser!, input);
      return ok(data);
    }
  );
};

export default templateRoutes;
