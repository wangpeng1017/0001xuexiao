import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeaders, createTestContext, loginToken, readJson, seedUser, type TestContext } from './helpers.js';

// 回归：GoView 新建项目时提交 remarks: null / indexImage: null，曾被参数校验拒绝
describe('请求体中的 null 字段视为未提供', () => {
  let ctx: TestContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await seedUser(ctx.app, { username: 'nullcase01', nickname: '空值用户', role: 'student' });
    token = await loginToken(ctx.app, 'nullcase01');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('project/create 接受 GoView 原样提交的 null 字段', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/create',
      headers: authHeaders(token),
      payload: { projectName: 'goview-uuid-name', remarks: null, indexImage: null }
    });
    const body = readJson<{ id: string }>(response);
    expect(body.code).toBe(200);
    expect(body.data.id).toBeTruthy();
  });

  it('必填字段为 null 时仍然报参数错误', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/create',
      headers: authHeaders(token),
      payload: { projectName: null }
    });
    expect(readJson(response).code).toBe(400);
  });
});
