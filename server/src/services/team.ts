import type { PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';
import { isAdmin } from './project-access.js';

export interface TeamListItem {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string;
  memberCount: number;
  createTime: string;
}

export interface TeamMemberItem {
  userId: string;
  username: string;
  nickname: string;
  role: string;
}

export interface TeamDetail extends TeamListItem {
  members: TeamMemberItem[];
}

export interface UserOption {
  id: string;
  username: string;
  nickname: string;
  role: string;
}

const teamInclude = {
  leader: { select: { username: true, nickname: true } },
  members: {
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: { username: true, nickname: true, role: true } } }
  }
};

function leaderName(leader: { nickname: string; username: string }): string {
  return leader.nickname || leader.username;
}

async function findTeamOrThrow(prisma: PrismaClient, id: string) {
  const team = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  if (!team) throw new BizError(404, '团队不存在');
  return team;
}

function isTeamMember(team: { members: { userId: string }[] }, userId: string): boolean {
  return team.members.some((member) => member.userId === userId);
}

async function assertTeamManager(
  prisma: PrismaClient,
  user: AuthUser,
  id: string
) {
  const team = await findTeamOrThrow(prisma, id);
  if (!isAdmin(user) && team.leaderId !== user.id) {
    throw new BizError(403, '无权限管理该团队');
  }
  return team;
}

async function findEnabledUserOrThrow(prisma: PrismaClient, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new BizError(400, '所选用户不存在');
  if (target.disabled) throw new BizError(400, '所选用户已被禁用');
  return target;
}

export async function listTeams(
  prisma: PrismaClient,
  user: AuthUser
): Promise<TeamListItem[]> {
  const where = isAdmin(user)
    ? {}
    : {
        OR: [{ leaderId: user.id }, { members: { some: { userId: user.id } } }]
      };

  const teams = await prisma.team.findMany({
    where,
    include: {
      leader: { select: { username: true, nickname: true } },
      _count: { select: { members: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    leaderId: team.leaderId,
    leaderName: leaderName(team.leader),
    memberCount: team._count.members,
    createTime: team.createdAt.toISOString()
  }));
}

export async function getTeamDetail(
  prisma: PrismaClient,
  user: AuthUser,
  id: string
): Promise<TeamDetail> {
  const team = await findTeamOrThrow(prisma, id);
  if (!isAdmin(user) && !isTeamMember(team, user.id)) {
    throw new BizError(403, '无权限查看该团队');
  }

  return {
    id: team.id,
    name: team.name,
    leaderId: team.leaderId,
    leaderName: leaderName(team.leader),
    memberCount: team.members.length,
    createTime: team.createdAt.toISOString(),
    members: team.members.map((member) => ({
      userId: member.userId,
      username: member.user.username,
      nickname: member.user.nickname,
      role: member.user.role
    }))
  };
}

export async function createTeam(
  prisma: PrismaClient,
  user: AuthUser,
  input: { name: string; leaderId?: string }
): Promise<{ id: string }> {
  const leaderId = input.leaderId || user.id;
  const leader = await findEnabledUserOrThrow(prisma, leaderId);
  const memberIds = new Set<string>([user.id, leader.id]);

  const team = await prisma.team.create({
    data: {
      name: input.name,
      leaderId: leader.id,
      members: {
        create: [...memberIds].map((userId) => ({ userId }))
      }
    }
  });
  return { id: team.id };
}

export async function editTeam(
  prisma: PrismaClient,
  user: AuthUser,
  input: { id: string; name?: string; leaderId?: string }
): Promise<void> {
  const team = await assertTeamManager(prisma, user, input.id);
  const data: { name?: string; leaderId?: string } = {};
  if (input.name !== undefined) data.name = input.name;

  if (input.leaderId !== undefined && input.leaderId !== team.leaderId) {
    const leader = await findEnabledUserOrThrow(prisma, input.leaderId);
    data.leaderId = leader.id;
    if (!isTeamMember(team, leader.id)) {
      await prisma.teamMember.create({
        data: { teamId: team.id, userId: leader.id }
      });
    }
  }

  await prisma.team.update({ where: { id: team.id }, data });
}

export async function deleteTeam(
  prisma: PrismaClient,
  user: AuthUser,
  id: string
): Promise<void> {
  const team = await assertTeamManager(prisma, user, id);
  await prisma.$transaction([
    prisma.project.updateMany({
      where: { teamId: team.id },
      data: { teamId: null }
    }),
    prisma.team.delete({ where: { id: team.id } })
  ]);
}

export async function addTeamMembers(
  prisma: PrismaClient,
  user: AuthUser,
  id: string,
  userIds: string[]
): Promise<void> {
  const team = await assertTeamManager(prisma, user, id);
  const uniqueIds = [...new Set(userIds)].filter((userId) => userId.length > 0);
  if (uniqueIds.length === 0) throw new BizError(400, '请选择要添加的成员');

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, disabled: false },
    select: { id: true }
  });
  if (users.length !== uniqueIds.length) {
    throw new BizError(400, '部分用户不存在或已被禁用');
  }

  const existing = await prisma.teamMember.findMany({
    where: { teamId: team.id, userId: { in: uniqueIds } },
    select: { userId: true }
  });
  const existingIds = new Set(existing.map((row) => row.userId));
  const toCreate = uniqueIds.filter((userId) => !existingIds.has(userId));
  if (toCreate.length === 0) return;

  await prisma.teamMember.createMany({
    data: toCreate.map((userId) => ({ teamId: team.id, userId }))
  });
}

export async function removeTeamMember(
  prisma: PrismaClient,
  user: AuthUser,
  id: string,
  userId: string
): Promise<void> {
  const team = await assertTeamManager(prisma, user, id);
  if (userId === team.leaderId) {
    throw new BizError(400, '不能移除团队负责人，请先更换负责人');
  }
  await prisma.teamMember.deleteMany({
    where: { teamId: team.id, userId }
  });
}

export async function listUserOptions(
  prisma: PrismaClient,
  keyword: string
): Promise<UserOption[]> {
  const users = await prisma.user.findMany({
    where: {
      disabled: false,
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { nickname: { contains: keyword } }
            ]
          }
        : {})
    },
    select: { id: true, username: true, nickname: true, role: true },
    orderBy: { username: 'asc' },
    take: 50
  });
  return users;
}
