import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import { changeOwnPassword, loginUser, toUserinfo } from '../services/sys.js';
import { ALL_ROLES } from '../types.js';

const loginSchema = z.object({
  username: z.string({ required_error: '用户名不能为空' }).trim().min(1, '用户名不能为空'),
  password: z.string({ required_error: '密码不能为空' }).min(1, '密码不能为空')
});

const changePasswordSchema = z.object({
  oldPassword: z.string({ required_error: '原密码不能为空' }).min(1, '原密码不能为空'),
  newPassword: z.string({ required_error: '新密码不能为空' }).min(1, '新密码不能为空')
});

const sysRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/sys/login', { config: { auth: 'public' } }, async (request) => {
    const input = parseInput(loginSchema, request.body);
    const user = await loginUser(fastify.prisma, input.username, input.password);
    const token = await fastify.tokens.sign({
      id: user.id,
      username: user.username,
      role: user.role
    });
    return ok({
      token: {
        tokenName: 'Authorization',
        tokenValue: `Bearer ${token}`
      },
      userinfo: toUserinfo(user)
    });
  });

  fastify.get('/sys/logout', { config: { auth: ALL_ROLES } }, async () => ok({}));

  fastify.get('/sys/getOssInfo', { config: { auth: 'public' } }, async () =>
    ok({ bucketURL: '' })
  );

  fastify.get('/sys/me', { config: { auth: ALL_ROLES } }, async (request) =>
    ok(toUserinfo(request.currentUser!))
  );

  fastify.post(
    '/sys/changePassword',
    { config: { auth: ALL_ROLES } },
    async (request) => {
      const input = parseInput(changePasswordSchema, request.body);
      await changeOwnPassword(
        fastify.prisma,
        request.currentUser!.id,
        input.oldPassword,
        input.newPassword
      );
      return ok({});
    }
  );
};

export default sysRoutes;
