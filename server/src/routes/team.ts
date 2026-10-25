import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import {
  addTeamMembers,
  createTeam,
  deleteTeam,
  editTeam,
  getTeamDetail,
  listTeams,
  listUserOptions,
  removeTeamMember
} from '../services/team.js';
import { ALL_ROLES } from '../types.js';

const teamNameSchema = z
  .string({ required_error: '团队名称不能为空' })
  .trim()
  .min(1, '团队名称不能为空')
  .max(50, '团队名称不能超过 50 个字符');

const idSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空')
});

const createTeamSchema = z.object({
  name: teamNameSchema,
  leaderId: z.string().min(1, 'leaderId 不能为空').optional()
});

const editTeamSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  name: teamNameSchema.optional(),
  leaderId: z.string().min(1, 'leaderId 不能为空').optional()
});

const addMembersSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  userIds: z
    .array(z.string().min(1), { required_error: 'userIds 不能为空' })
    .min(1, '请选择要添加的成员')
});

const removeMemberSchema = z.object({
  id: z.string({ required_error: 'id 不能为空' }).min(1, 'id 不能为空'),
  userId: z.string({ required_error: 'userId 不能为空' }).min(1, 'userId 不能为空')
});

const optionsQuerySchema = z.object({
  keyword: z.string().trim().max(50, 'keyword 不能超过 50 个字符').default('')
});

const teamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/team/list', { config: { auth: ALL_ROLES } }, async (request) => {
    const data = await listTeams(fastify.prisma, request.currentUser!);
    return ok(data);
  });

  fastify.get('/team/detail', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(idSchema, request.query);
    const data = await getTeamDetail(fastify.prisma, request.currentUser!, query.id);
    return ok(data);
  });

  fastify.post(
    '/team/create',
    { config: { auth: ['admin', 'teacher'] } },
    async (request) => {
      const input = parseInput(createTeamSchema, request.body);
      const data = await createTeam(fastify.prisma, request.currentUser!, input);
      return ok(data);
    }
  );

  fastify.post('/team/edit', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(editTeamSchema, request.body);
    await editTeam(fastify.prisma, request.currentUser!, input);
    return ok({});
  });

  fastify.delete('/team/delete', { config: { auth: ALL_ROLES } }, async (request) => {
    const query = parseInput(idSchema, request.query);
    await deleteTeam(fastify.prisma, request.currentUser!, query.id);
    return ok({});
  });

  fastify.post(
    '/team/addMembers',
    { config: { auth: ALL_ROLES } },
    async (request) => {
      const input = parseInput(addMembersSchema, request.body);
      await addTeamMembers(fastify.prisma, request.currentUser!, input.id, input.userIds);
      return ok({});
    }
  );

  fastify.post(
    '/team/removeMember',
    { config: { auth: ALL_ROLES } },
    async (request) => {
      const input = parseInput(removeMemberSchema, request.body);
      await removeTeamMember(fastify.prisma, request.currentUser!, input.id, input.userId);
      return ok({});
    }
  );

  fastify.get(
    '/user/options',
    { config: { auth: ['admin', 'teacher'] } },
    async (request) => {
      const query = parseInput(optionsQuerySchema, request.query);
      const data = await listUserOptions(fastify.prisma, query.keyword);
      return ok(data);
    }
  );
};

export default teamRoutes;
