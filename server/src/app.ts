import { mkdirSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { loadConfig, MAX_BODY_BYTES, type AppConfig } from './config.js';
import { createTokenService } from './lib/jwt.js';
import { BizError, fail } from './lib/resp.js';
import authPlugin from './plugins/auth.js';
import materialRoutes from './routes/material.js';
import datafileRoutes from './routes/datafile.js';
import datasetRoutes from './routes/dataset.js';
import healthRoutes from './routes/health.js';
import projectRoutes from './routes/project.js';
import staticRoutes from './routes/static.js';
import sysRoutes from './routes/sys.js';
import teamRoutes from './routes/team.js';
import templateRoutes from './routes/template.js';
import userRoutes from './routes/user.js';
import videoRoutes from './routes/video.js';

export interface BuildAppOptions {
  config?: Partial<AppConfig>;
  logger?: boolean;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function errorStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = loadConfig(options.config);
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: MAX_BODY_BYTES
  });
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });

  mkdirSync(config.dataDir, { recursive: true });

  app.decorate('config', config);
  app.decorate('prisma', prisma);
  app.decorate('tokens', createTokenService(config.jwtSecret));
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof BizError) {
      return reply.status(200).send(fail(error.code, error.message));
    }

    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return reply.status(200).send(fail(400, issue?.message ?? '参数错误'));
    }

    const code = errorCode(error);
    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE' || code === 'FST_REQ_FILE_TOO_LARGE') {
      request.log.warn({ err: error }, 'request body too large');
      return reply.status(200).send(fail(400, '请求内容过大'));
    }

    const statusCode = errorStatusCode(error);
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      request.log.warn({ err: error }, 'client request error');
      return reply.status(200).send(fail(400, '请求参数错误'));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.status(200).send(fail(500, '服务器错误'));
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url === '/api' || request.url.startsWith('/api/')) {
      return reply.status(200).send(fail(404, '接口不存在'));
    }
    return reply.status(404).send(fail(404, '资源不存在'));
  });

  await app.register(formbody);
  await app.register(multipart, {
    limits: {
      fieldNameSize: 200,
      fieldSize: MAX_BODY_BYTES,
      fields: 100,
      fileSize: MAX_BODY_BYTES,
      files: 10,
      parts: 200
    }
  });

  if (config.nodeEnv === 'development') {
    await app.register(cors, {
      origin: config.corsOrigin,
      credentials: true
    });
  }

  await app.register(authPlugin, { prisma, tokens: app.tokens });
  await app.register(sysRoutes, { prefix: '/api/goview' });
  await app.register(userRoutes, { prefix: '/api/goview' });
  await app.register(projectRoutes, { prefix: '/api/goview' });
  await app.register(templateRoutes, { prefix: '/api/goview' });
  await app.register(teamRoutes, { prefix: '/api/goview' });
  await app.register(materialRoutes, { prefix: '/api/goview' });
  await app.register(datafileRoutes, { prefix: '/api/goview' });
  await app.register(datasetRoutes, { prefix: '/api/goview' });
  await app.register(videoRoutes, { prefix: '/api/goview' });
  await app.register(healthRoutes, { prefix: '/api/goview' });
  await app.register(staticRoutes);

  return app;
}
