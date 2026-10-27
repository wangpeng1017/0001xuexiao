import { Prisma, type PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';
import {
  assertTeamMembership,
  canDeleteProject,
  canReadProject,
  canWriteProject,
  getMemberTeamIds,
  projectListWhere,
  type ProjectScope
} from './project-access.js';

export const projectInclude = {
  owner: { select: { username: true, nickname: true } },
  updatedBy: { select: { username: true, nickname: true } },
  team: { select: { id: true, name: true, leaderId: true } }
} satisfies Prisma.ProjectInclude;

export type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

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
  teamId: string;
  teamName: string;
  isTemplate: boolean;
  templateCategory: string;
  version: number;
  updateUserName: string;
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
  teamId?: string;
}

export interface EditProjectInput {
  id: string;
  projectName?: string;
  indexImage?: string;
  remarks?: string;
}

export interface SaveProjectOptions {
  version?: number;
  force?: boolean;
}

export interface VersionConflictData {
  updateUserName: string;
  updateTime: string;
  version: number;
}

export class VersionConflictError extends Error {
  readonly code = 409;
  readonly data: VersionConflictData;

  constructor(data: VersionConflictData) {
    super('项目已被他人修改');
    this.name = 'VersionConflictError';
    this.data = data;
  }
}

function displayName(user: { nickname: string; username: string } | null): string {
  if (!user) return '';
  return user.nickname || user.username;
}

export function toProjectItem(project: ProjectRow): ProjectItem {
  return {
    id: project.id,
    projectName: project.projectName,
    state: project.state,
    createTime: project.createdAt.toISOString(),
    updateTime: project.updatedAt.toISOString(),
    indexImage: project.indexImage ?? '',
    createUserId: project.ownerId,
    createUserName: displayName(project.owner),
    remarks: project.remarks ?? '',
    sortOrder: project.sortOrder,
    teamId: project.teamId ?? '',
    teamName: project.team?.name ?? '',
    isTemplate: project.isTemplate,
    templateCategory: project.templateCategory ?? '',
    version: project.version,
    updateUserName: displayName(project.updatedBy)
  };
}

function toProjectDetail(project: ProjectRow): ProjectDetail {
  return {
    ...toProjectItem(project),
    content: project.content
  };
}

function assertProjectPermission(allowed: boolean, message: string): void {
  if (!allowed) throw new BizError(403, message);
}

export async function findProjectOrThrow(
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

export function accessTargetOf(project: ProjectRow) {
  return {
    ownerId: project.ownerId,
    teamId: project.teamId,
    teamLeaderId: project.team?.leaderId ?? null
  };
}

export async function nextSortOrder(prisma: PrismaClient, user: AuthUser): Promise<number> {
  const where = await projectListWhere(prisma, user, 'mine');
  const result = await prisma.project.aggregate({
    where,
    _min: { sortOrder: true }
  });
  return (result._min.sortOrder ?? 0) - 1;
}

export async function listProjects(
  prisma: PrismaClient,
  user: AuthUser,
  params: { page: number; limit: number; scope?: ProjectScope; teamId?: string }
): Promise<{ data: ProjectItem[]; count: number }> {
  const where = await projectListWhere(prisma, user, params.scope, params.teamId);

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
  let teamId: string | null = null;
  if (input.teamId) {
    await assertTeamMembership(prisma, user.id, input.teamId);
    teamId = input.teamId;
  }

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
      teamId,
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
  let hasFullAccess = false;
  if (currentUser) {
    const memberTeamIds = await getMemberTeamIds(prisma, currentUser.id);
    hasFullAccess = canReadProject(currentUser, accessTargetOf(project), memberTeamIds);
  }
  if (!hasFullAccess && project.state !== 1) {
    return { id: project.id, state: -1, content: '' };
  }
  return toProjectDetail(project);
}

function assertWritable(
  user: AuthUser,
  project: ProjectRow,
  memberTeamIds: ReadonlySet<string>
): void {
  assertProjectPermission(
    canWriteProject(user, accessTargetOf(project), memberTeamIds),
    '无权限操作该项目'
  );
}

async function findWritableProject(
  prisma: PrismaClient,
  user: AuthUser,
  projectId: string
): Promise<ProjectRow> {
  const project = await findProjectOrThrow(prisma, projectId);
  const memberTeamIds = await getMemberTeamIds(prisma, user.id);
  assertWritable(user, project, memberTeamIds);
  return project;
}

function conflictDataOf(project: ProjectRow): VersionConflictData {
  return {
    updateUserName: displayName(project.updatedBy) || displayName(project.owner),
    updateTime: project.updatedAt.toISOString(),
    version: project.version
  };
}

export async function saveProjectContent(
  prisma: PrismaClient,
  user: AuthUser,
  projectId: string,
  content: string,
  options: SaveProjectOptions = {}
): Promise<{ version: number }> {
  const project = await findWritableProject(prisma, user, projectId);
  const updateData = {
    content,
    version: { increment: 1 },
    updatedById: user.id
  };

  if (options.version === undefined || options.force) {
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: updateData,
      select: { version: true }
    });
    return { version: updated.version };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.project.updateMany({
      where: { id: project.id, deletedAt: null, version: options.version },
      data: updateData
    });
    if (result.count === 0) return null;
    return tx.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { version: true }
    });
  });

  if (updated) return { version: updated.version };

  const current = await findProjectOrThrow(prisma, project.id);
  throw new VersionConflictError(conflictDataOf(current));
}

export async function editProject(
  prisma: PrismaClient,
  user: AuthUser,
  input: EditProjectInput
): Promise<void> {
  const project = await findWritableProject(prisma, user, input.id);

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
    include: projectInclude
  });
  if (projects.length === 0) throw new BizError(404, '项目不存在');

  const memberTeamIds = await getMemberTeamIds(prisma, user.id);
  for (const project of projects) {
    assertProjectPermission(
      canDeleteProject(user, accessTargetOf(project), memberTeamIds),
      '无权限删除该项目'
    );
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
  const project = await findWritableProject(prisma, user, projectId);
  if (state === 1 && isEmptyProjectContent(project.content)) {
    throw new BizError(400, '项目还没有内容，请先在编辑器里添加组件并保存，再发布');
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { state, updatedById: user.id }
  });
}

// 从未保存过（空串、{}）或画布上没有任何组件的项目，发布出来只会是黑屏
function isEmptyProjectContent(content: string): boolean {
  if (!content.trim()) return true;
  try {
    const data: unknown = JSON.parse(content);
    if (typeof data !== 'object' || data === null) return false;
    const record = data as Record<string, unknown>;
    if (Object.keys(record).length === 0) return true;
    return Array.isArray(record.componentList) && record.componentList.length === 0;
  } catch {
    return false;
  }
}

export async function copyProject(
  prisma: PrismaClient,
  user: AuthUser,
  projectId: string
): Promise<{ id: string }> {
  const source = await findWritableProject(prisma, user, projectId);

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
      teamId: null,
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

  const projects = await prisma.project.findMany({
    where: { id: { in: uniqueIds }, deletedAt: null },
    include: projectInclude
  });
  const memberTeamIds = await getMemberTeamIds(prisma, user.id);
  const allowed = new Set(
    projects
      .filter((project) => canWriteProject(user, accessTargetOf(project), memberTeamIds))
      .map((project) => project.id)
  );
  const updates = uniqueIds
    .filter((id) => allowed.has(id))
    .map((id, index) =>
      prisma.project.update({ where: { id }, data: { sortOrder: index } })
    );

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}
