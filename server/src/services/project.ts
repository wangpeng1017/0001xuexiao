import { Prisma, type PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';

const projectInclude = {
  owner: { select: { username: true, nickname: true } }
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

export interface ProjectItem {
  id: string;
  projectName: string;
  state: number;
  createTime: string;
  updateTime: string;
  indexImage: string;
  createUserId: string;
  createUserName: string;
  remarks: string;
  sortOrder: number;
}

export interface ProjectDetail extends ProjectItem {
  content: string;
}

export interface LimitedProjectData {
  id: string;
  state: -1;
  content: '';
}

export interface CreateProjectInput {
  projectName: string;
  remarks?: string;
  indexImage?: string;
}

export interface EditProjectInput {
  id: string;
  projectName?: string;
  indexImage?: string;
  remarks?: string;
}

function toProjectItem(project: ProjectRow): ProjectItem {
  return {
    id: project.id,
    projectName: project.projectName,
    state: project.state,
    createTime: project.createdAt.toISOString(),
    updateTime: project.updatedAt.toISOString(),
    indexImage: project.indexImage ?? '',
    createUserId: project.ownerId,
    createUserName: project.owner.nickname || project.owner.username,
    remarks: project.remarks ?? '',
    sortOrder: project.sortOrder
  };
}

function toProjectDetail(project: ProjectRow): ProjectDetail {
  return {
    ...toProjectItem(project),
    content: project.content
  };
}

function canManage(user: AuthUser, ownerId: string): boolean {
  return user.role === 'admin' || user.id === ownerId;
}

function assertCanManage(user: AuthUser, ownerId: string): void {
  if (!canManage(user, ownerId)) {
    throw new BizError(403, '无权限操作该项目');
  }
}

async function findProjectOrThrow(
  prisma: PrismaClient,
  projectId: string
): Promise<ProjectRow> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: projectInclude
  });
  if (!project) throw new BizError(404, '项目不存在');
  return project;
}

async function nextSortOrder(prisma: PrismaClient, user: AuthUser): Promise<number> {
  const where: Prisma.ProjectWhereInput = { deletedAt: null };
  if (user.role !== 'admin') where.ownerId = user.id;
  const result = await prisma.project.aggregate({
    where,
    _min: { sortOrder: true }
  });
  return (result._min.sortOrder ?? 0) - 1;
}

export async function listProjects(
  prisma: PrismaClient,
  user: AuthUser,
  params: { page: number; limit: number }
): Promise<{ data: ProjectItem[]; count: number }> {
  const where: Prisma.ProjectWhereInput = { deletedAt: null };
  if (user.role !== 'admin') where.ownerId = user.id;

  const [rows, count] = await Promise.all([
    prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit
    }),
    prisma.project.count({ where })
  ]);

  return { data: rows.map(toProjectItem), count };
}

export async function createProject(
  prisma: PrismaClient,
  user: AuthUser,
  input: CreateProjectInput
): Promise<{ id: string }> {
  const project = await prisma.project.create({
    data: {
      projectName: input.projectName,
      remarks: input.remarks,
      indexImage: input.indexImage,
      state: -1,
      sortOrder: await nextSortOrder(prisma, user),
      content: '{}',
      version: 0,
      ownerId: user.id,
      updatedById: user.id
    }
  });
  return { id: project.id };
}

export async function getProjectData(
  prisma: PrismaClient,
  currentUser: AuthUser | null,
  projectId: string
): Promise<ProjectDetail | LimitedProjectData> {
  const project = await findProjectOrThrow(prisma, projectId);
  const hasFullAccess = currentUser !== null && canManage(currentUser, project.ownerId);
  if (!hasFullAccess && project.state !== 1) {
    return { id: project.id, state: -1, content: '' };
  }
  return toProjectDetail(project);
}

export async function saveProjectContent(
  prisma: PrismaClient,
  user: AuthUser,
  projectId: string,
  content: string
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, ownerId: true }
  });
  if (!project) throw new BizError(404, '项目不存在');
  assertCanManage(user, project.ownerId);

  await prisma.project.update({
    where: { id: project.id },
    data: {
      content,
      version: { increment: 1 },
      updatedById: user.id
    }
  });
}

export async function editProject(
  prisma: PrismaClient,
  user: AuthUser,
  input: EditProjectInput
): Promise<void> {
  const project = await findProjectOrThrow(prisma, input.id);
  assertCanManage(user, project.ownerId);

  const data: Prisma.ProjectUncheckedUpdateInput = { updatedById: user.id };
  if (input.projectName !== undefined) data.projectName = input.projectName;
  if (input.indexImage !== undefined) data.indexImage = input.indexImage;
  if (input.remarks !== undefined) data.remarks = input.remarks;

  await prisma.project.update({ where: { id: project.id }, data });
}

export async function deleteProjects(
  prisma: PrismaClient,
  user: AuthUser,
  ids: string[]
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) throw new BizError(400, 'ids 不能为空');

  const projects = await prisma.project.findMany({
    where: { id: { in: uniqueIds }, deletedAt: null },
    select: { id: true, ownerId: true }
  });
  if (projects.length === 0) throw new BizError(404, '项目不存在');

  for (const project of projects) {
    assertCanManage(user, project.ownerId);
  }

  await prisma.project.updateMany({
    where: { id: { in: projects.map((project) => project.id) }, deletedAt: null },
    data: { deletedAt: new Date(), updatedById: user.id }
  });
}

export async function setProjectState(
  prisma: PrismaClient,
  user: AuthUser,
  projectId: string,
  state: 1 | -1
): Promise<void> {
  const project = await findProjectOrThrow(prisma, projectId);
  assertCanManage(user, project.ownerId);

  await prisma.project.update({
    where: { id: project.id },
    data: { state, updatedById: user.id }
  });
}

export async function copyProject(
  prisma: PrismaClient,
  user: AuthUser,
  projectId: string
): Promise<{ id: string }> {
  const source = await findProjectOrThrow(prisma, projectId);
  assertCanManage(user, source.ownerId);

  const copy = await prisma.project.create({
    data: {
      projectName: `${source.projectName}-副本`,
      remarks: source.remarks,
      indexImage: source.indexImage,
      state: -1,
      sortOrder: await nextSortOrder(prisma, user),
      content: source.content,
      version: 0,
      ownerId: user.id,
      updatedById: user.id
    }
  });
  return { id: copy.id };
}

export async function sortProjects(
  prisma: PrismaClient,
  user: AuthUser,
  ids: string[]
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;

  const where: Prisma.ProjectWhereInput = {
    id: { in: uniqueIds },
    deletedAt: null
  };
  if (user.role !== 'admin') where.ownerId = user.id;

  const projects = await prisma.project.findMany({
    where,
    select: { id: true }
  });
  const allowed = new Set(projects.map((project) => project.id));
  const updates = uniqueIds
    .filter((id) => allowed.has(id))
    .map((id, index) =>
      prisma.project.update({ where: { id }, data: { sortOrder: index } })
    );

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}
