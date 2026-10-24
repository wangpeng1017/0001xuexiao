import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createTestContext, type TestContext } from './helpers.js';

describe('WEB_DIST 静态托管', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('存在 WEB_DIST 时托管 index.html，且 /api 不受影响', async () => {
    const webDist = path.join(ctx.dir, 'web-dist');
    mkdirSync(webDist, { recursive: true });
    writeFileSync(
      path.join(webDist, 'index.html'),
      '<!doctype html><html><head><title>Goview</title></head></html>',
      'utf8'
    );

    const app = await buildApp({
      logger: false,
      config: {
        databaseUrl: ctx.app.config.databaseUrl,
        dataDir: path.join(ctx.dir, 'web-dist-data'),
        jwtSecret: 'test-web-dist-secret',
        nodeEnv: 'test',
        webDist
      }
    });
    await app.ready();

    try {
      const root = await app.inject({ method: 'GET', url: '/' });
      expect(root.statusCode).toBe(200);
      expect(root.body).toContain('Goview');

      const oss = await app.inject({
        method: 'GET',
        url: '/api/goview/sys/getOssInfo'
      });
      expect(JSON.parse(oss.body)).toEqual({
        code: 200,
        msg: 'ok',
        data: { bucketURL: '' }
      });

      const missingApi = await app.inject({
        method: 'GET',
        url: '/api/goview/definitely-missing'
      });
      expect(missingApi.statusCode).toBe(200);
      expect(JSON.parse(missingApi.body)).toEqual({
        code: 404,
        msg: '接口不存在'
      });
    } finally {
      await app.close();
    }
  });
});
