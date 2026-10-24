import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync } from 'fastify';

const staticRoutes: FastifyPluginAsync = async (fastify) => {
  const filesRoot = path.join(fastify.config.dataDir, 'files');
  mkdirSync(filesRoot, { recursive: true });

  await fastify.register(fastifyStatic, {
    root: filesRoot,
    prefix: '/files/',
    decorateReply: false,
    setHeaders: (response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
      );
    }
  });

  const webDist = fastify.config.webDist;
  if (webDist && existsSync(webDist) && statSync(webDist).isDirectory()) {
    await fastify.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      decorateReply: false,
      index: ['index.html']
    });
  }
};

export default staticRoutes;
