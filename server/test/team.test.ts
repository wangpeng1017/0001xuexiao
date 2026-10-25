import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectDetail, ProjectItem } from '../src/services/project.js';
import type { TeamDetail, TeamListItem, UserOption } from '../src/services/team.js';
import {
  authHeaders,
  createTestContext,
  loginToken,
  readJson,
  seedUser,
  type ApiEnvelope,
  type TestContext
} from './helpers.js';

interface IdData {
  id: string;
}

interface VersionData {
  version: number;
}

interface ConflictData {
  updateUserName: string;
  updateTime: string;
  version: number;
}

describe('团队协作 F015', () => {
  let ctx: TestContext;
  let adminToken: string;
  let teacherToken: string;
  let studentAToken: string;
  let studentBToken: string;
  let studentCToken: string;
  let studentAId: string;
  let studentBId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    await seedUser(ctx.app, { username: 'admin', nickname: '管理员', role: 'admin' });
    await seedUser(ctx.app, { username: 'teacher01', nickname: '张老师', role: 'teacher' });
    const a = await seedUser(ctx.app, { username: 'student_a', nickname: '学生 A', role: 'student' });
    const b = await seedUser(ctx.app, { username: 'student_b', nickname: '学生 B', role: 'student' });
    await seedUser(ctx.app, { username: 'student_c', nickname: '学生 C', role: 'student' });
    studentAId = a.id;
    studentBId = b.id;
    adminToken = await loginToken(ctx.app, 'admin');
    teacherToken = await loginToken(ctx.app, 'teacher01');
    studentAToken = await loginToken(ctx.app, 'student_a');
    studentBToken = await loginToken(ctx.app, 'student_b');
    studentCToken = await loginToken(ctx.app, 'student_c');
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function post(url: string, token: string, payload: unknown) {
    return ctx.app.inject({
      method: 'POST',
      url: `/api/goview/${url}`,
      headers: authHeaders(token),
      payload: payload as object
    });
  }

  async function postJson<T = unknown>(url: string, token: string, payload: unknown) {
    return readJson<T>(await post(url, token, payload));
  }

  async function createTeam(token: string, name = '三维实训团队'): Promise<string> {
    const body = readJson<IdData>(await post('team/create', token, { name }));
    expect(body.code).toBe(200);
    return body.data.id;
  }

  async function addMembers(teamId: string, token: string, userIds: string[]) {
    const body = readJson<unknown>(await post('team/addMembers', token, { id: teamId, userIds }));
    expect(body.code).toBe(200);
  }

  async function createProject(
    token: string,
    projectName: string,
    teamId?: string
  ): Promise<string> {
    const body = readJson<IdData>(
      await post('project/create', token, { projectName, ...(teamId ? { teamId } : {}) })
    );
    expect(body.code).toBe(200);
    return body.data.id;
  }

  async function save(token: string, projectId: string, content: string, extra = {}) {
    return readJson<VersionData>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/project/save/data',
        headers: { ...authHeaders(token), 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ projectId, content, ...extra }).toString()
      })
    );
  }

  async function list(token: string, query = ''): Promise<ApiEnvelope<ProjectItem[]>> {
    return readJson<ProjectItem[]>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/project/list?page=1&limit=10${query}`,
        headers: authHeaders(token)
      })
    );
  }

  it('教师建团队、管理成员、更换负责人；学生不能建团队', async () => {
    const forbidden = await postJson('team/create', studentAToken, { name: '学生团队' });
    expect(forbidden.code).toBe(403);

    const teamId = await createTeam(teacherToken);

    const optionsResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/user/options?keyword=student',
      headers: authHeaders(teacherToken)
    });
    const options = readJson<UserOption[]>(optionsResponse);
    expect(options.code).toBe(200);
    expect(options.data.map((item) => item.username).sort()).toEqual([
      'student_a',
      'student_b',
      'student_c'
    ]);

    const studentOptions = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/user/options',
      headers: authHeaders(studentAToken)
    });
    expect(readJson<unknown>(studentOptions).code).toBe(403);

    await addMembers(teamId, teacherToken, [studentAId, studentBId]);
    const duplicate = await postJson('team/addMembers', teacherToken, {
      id: teamId,
      userIds: [studentAId]
    });
    expect(duplicate.code).toBe(200);

    const detailResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/team/detail?id=${teamId}`,
      headers: authHeaders(teacherToken)
    });
    const detail = readJson<TeamDetail>(detailResponse);
    expect(detail.code).toBe(200);
    expect(detail.data.name).toBe('三维实训团队');
    expect(detail.data.leaderName).toBe('张老师');
    expect(detail.data.memberCount).toBe(3);
    expect(detail.data.members.map((member) => member.username).sort()).toEqual([
      'student_a',
      'student_b',
      'teacher01'
    ]);

    const outsiderDetail = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/team/detail?id=${teamId}`,
      headers: authHeaders(studentCToken)
    });
    expect(readJson<unknown>(outsiderDetail).code).toBe(403);

    const rename = await postJson('team/edit', teacherToken, { id: teamId, name: '改名团队' });
    expect(rename.code).toBe(200);

    const changeLeader = await postJson('team/edit', teacherToken, {
      id: teamId,
      leaderId: studentAId
    });
    expect(changeLeader.code).toBe(200);

    const afterLeader = readJson<TeamDetail>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/team/detail?id=${teamId}`,
        headers: authHeaders(studentAToken)
      })
    );
    expect(afterLeader.data.leaderId).toBe(studentAId);
    expect(afterLeader.data.name).toBe('改名团队');

    const removeLeader = await postJson('team/removeMember', studentAToken, {
      id: teamId,
      userId: studentAId
    });
    expect(removeLeader.code).toBe(400);

    const removeMember = await postJson('team/removeMember', studentAToken, {
      id: teamId,
      userId: studentBId
    });
    expect(removeMember.code).toBe(200);

    const afterRemove = readJson<TeamDetail>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/team/detail?id=${teamId}`,
        headers: authHeaders(adminToken)
      })
    );
    expect(afterRemove.data.memberCount).toBe(2);

    const listResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/team/list',
      headers: authHeaders(studentAToken)
    });
    const teams = readJson<TeamListItem[]>(listResponse);
    expect(teams.data.map((team) => team.id)).toEqual([teamId]);
    expect(teams.data[0]).toMatchObject({ memberCount: 2, leaderId: studentAId });

    const outsiderList = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/team/list',
      headers: authHeaders(studentCToken)
    });
    expect(readJson<TeamListItem[]>(outsiderList).data).toHaveLength(0);

    const adminList = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/team/list',
      headers: authHeaders(adminToken)
    });
    expect(readJson<TeamListItem[]>(adminList).data).toHaveLength(1);
  });

  it('团队成员可读写团队项目，非成员 403；删除只允许创建者、负责人、admin', async () => {
    const teamId = await createTeam(teacherToken);
    await addMembers(teamId, teacherToken, [studentAId, studentBId]);

    const projectId = await createProject(studentAToken, '团队大屏', teamId);

    const detailResponse = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/project/getData?projectId=${projectId}`,
      headers: authHeaders(studentBToken)
    });
    const detail = readJson<ProjectDetail>(detailResponse);
    expect(detail.code).toBe(200);
    expect(detail.data.teamId).toBe(teamId);
    expect(detail.data.teamName).toBe('三维实训团队');
    expect(detail.data.updateUserName).toBe('学生 A');

    const saved = await save(studentBToken, projectId, '{"by":"student_b"}');
    expect(saved.code).toBe(200);

    const teamList = await list(studentBToken, `&scope=team&teamId=${teamId}`);
    expect(teamList.count).toBe(1);
    expect(teamList.data[0]?.id).toBe(projectId);
    expect(teamList.data[0]?.version).toBe(1);

    const outsiderTeamList = await list(studentCToken, `&scope=team&teamId=${teamId}`);
    expect(outsiderTeamList.code).toBe(403);

    const outsiderSave = await save(studentCToken, projectId, '{"hack":true}');
    expect(outsiderSave.code).toBe(403);

    const outsiderDetail = readJson<{ content: string }>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/project/getData?projectId=${projectId}`,
        headers: authHeaders(studentCToken)
      })
    );
    expect(outsiderDetail.data.content).toBe('');

    const memberDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/project/delete?ids=${projectId}`,
      headers: authHeaders(studentBToken)
    });
    expect(readJson<unknown>(memberDelete).code).toBe(403);

    const leaderDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/project/delete?ids=${projectId}`,
      headers: authHeaders(teacherToken)
    });
    expect(readJson<unknown>(leaderDelete).code).toBe(200);

    const allAsStudent = await list(studentAToken, '&scope=all');
    expect(allAsStudent.code).toBe(403);
  });

  it('乐观锁：版本冲突返回 409，force 强制覆盖，保存成功返回新版本', async () => {
    const teamId = await createTeam(teacherToken);
    await addMembers(teamId, teacherToken, [studentAId, studentBId]);
    const projectId = await createProject(studentAToken, '并发大屏', teamId);

    const first = await save(studentAToken, projectId, '{"step":1}', { version: '0' });
    expect(first.code).toBe(200);
    expect(first.data.version).toBe(1);

    const stale = await save(studentBToken, projectId, '{"step":2}', { version: '0' });
    expect(stale.code).toBe(409);
    const conflict = stale.data as unknown as ConflictData;
    expect(conflict.version).toBe(1);
    expect(conflict.updateUserName).toBe('学生 A');
    expect(Date.parse(conflict.updateTime)).not.toBeNaN();

    const second = await save(studentBToken, projectId, '{"step":2}', { version: '1' });
    expect(second.code).toBe(200);
    expect(second.data.version).toBe(2);

    const forced = await save(studentAToken, projectId, '{"step":3}', {
      version: '1',
      force: '1'
    });
    expect(forced.code).toBe(200);
    expect(forced.data.version).toBe(3);

    const detail = readJson<ProjectDetail>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/project/getData?projectId=${projectId}`,
        headers: authHeaders(studentAToken)
      })
    );
    expect(detail.data.content).toBe('{"step":3}');
    expect(detail.data.version).toBe(3);
    expect(detail.data.updateUserName).toBe('学生 A');

    const legacy = await save(studentBToken, projectId, '{"step":4}');
    expect(legacy.code).toBe(200);
    expect(legacy.data.version).toBe(4);
  });

  it('删除团队后项目 teamId 置空，成员不再有访问权限', async () => {
    const teamId = await createTeam(teacherToken);
    await addMembers(teamId, teacherToken, [studentAId, studentBId]);
    const projectId = await createProject(studentAToken, '待迁移大屏', teamId);

    const deleteResponse = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/team/delete?id=${teamId}`,
      headers: authHeaders(teacherToken)
    });
    expect(readJson<unknown>(deleteResponse).code).toBe(200);

    const row = await ctx.app.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(row.teamId).toBeNull();
    expect(row.ownerId).toBe(studentAId);

    const ownerList = await list(studentAToken, '&scope=mine');
    expect(ownerList.data.map((item) => item.id)).toContain(projectId);
    expect(ownerList.data.find((item) => item.id === projectId)?.teamId).toBe('');

    const memberDetail = readJson<{ content: string }>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/project/getData?projectId=${projectId}`,
        headers: authHeaders(studentBToken)
      })
    );
    expect(memberDetail.data.content).toBe('');

    const teamList = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/team/list',
      headers: authHeaders(teacherToken)
    });
    expect(readJson<TeamListItem[]>(teamList).data).toHaveLength(0);

    const outsiderDeleteTeam = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/team/delete?id=${teamId}`,
      headers: authHeaders(studentCToken)
    });
    expect(readJson<unknown>(outsiderDeleteTeam).code).toBe(404);
  });
});
