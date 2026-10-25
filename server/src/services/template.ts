import type { PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';
import {
  accessTargetOf,
  nextSortOrder,
  projectInclude,
  toProjectItem,
  type ProjectItem
} from './project.js';
import {
  assertTeamMembership,
  canWriteProject,
  getMemberTeamIds
} from './project-access.js';

export const TEMPLATE_CATEGORIES = ['campus', 'device', 'data', 'other'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface SetTemplateInput {
  id: string;
  isTemplate: boolean;
  templateCategory?: TemplateCategory;
}

export interface CreateFromTemplateInput {
  templateId: string;
  projectName: string;
  teamId?: string;
}

export async function setProjectTemplate(
  prisma: PrismaClient,
  user: AuthUser,
  input: SetTemplateInput
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: input.id, deletedAt: null },
    include: projectInclude
  });
  if (!project) throw new BizError(404, '项目不存在');

  const memberTeamIds = await getMemberTeamIds(prisma, user.id);
  if (!canWriteProject(user, accessTargetOf(project), memberTeamIds)) {
    throw new BizError(403, '无权限操作该项目');
  }

  if (input.isTemplate) {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        isTemplate: true,
        templateCategory:
          input.templateCategory ?? project.templateCategory ?? 'other',
        updatedById: user.id
      }
    });
    return;
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { isTemplate: false, templateCategory: null, updatedById: user.id }
  });
}

export async function listTemplates(
  prisma: PrismaClient,
  category?: TemplateCategory
): Promise<ProjectItem[]> {
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      isTemplate: true,
      ...(category ? { templateCategory: category } : {})
    },
    include: projectInclude,
    orderBy: { updatedAt: 'desc' }
  });
  return projects.map(toProjectItem);
}

export async function createProjectFromTemplate(
  prisma: PrismaClient,
  user: AuthUser,
  input: CreateFromTemplateInput
): Promise<{ id: string }> {
  const template = await prisma.project.findFirst({
    where: { id: input.templateId, deletedAt: null, isTemplate: true },
    select: {
      id: true,
      remarks: true,
      indexImage: true,
      content: true
    }
  });
  if (!template) throw new BizError(404, '模板不存在');

  let teamId: string | null = null;
  if (input.teamId) {
    await assertTeamMembership(prisma, user.id, input.teamId);
    teamId = input.teamId;
  }

  const project = await prisma.project.create({
    data: {
      projectName: input.projectName,
      remarks: template.remarks,
      indexImage: template.indexImage,
      state: -1,
      isTemplate: false,
      templateCategory: null,
      sortOrder: await nextSortOrder(prisma, user),
      content: template.content,
      version: 0,
      ownerId: user.id,
      teamId,
      updatedById: user.id
    }
  });
  return { id: project.id };
}
