import type { Prisma, PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';

export type ProjectScope = 'mine' | 'team' | 'all';

export interface ProjectAccessTarget {
  ownerId: string;
  teamId: string | null;
  teamLeaderId?: string | null;
}

export async function getMemberTeamIds(
  prisma: PrismaClient,
  userId: string
): Promise<Set<string>> {
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true }
  });
  return new Set(rows.map((row) => row.teamId));
}

export function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin';
}

export function canReadProject(
  user: AuthUser,
  project: ProjectAccessTarget,
  memberTeamIds: ReadonlySet<string>
): boolean {
  if (isAdmin(user)) return true;
  if (user.id === project.ownerId) return true;
  return project.teamId !== null && memberTeamIds.has(project.teamId);
}

export function canWriteProject(
  user: AuthUser,
  project: ProjectAccessTarget,
  memberTeamIds: ReadonlySet<string>
): boolean {
  return canReadProject(user, project, memberTeamIds);
}

export function canDeleteProject(
  user: AuthUser,
  project: ProjectAccessTarget,
  memberTeamIds: ReadonlySet<string>
): boolean {
  if (isAdmin(user)) return true;
  if (user.id === project.ownerId) return true;
  return (
    project.teamId !== null &&
    project.teamLeaderId === user.id &&
    memberTeamIds.has(project.teamId)
  );
}

export async function assertTeamExists(
  prisma: PrismaClient,
  teamId: string
): Promise<void> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) throw new BizError(404, '团队不存在');
}

export async function assertTeamMembership(
  prisma: PrismaClient,
  userId: string,
  teamId: string
): Promise<void> {
  await assertTeamExists(prisma, teamId);
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { id: true }
  });
  if (!member) throw new BizError(403, '您不是该团队成员');
}

export async function assertTeamReadable(
  prisma: PrismaClient,
  user: AuthUser,
  teamId: string
): Promise<void> {
  if (isAdmin(user)) {
    await assertTeamExists(prisma, teamId);
    return;
  }
  await assertTeamMembership(prisma, user.id, teamId);
}

export async function projectListWhere(
  prisma: PrismaClient,
  user: AuthUser,
  scope?: ProjectScope,
  teamId?: string
): Promise<Prisma.ProjectWhereInput> {
  const where: Prisma.ProjectWhereInput = { deletedAt: null };
  const effective: ProjectScope = scope ?? (isAdmin(user) ? 'all' : 'mine');

  if (effective === 'mine') {
    where.ownerId = user.id;
    return where;
  }

  if (effective === 'team') {
    if (!teamId) throw new BizError(400, 'teamId 不能为空');
    await assertTeamReadable(prisma, user, teamId);
    where.teamId = teamId;
    return where;
  }

  if (!isAdmin(user)) throw new BizError(403, '无权限查看全部项目');
  return where;
}
