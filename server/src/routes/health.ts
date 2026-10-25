import { readFileSync } from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { ok } from '../lib/resp.js';

function resolveVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', { config: { auth: 'public' } }, async () => {
    await fastify.prisma.$queryRaw`SELECT 1`;
    return ok({ status: 'ok', version: resolveVersion(), db: 'ok' });
  });
};

export default healthRoutes;
