import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectDetail, ProjectItem } from '../src/services/project.js';
import {
  authHeaders,
  createTestContext,
  loginToken,
  readJson,
  seedUser,
  type TestContext
} from './helpers.js';

interface IdData {
  id: string;
}

describe('场景模板 F017', () => {
  let ctx: TestContext;
  let teacherToken: string;
  let studentToken: string;
  let studentId: string;
  let teamId: string;
  let templateId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    await seedUser(ctx.app, { username: 'teacher01', nickname: '张老师', role: 'teacher' });
    const student = await seedUser(ctx.app, {
      username: 'student_a',
      nickname: '学生 A',
      role: 'student'
    });
    studentId = student.id;
    teacherToken = await loginToken(ctx.app, 'teacher01');
    studentToken = await loginToken(ctx.app, 'student_a');

    const team = readJson<IdData>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/team/create',
        headers: authHeaders(teacherToken),
        payload: { name: '模板测试团队' }
      })
    );
    teamId = team.data.id;
    await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/team/addMembers',
      headers: authHeaders(teacherToken),
      payload: { id: teamId, userIds: [studentId] }
    });

    const created = readJson<IdData>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/project/create',
        headers: authHeaders(teacherToken),
        payload: { projectName: '校园总览模板' }
      })
    );
    templateId = created.data.id;
    await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/save/data',
      headers: { ...authHeaders(teacherToken), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        projectId: templateId,
        content: '{"canvas":{"width":1920},"widgets":[{"type":"map"}]}'
      }).toString()
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function setTemplate(
    token: string,
    payload: Record<string, unknown>
  ) {
    return readJson<unknown>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/project/setTemplate',
        headers: authHeaders(token),
        payload
      })
    );
  }

  async function templates(query = ''): Promise<ProjectItem[]> {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/project/templates${query}`,
      headers: authHeaders(studentToken)
    });
    return readJson<ProjectItem[]>(response).data;
  }

  it('教师设为模板、按分类查询、学生从模板新建并能深拷贝内容', async () => {
    const byStudent = await setTemplate(studentToken, {
      id: templateId,
      isTemplate: true,
      templateCategory: 'campus'
    });
    expect(byStudent.code).toBe(403);

    const setResponse = await setTemplate(teacherToken, {
      id: templateId,
      isTemplate: true,
      templateCategory: 'campus'
    });
    expect(setResponse.code).toBe(200);

    const all = await templates();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: templateId,
      projectName: '校园总览模板',
      isTemplate: true,
      templateCategory: 'campus'
    });

    const campus = await templates('?category=campus');
    expect(campus).toHaveLength(1);
    const device = await templates('?category=device');
    expect(device).toHaveLength(0);

    const badCategory = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/templates?category=unknown',
      headers: authHeaders(studentToken)
    });
    expect(readJson<unknown>(badCategory).code).toBe(400);

    const createResponse = readJson<IdData>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/project/createFromTemplate',
        headers: authHeaders(studentToken),
        payload: { templateId, projectName: '我的校园大屏', teamId }
      })
    );
    expect(createResponse.code).toBe(200);
    const newId = createResponse.data.id;

    const detailResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/project/getData?projectId=${newId}`,
      headers: authHeaders(studentToken)
    });
    const detail = readJson<ProjectDetail>(detailResponse);
    expect(detail.data).toMatchObject({
      id: newId,
      projectName: '我的校园大屏',
      state: -1,
      isTemplate: false,
      templateCategory: '',
      teamId,
      version: 0
    });
    expect(detail.data.content).toBe(
      '{"canvas":{"width":1920},"widgets":[{"type":"map"}]}'
    );

    const edited = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/save/data',
      headers: {
        ...authHeaders(studentToken),
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: new URLSearchParams({
        projectId: newId,
        content: '{"changed":true}',
        version: '0'
      }).toString()
    });
    expect(readJson<unknown>(edited).code).toBe(200);

    const templateDetail = readJson<ProjectDetail>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/project/getData?projectId=${templateId}`,
        headers: authHeaders(teacherToken)
      })
    );
    expect(templateDetail.data.isTemplate).toBe(true);
    expect(templateDetail.data.content).toBe(
      '{"canvas":{"width":1920},"widgets":[{"type":"map"}]}'
    );
    const newDetail = readJson<ProjectDetail>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/project/getData?projectId=${newId}`,
        headers: authHeaders(studentToken)
      })
    );
    expect(newDetail.data.content).toBe('{"changed":true}');

    const missing = readJson<unknown>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/project/createFromTemplate',
        headers: authHeaders(studentToken),
        payload: { templateId: newId, projectName: '不是模板' }
      })
    );
    expect(missing.code).toBe(404);

    const outsider = readJson<unknown>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/project/createFromTemplate',
        headers: authHeaders(studentToken),
        payload: { templateId, projectName: '错误归属', teamId: 'not-a-team' }
      })
    );
    expect(outsider.code).toBe(404);

    const cancel = await setTemplate(teacherToken, { id: templateId, isTemplate: false });
    expect(cancel.code).toBe(200);
    expect(await templates()).toHaveLength(0);

    const row = await ctx.app.prisma.project.findUniqueOrThrow({ where: { id: templateId } });
    expect(row.templateCategory).toBeNull();
  });

  it('教师不能把别人的私有项目设为模板', async () => {
    const created = readJson<IdData>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/project/create',
        headers: authHeaders(studentToken),
        payload: { projectName: '学生的私有项目' }
      })
    );
    const forbidden = await setTemplate(teacherToken, {
      id: created.data.id,
      isTemplate: true,
      templateCategory: 'other'
    });
    expect(forbidden.code).toBe(403);
  });
});
