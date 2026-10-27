import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  LimitedProjectData,
  ProjectDetail,
  ProjectItem
} from '../src/services/project.js';
import {
  authHeaders,
  createTestContext,
  loginToken,
  readJson,
  seedUser,
  type TestContext
} from './helpers.js';

interface CreatedProject {
  id: string;
}

describe('项目越权控制', () => {
  let ctx: TestContext;
  let studentAToken: string;
  let studentBToken: string;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    await seedUser(ctx.app, {
      username: 'student_a',
      nickname: '学生 A',
      role: 'student'
    });
    await seedUser(ctx.app, {
      username: 'student_b',
      nickname: '学生 B',
      role: 'student'
    });
    await seedUser(ctx.app, {
      username: 'admin',
      nickname: '管理员',
      role: 'admin'
    });
    studentAToken = await loginToken(ctx.app, 'student_a');
    studentBToken = await loginToken(ctx.app, 'student_b');
    adminToken = await loginToken(ctx.app, 'admin');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('学生 B 看不到、改不了、删不了、发布不了学生 A 的项目', async () => {
    const createResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/create',
      headers: authHeaders(studentAToken),
      payload: { projectName: '学生 A 的大屏' }
    });
    const projectId = readJson<CreatedProject>(createResponse).data.id;

    const saveResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/save/data',
      headers: {
        ...authHeaders(studentAToken),
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: new URLSearchParams({
        projectId,
        content: JSON.stringify({ owner: 'student_a' })
      }).toString()
    });
    expect(readJson<unknown>(saveResponse).code).toBe(200);

    const listB = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/list',
      headers: authHeaders(studentBToken)
    });
    const listBBody = readJson<ProjectItem[]>(listB);
    expect(listBBody.code).toBe(200);
    expect(listBBody.count).toBe(0);
    expect(listBBody.data).toHaveLength(0);

    const editByB = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/edit',
      headers: authHeaders(studentBToken),
      payload: { id: projectId, projectName: '被篡改' }
    });
    expect(readJson<unknown>(editByB).code).toBe(403);

    const saveByB = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/save/data',
      headers: {
        ...authHeaders(studentBToken),
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: new URLSearchParams({ projectId, content: '{"hacked":true}' }).toString()
    });
    expect(readJson<unknown>(saveByB).code).toBe(403);

    const publishByB = await ctx.app.inject({
      method: 'PUT',
      url: '/api/goview/project/publish',
      headers: authHeaders(studentBToken),
      payload: { id: projectId, state: 1 }
    });
    expect(readJson<unknown>(publishByB).code).toBe(403);

    const copyByB = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/copy',
      headers: authHeaders(studentBToken),
      payload: { id: projectId }
    });
    expect(readJson<unknown>(copyByB).code).toBe(403);

    const deleteByB = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/project/delete?ids=${encodeURIComponent(projectId)}`,
      headers: authHeaders(studentBToken)
    });
    expect(readJson<unknown>(deleteByB).code).toBe(403);

    const sortByB = await ctx.app.inject({
      method: 'PUT',
      url: '/api/goview/project/sort',
      headers: authHeaders(studentBToken),
      payload: { ids: [projectId] }
    });
    expect(readJson<unknown>(sortByB).code).toBe(200);
    const untouched = await ctx.app.prisma.project.findUniqueOrThrow({
      where: { id: projectId }
    });
    expect(untouched.sortOrder).toBe(-1);
    expect(untouched.deletedAt).toBeNull();
    expect(untouched.projectName).toBe('学生 A 的大屏');

    const draftByB = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/project/getData?projectId=${encodeURIComponent(projectId)}`,
      headers: authHeaders(studentBToken)
    });
    const draftBody = readJson<LimitedProjectData>(draftByB);
    expect(draftBody.code).toBe(200);
    expect(draftBody.data).toEqual({ id: projectId, state: -1, content: '' });
    expect(Object.keys(draftBody.data).sort()).toEqual(['content', 'id', 'state']);

    const listAdmin = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/list',
      headers: authHeaders(adminToken)
    });
    const adminBody = readJson<ProjectItem[]>(listAdmin);
    expect(adminBody.count).toBe(1);
    expect(adminBody.data[0]?.id).toBe(projectId);

    const adminDetail = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/project/getData?projectId=${encodeURIComponent(projectId)}`,
      headers: authHeaders(adminToken)
    });
    const adminDetailBody = readJson<ProjectDetail>(adminDetail);
    expect(adminDetailBody.code).toBe(200);
    expect(adminDetailBody.data.content).toBe(JSON.stringify({ owner: 'student_a' }));

    const publishByA = await ctx.app.inject({
      method: 'PUT',
      url: '/api/goview/project/publish',
      headers: authHeaders(studentAToken),
      payload: { id: projectId, state: 1 }
    });
    expect(readJson<unknown>(publishByA).code).toBe(200);

    for (const emptyContent of ['', '{}', JSON.stringify({ componentList: [] })]) {
      await ctx.app.prisma.project.update({ where: { id: projectId }, data: { content: emptyContent, state: -1 } });
      const emptyPublish = readJson<unknown>(
        await ctx.app.inject({
          method: 'PUT',
          url: '/api/goview/project/publish',
          headers: authHeaders(studentAToken),
          payload: { id: projectId, state: 1 }
        })
      );
      expect(emptyPublish).toMatchObject({ code: 400 });
    }
    await ctx.app.prisma.project.update({
      where: { id: projectId },
      data: { content: JSON.stringify({ owner: 'student_a' }), state: 1 }
    });

    const publishedForB = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/project/getData?projectId=${encodeURIComponent(projectId)}`,
      headers: authHeaders(studentBToken)
    });
    const publishedBody = readJson<ProjectDetail>(publishedForB);
    expect(publishedBody.code).toBe(200);
    expect(publishedBody.data.content).toBe(JSON.stringify({ owner: 'student_a' }));

    const editPublishedByB = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/edit',
      headers: authHeaders(studentBToken),
      payload: { id: projectId, projectName: '发布后也不能改' }
    });
    expect(readJson<unknown>(editPublishedByB).code).toBe(403);
  });
});
