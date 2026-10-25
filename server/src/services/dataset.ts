import { Prisma, type Dataset, type PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';
import { decryptJson, encryptJson } from './dataset-crypto.js';
import {
  fetchDataset,
  parseDatasetConfig,
  redactDatasetConfig,
  type DatasetConfig,
  type DatasetType
} from './dataset-providers.js';

const datasetInclude = {
  owner: { select: { username: true, nickname: true } }
} satisfies Prisma.DatasetInclude;

type DatasetRow = Prisma.DatasetGetPayload<{ include: typeof datasetInclude }>;

export interface DatasetItem {
  id: string;
  name: string;
  type: string;
  config: DatasetConfig;
  createUserId: string;
  createUserName: string;
  createTime: string;
  updateTime: string;
}

export interface DatasetInput {
  name: string;
  type: DatasetType;
  config: unknown;
}

export interface DatasetTestResult {
  data: unknown;
  truncated: boolean;
}

function canManage(user: AuthUser, ownerId: string): boolean {
  return user.role === 'admin' || user.id === ownerId;
}

function toDatasetItem(row: DatasetRow, jwtSecret: string): DatasetItem {
  const config = decryptJson<DatasetConfig>(row.config, jwtSecret);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: redactDatasetConfig(row.type, config),
    createUserId: row.ownerId,
    createUserName: row.owner.nickname || row.owner.username,
    createTime: row.createdAt.toISOString(),
    updateTime: row.updatedAt.toISOString()
  };
}

async function findDataset(
  prisma: PrismaClient,
  id: string
): Promise<DatasetRow> {
  const row = await prisma.dataset.findUnique({ where: { id }, include: datasetInclude });
  if (!row) throw new BizError(404, '数据集不存在');
  return row;
}

export async function listDatasets(
  prisma: PrismaClient,
  user: AuthUser,
  jwtSecret: string,
  params: { page: number; limit: number; keyword?: string }
): Promise<{ data: DatasetItem[]; count: number }> {
  const where: Prisma.DatasetWhereInput = {};
  if (user.role !== 'admin') where.ownerId = user.id;
  if (params.keyword) where.name = { contains: params.keyword };
  const [rows, count] = await Promise.all([
    prisma.dataset.findMany({
      where,
      include: datasetInclude,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit
    }),
    prisma.dataset.count({ where })
  ]);
  return { data: rows.map((row) => toDatasetItem(row, jwtSecret)), count };
}

export async function createDataset(
  prisma: PrismaClient,
  user: AuthUser,
  jwtSecret: string,
  input: DatasetInput
): Promise<{ id: string }> {
  const config = parseDatasetConfig(input.type, input.config);
  const row = await prisma.dataset.create({
    data: {
      name: input.name,
      type: input.type,
      config: encryptJson(config, jwtSecret),
      ownerId: user.id
    }
  });
  return { id: row.id };
}

export async function editDataset(
  prisma: PrismaClient,
  user: AuthUser,
  jwtSecret: string,
  input: { id: string; name?: string; config?: unknown }
): Promise<void> {
  const row = await findDataset(prisma, input.id);
  if (!canManage(user, row.ownerId)) throw new BizError(403, '无权限修改该数据集');

  const data: Prisma.DatasetUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.config !== undefined) {
    const oldConfig = decryptJson<DatasetConfig>(row.config, jwtSecret);
    const raw = { ...(input.config as Record<string, unknown>) };
    if (row.type === 'mysql' && !raw.password) {
      raw.password = (oldConfig as { password?: string }).password ?? '';
    }
    const config = parseDatasetConfig(row.type, raw);
    data.config = encryptJson(config, jwtSecret);
  }
  await prisma.dataset.update({ where: { id: row.id }, data });
}

export async function deleteDatasets(
  prisma: PrismaClient,
  user: AuthUser,
  ids: string[]
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) throw new BizError(400, 'ids 不能为空');
  const rows = await prisma.dataset.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, ownerId: true }
  });
  if (rows.length === 0) throw new BizError(404, '数据集不存在');
  for (const row of rows) {
    if (!canManage(user, row.ownerId)) throw new BizError(403, '无权限删除该数据集');
  }
  await prisma.dataset.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
}

function truncateUtf8(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.byteLength <= maxBytes) return text;
  return buffer.subarray(0, maxBytes).toString('utf8').replace(/\uFFFD$/, '');
}

export function makePreview(data: unknown): DatasetTestResult {
  const limited = Array.isArray(data) ? data.slice(0, 50) : data;
  const json = JSON.stringify(limited);
  if (Buffer.byteLength(json, 'utf8') <= 64 * 1024) {
    return { data: limited, truncated: false };
  }
  return {
    data: { preview: truncateUtf8(json, 63 * 1024), truncated: true },
    truncated: true
  };
}

async function loadConfig(
  prisma: PrismaClient,
  jwtSecret: string,
  type: string,
  rawConfig: unknown
): Promise<DatasetConfig> {
  return parseDatasetConfig(type, rawConfig);
}

export async function testDataset(
  prisma: PrismaClient,
  user: AuthUser,
  jwtSecret: string,
  input: { id?: string; type?: string; config?: unknown }
): Promise<DatasetTestResult> {
  let type: string;
  let config: DatasetConfig;
  if (input.id) {
    const row = await findDataset(prisma, input.id);
    if (!canManage(user, row.ownerId)) throw new BizError(403, '无权限测试该数据集');
    type = row.type;
    config = decryptJson<DatasetConfig>(row.config, jwtSecret);
  } else {
    if (!input.type) throw new BizError(400, 'type 不能为空');
    type = input.type;
    config = await loadConfig(prisma, jwtSecret, type, input.config);
  }
  const data = await fetchDataset(type, config);
  return makePreview(data);
}

export async function resolveDatasetForOpen(
  prisma: PrismaClient,
  jwtSecret: string,
  id: string
): Promise<{ dataset: Dataset; config: DatasetConfig }> {
  const dataset = await prisma.dataset.findUnique({ where: { id } });
  if (!dataset) throw new BizError(404, '数据集不存在');
  return { dataset, config: decryptJson<DatasetConfig>(dataset.config, jwtSecret) };
}
