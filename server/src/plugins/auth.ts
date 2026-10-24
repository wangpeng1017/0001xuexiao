import type { PrismaClient, User } from '@prisma/client';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { BizError } from '../lib/resp.js';
import type { TokenService } from '../lib/jwt.js';
import {
  isRole,
  type AuthRequirement,
  type AuthRouteRecord,
  type AuthUser
} from '../types.js';

interface AuthPluginOptions {
  prisma: PrismaClient;
  tokens: TokenService;
}

function readBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const spaceIndex = header.indexOf(' ');
  if (spaceIndex < 0) return null;
  const scheme = header.slice(0, spaceIndex);
  const token = header.slice(spaceIndex + 1).trim();
  if (scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function toAuthUser(user: User): AuthUser | null {
  if (!isRole(user.role)) return null;
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    disabled: user.disabled,
    mustChangePwd: user.mustChangePwd
  };
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (fastify, options) => {
  fastify.decorate('authRouteRecords', [] as AuthRouteRecord[]);
  fastify.decorateRequest('currentUser', null);

  fastify.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const declaredMethods = methods.filter(
      (method) => method !== 'HEAD' && method !== 'OPTIONS'
    );
    if (declaredMethods.length === 0) return;

    const auth = route.config?.auth;
    for (const method of declaredMethods) {
      fastify.authRouteRecords.push({ method, url: route.url, auth });
      if (route.url.startsWith('/api/') && auth === undefined) {
        throw new Error(`路由 ${method} ${route.url} 未声明 config.auth`);
      }
    }
  });

  fastify.addHook('preHandler', async (request) => {
    const auth: AuthRequirement | undefined = request.routeOptions.config?.auth;
    if (auth === undefined) return;

    const token = readBearerToken(request);
    let matchedUser: AuthUser | null = null;
    let tokenVerified = false;

    if (token) {
      const verified = await options.tokens.verify(token);
      if (verified) {
        tokenVerified = true;
        const dbUser = await options.prisma.user.findUnique({ where: { id: verified.sub } });
        if (dbUser && !dbUser.disabled) {
          matchedUser = toAuthUser(dbUser);
        }
      }
    }

    const path = request.url.split('?')[0] ?? '';
    const isSysRoute = path.startsWith('/api/goview/sys/');

    if (auth === 'public') {
      if (matchedUser && matchedUser.mustChangePwd && !isSysRoute) {
        throw new BizError(887, '请先修改密码');
      }
      request.currentUser = matchedUser;
      return;
    }

    if (!matchedUser) {
      throw new BizError(
        886,
        tokenVerified ? '账号已被禁用或不存在' : '未登录或登录已过期'
      );
    }

    if (!auth.includes(matchedUser.role)) {
      throw new BizError(403, '无权限');
    }

    if (matchedUser.mustChangePwd && !isSysRoute) {
      throw new BizError(887, '请先修改密码');
    }

    request.currentUser = matchedUser;
  });
};

export default fp(authPlugin, { name: 'auth-plugin' });
