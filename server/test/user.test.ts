import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authHeaders,
  createTestContext,
  DEFAULT_PASSWORD,
  login,
  loginToken,
  multipartBody,
  readJson,
  seedUser,
  type LoginData,
  type TestContext
} from './helpers.js';
interface UserApiItem {
  id: string;
  username: string;
  nickname: string;
  role: string;
  disabled: boolean;
  createTime: string;
}
interface CreatedUser {
  id: string;
  initialPassword: string;
}
interface ResetPasswordData {
  initialPassword: string;
}
interface ImportRow {
  line: number;
  username: string;
  ok: boolean;
  reason: string;
  initialPassword: string;
}

describe('用户管理', () => {
  let ctx: TestContext;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    const admin = await seedUser(ctx.app, {
      username: 'admin',
      nickname: '管理员',
      role: 'admin'
    });
    adminId = admin.id;
    adminToken = await loginToken(ctx.app, 'admin');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('非 admin 访问用户管理返回 403', async () => {
    await seedUser(ctx.app, { username: 'teacher01', role: 'teacher' });
    const token = await loginToken(ctx.app, 'teacher01');

    const listResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/user/list',
      headers: authHeaders(token)
    });
    expect(readJson<unknown>(listResponse).code).toBe(403);

    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/create',
      headers: authHeaders(token),
      payload: { username: 'stu_1001', nickname: '学生', role: 'student' }
    });
    expect(readJson<unknown>(createResponse).code).toBe(403);

    const csv = 'username,nickname,role\nstu_1002,学生二,student\n';
    const upload = multipartBody([
      {
        name: 'file',
        filename: 'users.csv',
        contentType: 'text/csv',
        content: csv
      }
    ]);
    const importResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/import',
      headers: { ...authHeaders(token), ...upload.headers },
      payload: upload.payload
    });
    expect(readJson<unknown>(importResponse).code).toBe(403);
  });

  it('创建用户可以生成随机初始密码，并支持列表分页与关键字', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/create',
      headers: authHeaders(adminToken),
      payload: { username: 'stu_1001', nickname: '李同学', role: 'student' }
    });
    const created = readJson<CreatedUser>(createResponse);
    expect(created.code).toBe(200);
    expect(created.data.id).toBeTruthy();
    expect(created.data.initialPassword).toHaveLength(10);
    expect(created.data.initialPassword).toMatch(/[A-Za-z]/);
    expect(created.data.initialPassword).toMatch(/\d/);

    const dbUser = await ctx.app.prisma.user.findUniqueOrThrow({
      where: { username: 'stu_1001' }
    });
    expect(dbUser.mustChangePwd).toBe(true);
    expect(dbUser.disabled).toBe(false);

    const loginResponse = await login(
      ctx.app,
      'stu_1001',
      created.data.initialPassword
    );
    expect(readJson<LoginData>(loginResponse).code).toBe(200);

    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/create',
      headers: authHeaders(adminToken),
      payload: { username: 'stu_1001', nickname: '重复', role: 'student' }
    });
    const duplicateBody = readJson<unknown>(duplicate);
    expect(duplicateBody.code).toBe(400);
    expect(duplicateBody.msg).toBe('用户名已存在');

    const invalid = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/create',
      headers: authHeaders(adminToken),
      payload: { username: 'ab', nickname: '太短', role: 'student' }
    });
    expect(readJson<unknown>(invalid).code).toBe(400);

    const invalidRole = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/create',
      headers: authHeaders(adminToken),
      payload: { username: 'stu_1002', nickname: '角色错', role: 'root' }
    });
    expect(readJson<unknown>(invalidRole).code).toBe(400);

    const listResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/user/list?page=1&limit=10',
      headers: authHeaders(adminToken)
    });
    const list = readJson<UserApiItem[]>(listResponse);
    expect(list.code).toBe(200);
    expect(list.count).toBe(2);
    expect(list.data).toHaveLength(2);
    const createdItem = list.data.find((item) => item.username === 'stu_1001');
    expect(createdItem).toMatchObject({
      nickname: '李同学',
      role: 'student',
      disabled: false
    });
    expect(Date.parse(createdItem!.createTime)).not.toBeNaN();

    const keywordResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/user/list?page=1&limit=10&keyword=${encodeURIComponent('李')}`,
      headers: authHeaders(adminToken)
    });
    const keywordList = readJson<UserApiItem[]>(keywordResponse);
    expect(keywordList.count).toBe(1);
    expect(keywordList.data[0]?.username).toBe('stu_1001');

    const pageTwoResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/user/list?page=2&limit=1',
      headers: authHeaders(adminToken)
    });
    const pageTwo = readJson<UserApiItem[]>(pageTwoResponse);
    expect(pageTwo.count).toBe(2);
    expect(pageTwo.data).toHaveLength(1);
  });

  it('编辑用户，且管理员不能禁用自己或修改自己的角色', async () => {
    const target = await seedUser(ctx.app, {
      username: 'stu_1001',
      nickname: '原姓名',
      role: 'student'
    });

    const editResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/edit',
      headers: authHeaders(adminToken),
      payload: { id: target.id, nickname: '新姓名', role: 'teacher' }
    });
    expect(readJson<unknown>(editResponse).code).toBe(200);

    const updated = await ctx.app.prisma.user.findUniqueOrThrow({
      where: { id: target.id }
    });
    expect(updated.nickname).toBe('新姓名');
    expect(updated.role).toBe('teacher');

    const selfRole = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/edit',
      headers: authHeaders(adminToken),
      payload: { id: adminId, role: 'teacher' }
    });
    const selfRoleBody = readJson<unknown>(selfRole);
    expect(selfRoleBody.code).toBe(400);
    expect(selfRoleBody.msg).toBe('不能修改自己的角色');

    const selfDisable = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/edit',
      headers: authHeaders(adminToken),
      payload: { id: adminId, disabled: true }
    });
    const selfDisableBody = readJson<unknown>(selfDisable);
    expect(selfDisableBody.code).toBe(400);
    expect(selfDisableBody.msg).toBe('不能禁用自己');

    const selfNickname = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/edit',
      headers: authHeaders(adminToken),
      payload: { id: adminId, nickname: '超级管理员' }
    });
    expect(readJson<unknown>(selfNickname).code).toBe(200);

    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/edit',
      headers: authHeaders(adminToken),
      payload: { id: 'not-exist' }
    });
    expect(readJson<unknown>(missing).code).toBe(404);
  });

  it('重置密码会清除锁定并要求首次改密', async () => {
    const target = await seedUser(ctx.app, { username: 'stu_1001' });
    await ctx.app.prisma.user.update({
      where: { id: target.id },
      data: {
        failCount: 3,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    const resetResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/resetPassword',
      headers: authHeaders(adminToken),
      payload: { id: target.id }
    });
    const reset = readJson<ResetPasswordData>(resetResponse);
    expect(reset.code).toBe(200);
    expect(reset.data.initialPassword).toHaveLength(10);

    const updated = await ctx.app.prisma.user.findUniqueOrThrow({
      where: { id: target.id }
    });
    expect(updated.mustChangePwd).toBe(true);
    expect(updated.failCount).toBe(0);
    expect(updated.lockedUntil).toBeNull();

    const oldLogin = await login(ctx.app, 'stu_1001', DEFAULT_PASSWORD);
    expect(readJson<unknown>(oldLogin).code).toBe(400);

    const newLogin = await login(ctx.app, 'stu_1001', reset.data.initialPassword);
    const newLoginBody = readJson<LoginData>(newLogin);
    expect(newLoginBody.code).toBe(200);
    expect(newLoginBody.data.userinfo.mustChangePwd).toBe(true);

    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/resetPassword',
      headers: authHeaders(adminToken),
      payload: { id: 'not-exist' }
    });
    expect(readJson<unknown>(missing).code).toBe(404);
  });

  it('CSV 导入部分行失败不影响其它行，支持 BOM、引号与中文角色', async () => {
    await seedUser(ctx.app, {
      username: 'dup_user',
      nickname: '已存在',
      role: 'teacher'
    });

    const csv =
      '\uFEFFusername,nickname,role,password\r\n' +
      'dup_user,重复用户,teacher,Passw0rd1\r\n' +
      'bad_role,错误角色,admin,Passw0rd1\r\n' +
      'new_teacher,新老师,教师,Passw0rd1\r\n' +
      '"new_student","张,三",学生,\r\n';

    const upload = multipartBody([
      {
        name: 'file',
        filename: 'users.csv',
        contentType: 'text/csv',
        content: csv
      }
    ]);

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/import',
      headers: { ...authHeaders(adminToken), ...upload.headers },
      payload: upload.payload
    });
    const body = readJson<ImportRow[]>(response);
    expect(body.code).toBe(200);
    expect(body.data).toHaveLength(4);

    expect(body.data[0]).toMatchObject({
      line: 2,
      username: 'dup_user',
      ok: false,
      reason: '用户名已存在'
    });
    expect(body.data[1]).toMatchObject({
      line: 3,
      username: 'bad_role',
      ok: false
    });
    expect(body.data[1]?.reason).toContain('角色');
    expect(body.data[2]).toMatchObject({
      line: 4,
      username: 'new_teacher',
      ok: true,
      initialPassword: 'Passw0rd1'
    });
    expect(body.data[3]).toMatchObject({
      line: 5,
      username: 'new_student',
      ok: true
    });
    expect(body.data[3]?.initialPassword).toHaveLength(10);

    const teacher = await ctx.app.prisma.user.findUniqueOrThrow({
      where: { username: 'new_teacher' }
    });
    expect(teacher.role).toBe('teacher');
    expect(teacher.mustChangePwd).toBe(true);

    const student = await ctx.app.prisma.user.findUniqueOrThrow({
      where: { username: 'new_student' }
    });
    expect(student.nickname).toBe('张,三');
    expect(student.role).toBe('student');

    expect(
      await ctx.app.prisma.user.count({ where: { username: 'bad_role' } })
    ).toBe(0);

    const keywordResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/user/list?page=1&limit=10&keyword=${encodeURIComponent('张')}`,
      headers: authHeaders(adminToken)
    });
    const keywordList = readJson<UserApiItem[]>(keywordResponse);
    expect(keywordList.count).toBe(1);
    expect(keywordList.data[0]?.username).toBe('new_student');

    const badHeaderUpload = multipartBody([
      {
        name: 'file',
        filename: 'bad.csv',
        contentType: 'text/csv',
        content: 'name,nick,role\nx,y,teacher\n'
      }
    ]);
    const badHeaderResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/user/import',
      headers: { ...authHeaders(adminToken), ...badHeaderUpload.headers },
      payload: badHeaderUpload.payload
    });
    const badHeaderBody = readJson<unknown>(badHeaderResponse);
    expect(badHeaderBody.code).toBe(400);
    expect(badHeaderBody.msg).toContain('CSV 表头');
  });
});
