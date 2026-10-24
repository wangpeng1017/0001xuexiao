import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authHeaders,
  createTestContext,
  DEFAULT_PASSWORD,
  login,
  loginToken,
  readJson,
  seedUser,
  type LoginData,
  type TestContext
} from './helpers.js';

describe('登录、锁定、禁用与首次改密', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('登录成功返回 token 与 userinfo', async () => {
    const user = await seedUser(ctx.app, {
      username: 'teacher01',
      nickname: '张老师',
      role: 'teacher'
    });

    const response = await login(ctx.app, 'teacher01');
    expect(response.statusCode).toBe(200);
    const body = readJson<LoginData>(response);
    expect(body.code).toBe(200);
    expect(body.msg).toBe('ok');
    expect(body.data.token.tokenName).toBe('Authorization');
    expect(body.data.token.tokenValue).toMatch(/^Bearer /);
    expect(body.data.userinfo).toEqual({
      id: user.id,
      username: 'teacher01',
      nickname: '张老师',
      role: 'teacher',
      mustChangePwd: false
    });
  });

  it('密码错误返回 400，4 次失败后仍可正常登录', async () => {
    await seedUser(ctx.app, { username: 'teacher01' });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await login(ctx.app, 'teacher01', 'WrongPass1');
      const body = readJson<unknown>(response);
      expect(body.code).toBe(400);
      expect(body.msg).toBe('用户名或密码错误');
    }

    const success = await login(ctx.app, 'teacher01', DEFAULT_PASSWORD);
    expect(readJson<LoginData>(success).code).toBe(200);
  });

  it('连续 5 次失败后锁定 10 分钟，期间正确密码也无法登录', async () => {
    const user = await seedUser(ctx.app, { username: 'teacher02' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await login(ctx.app, 'teacher02', 'WrongPass1');
      expect(readJson<unknown>(response).code).toBe(400);
    }

    const lockedUser = await ctx.app.prisma.user.findUniqueOrThrow({
      where: { id: user.id }
    });
    expect(lockedUser.lockedUntil).not.toBeNull();
    expect(lockedUser.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const response = await login(ctx.app, 'teacher02', DEFAULT_PASSWORD);
    const body = readJson<unknown>(response);
    expect(body.code).toBe(400);
    expect(body.msg).toBe('登录失败次数过多，请 10 分钟后再试');
  });

  it('禁用账号无法登录，且旧 token 返回 886', async () => {
    await seedUser(ctx.app, {
      username: 'student_off',
      role: 'student',
      disabled: true
    });
    const disabledLogin = await login(ctx.app, 'student_off');
    const disabledBody = readJson<unknown>(disabledLogin);
    expect(disabledBody.code).toBe(400);
    expect(disabledBody.msg).toBe('账号已禁用');

    const active = await seedUser(ctx.app, { username: 'student_on', role: 'student' });
    const token = await loginToken(ctx.app, 'student_on');
    const meBefore = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/sys/me',
      headers: authHeaders(token)
    });
    expect(readJson<unknown>(meBefore).code).toBe(200);

    await ctx.app.prisma.user.update({
      where: { id: active.id },
      data: { disabled: true }
    });

    const meAfter = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/sys/me',
      headers: authHeaders(token)
    });
    expect(readJson<unknown>(meAfter).code).toBe(886);
  });

  it('mustChangePwd 用户被限制，弱密码被拒，改密后恢复', async () => {
    await seedUser(ctx.app, {
      username: 'new_teacher',
      mustChangePwd: true
    });
    const token = await loginToken(ctx.app, 'new_teacher');
    const headers = authHeaders(token);

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/sys/me',
      headers
    });
    const meBody = readJson<LoginData['userinfo']>(me);
    expect(meBody.code).toBe(200);
    expect(meBody.data.mustChangePwd).toBe(true);

    const listBlocked = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/list',
      headers
    });
    expect(readJson<unknown>(listBlocked).code).toBe(887);

    const wrongOld = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/sys/changePassword',
      headers,
      payload: { oldPassword: 'WrongPass1', newPassword: 'NewPassw0rd' }
    });
    expect(readJson<unknown>(wrongOld).code).toBe(400);

    for (const weakPassword of ['short1', '12345678']) {
      const weak = await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/sys/changePassword',
        headers,
        payload: { oldPassword: DEFAULT_PASSWORD, newPassword: weakPassword }
      });
      const body = readJson<unknown>(weak);
      expect(body.code).toBe(400);
      expect(body.msg).toContain('密码至少 8 位');
    }

    const changed = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/sys/changePassword',
      headers,
      payload: { oldPassword: DEFAULT_PASSWORD, newPassword: 'NewPassw0rd' }
    });
    expect(readJson<unknown>(changed).code).toBe(200);

    const listAfter = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/list',
      headers
    });
    expect(readJson<unknown>(listAfter).code).toBe(200);

    const oldLogin = await login(ctx.app, 'new_teacher', DEFAULT_PASSWORD);
    expect(readJson<unknown>(oldLogin).code).toBe(400);
    const newLogin = await login(ctx.app, 'new_teacher', 'NewPassw0rd');
    const newLoginBody = readJson<LoginData>(newLogin);
    expect(newLoginBody.code).toBe(200);
    expect(newLoginBody.data.userinfo.mustChangePwd).toBe(false);
  });
});
