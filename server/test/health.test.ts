import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, readJson, type TestContext } from './helpers.js';

interface HealthData {
  status: string;
  version: string;
  db: string;
}

describe('健康检查接口', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('无需登录即可返回服务与数据库状态', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/health'
    });

    expect(response.statusCode).toBe(200);
    const body = readJson<HealthData>(response);
    expect(body.code).toBe(200);
    expect(body.data.status).toBe('ok');
    expect(body.data.db).toBe('ok');
    expect(typeof body.data.version).toBe('string');
    expect(body.data.version.length).toBeGreaterThan(0);
  });
});
