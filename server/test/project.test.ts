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
  multipartBody,
  readJson,
  seedUser,
  type TestContext
} from './helpers.js';

interface CreatedProject {
  id: string;
}

describe('大屏项目全流程', () => {
  let ctx: TestContext;
  let ownerId: string;
  let ownerToken: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    const owner = await seedUser(ctx.app, {
      username: 'owner01',
      nickname: '项目老师',
      role: 'teacher'
    });
    ownerId = owner.id;
    ownerToken = await loginToken(ctx.app, 'owner01');
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function createProject(
    projectName: string,
    extra: Record<string, string> = {}
  ): Promise<string> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/create',
      headers: authHeaders(ownerToken),
      payload: { projectName, ...extra }
    });
    const body = readJson<CreatedProject>(response);
    expect(body.code).toBe(200);
    return body.data.id;
  }

  async function listProjects(): Promise<{ data: ProjectItem[]; count: number }> {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/list?page=1&limit=10',
      headers: authHeaders(ownerToken)
    });
    const body = readJson<ProjectItem[]>(response);
    expect(body.code).toBe(200);
    return { data: body.data, count: body.count ?? 0 };
  }

  async function getProjectData(
    projectId: string,
    authenticated = true
  ): Promise<ProjectDetail | LimitedProjectData> {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/project/getData?projectId=${encodeURIComponent(projectId)}`,
      headers: authenticated ? authHeaders(ownerToken) : {}
    });
    const body = readJson<ProjectDetail | LimitedProjectData>(response);
    expect(body.code).toBe(200);
    return body.data;
  }

  it('create → 排序 → 保存（两种格式） → 重命名 → 复制 → 排序 → 发布/取消发布 → 删除', async () => {
    const first = await createProject('大屏一', { remarks: '第一个项目' });
    const second = await createProject('大屏二');
    const third = await createProject('大屏三');

    const initialList = await listProjects();
    expect(initialList.count).toBe(3);
    expect(initialList.data.map((item) => item.id)).toEqual([third, second, first]);
    const firstItem = initialList.data.find((item) => item.id === first)!;
    expect(firstItem).toMatchObject({
      projectName: '大屏一',
      state: -1,
      indexImage: '',
      createUserId: ownerId,
      createUserName: '项目老师',
      remarks: '第一个项目'
    });
    expect(typeof firstItem.sortOrder).toBe('number');
    expect(Date.parse(firstItem.createTime)).not.toBeNaN();
    expect(Date.parse(firstItem.updateTime)).not.toBeNaN();

    const contentOne = JSON.stringify({
      canvas: { width: 1920, height: 1080 },
      widgets: [{ type: 'bar', x: 10 }]
    });
    const urlencodedSave = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/save/data',
      headers: {
        ...authHeaders(ownerToken),
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: new URLSearchParams({ projectId: first, content: contentOne }).toString()
    });
    expect(readJson<unknown>(urlencodedSave).code).toBe(200);

    const firstDetail = (await getProjectData(first)) as ProjectDetail;
    expect(firstDetail.content).toBe(contentOne);
    expect(firstDetail.projectName).toBe('大屏一');

    const contentTwo = JSON.stringify({ mode: 'multipart', nested: { a: 1 } });
    const multipartSave = multipartBody([
      { name: 'projectId', value: second },
      { name: 'content', value: contentTwo }
    ]);
    const multipartSaveResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/save/data',
      headers: { ...authHeaders(ownerToken), ...multipartSave.headers },
      payload: multipartSave.payload
    });
    expect(readJson<unknown>(multipartSaveResponse).code).toBe(200);

    const secondDetail = await getProjectData(second);
    expect(secondDetail.content).toBe(contentTwo);

    const anonymousDraft = await getProjectData(second, false);
    expect(anonymousDraft).toEqual({ id: second, state: -1, content: '' });

    const missing = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/getData?projectId=not-exist'
    });
    expect(readJson<unknown>(missing).code).toBe(404);

    const renameResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/edit',
      headers: authHeaders(ownerToken),
      payload: { id: first, projectName: '大屏一改', remarks: '已改名' }
    });
    expect(readJson<unknown>(renameResponse).code).toBe(200);
    const renamedDetail = (await getProjectData(first)) as ProjectDetail;
    expect(renamedDetail.projectName).toBe('大屏一改');

    const copyResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/copy',
      headers: authHeaders(ownerToken),
      payload: { id: first }
    });
    const copyBody = readJson<CreatedProject>(copyResponse);
    expect(copyBody.code).toBe(200);
    const copied = copyBody.data.id;
    expect(copied).not.toBe(first);

    const copiedDetail = (await getProjectData(copied)) as ProjectDetail;
    expect(copiedDetail.projectName).toBe('大屏一改-副本');
    expect(copiedDetail.content).toBe(contentOne);
    expect(copiedDetail.state).toBe(-1);

    const listAfterCopy = await listProjects();
    expect(listAfterCopy.count).toBe(4);
    expect(listAfterCopy.data[0]?.id).toBe(copied);

    const sortResponse = await ctx.app.inject({
      method: 'PUT',
      url: '/api/goview/project/sort',
      headers: authHeaders(ownerToken),
      payload: { ids: [second, first, copied, third] }
    });
    expect(readJson<unknown>(sortResponse).code).toBe(200);

    const sortedList = await listProjects();
    expect(sortedList.data.map((item) => item.id)).toEqual([
      second,
      first,
      copied,
      third
    ]);

    const publishResponse = await ctx.app.inject({
      method: 'PUT',
      url: '/api/goview/project/publish',
      headers: authHeaders(ownerToken),
      payload: { id: first, state: 1 }
    });
    expect(readJson<unknown>(publishResponse).code).toBe(200);

    const publishedAnonymous = await getProjectData(first, false);
    expect(publishedAnonymous).toMatchObject({
      id: first,
      projectName: '大屏一改',
      state: 1,
      content: contentOne
    });

    const unpublishResponse = await ctx.app.inject({
      method: 'PUT',
      url: '/api/goview/project/publish',
      headers: authHeaders(ownerToken),
      payload: { id: first, state: -1 }
    });
    expect(readJson<unknown>(unpublishResponse).code).toBe(200);

    const unpublishAnonymous = await getProjectData(first, false);
    expect(unpublishAnonymous).toEqual({ id: first, state: -1, content: '' });

    const ownerStillReadsDraft = await getProjectData(first);
    expect(ownerStillReadsDraft.content).toBe(contentOne);

    const deleteResponse = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/project/delete?ids=${encodeURIComponent(second)}`,
      headers: authHeaders(ownerToken)
    });
    expect(readJson<unknown>(deleteResponse).code).toBe(200);

    const finalList = await listProjects();
    expect(finalList.count).toBe(3);
    expect(finalList.data.some((item) => item.id === second)).toBe(false);

    const deletedGetData = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/project/getData?projectId=${encodeURIComponent(second)}`
    });
    expect(readJson<unknown>(deletedGetData).code).toBe(404);
  });

  it('参数校验与未登录保护', async () => {
    const emptyName = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/create',
      headers: authHeaders(ownerToken),
      payload: { projectName: '   ' }
    });
    const emptyNameBody = readJson<unknown>(emptyName);
    expect(emptyName.statusCode).toBe(200);
    expect(emptyNameBody.code).toBe(400);

    const longName = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/create',
      headers: authHeaders(ownerToken),
      payload: { projectName: 'x'.repeat(51) }
    });
    expect(readJson<unknown>(longName).code).toBe(400);

    const missingContent = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/save/data',
      headers: authHeaders(ownerToken),
      payload: { projectId: 'anything' }
    });
    expect(readJson<unknown>(missingContent).code).toBe(400);

    const missingProjectId = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/getData'
    });
    expect(readJson<unknown>(missingProjectId).code).toBe(400);

    const projectId = await createProject('发布校验');
    const badState = await ctx.app.inject({
      method: 'PUT',
      url: '/api/goview/project/publish',
      headers: authHeaders(ownerToken),
      payload: { id: projectId, state: 0 }
    });
    expect(readJson<unknown>(badState).code).toBe(400);

    const noToken = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/project/list'
    });
    const noTokenBody = readJson<unknown>(noToken);
    expect(noToken.statusCode).toBe(200);
    expect(noTokenBody.code).toBe(886);
  });
});
