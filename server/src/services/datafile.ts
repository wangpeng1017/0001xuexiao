import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Prisma, type DataFile, type PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';

export type DataFileKind = 'vector' | 'raster' | 'pointcloud' | 'tiles3d';
export type DataFileStatus = 'pending' | 'converting' | 'success' | 'failed';

const dataFileInclude = {
  owner: { select: { username: true, nickname: true } }
} satisfies Prisma.DataFileInclude;

type DataFileRow = Prisma.DataFileGetPayload<{ include: typeof dataFileInclude }>;

export interface DataFileItem {
  id: string;
  name: string;
  originFormat: string;
  kind: string;
  status: string;
  progress: number;
  errorMsg: string;
  srs: string;
  outputUrl: string;
  createTime: string;
  createUserName: string;
}

export interface DataFileListParams {
  page: number;
  limit: number;
  kind?: string;
  status?: string;
  keyword?: string;
}

const EXTENSION_FORMATS: Record<string, string> = {
  '.las': 'LAS',
  '.laz': 'LAZ',
  '.zip': 'ZIP',
  '.shp': 'SHP',
  '.gdb': 'FileGDB',
  '.geojson': 'GeoJSON',
  '.json': 'JSON',
  '.kml': 'KML',
  '.kmz': 'KMZ',
  '.gpkg': 'GPKG',
  '.gml': 'GML',
  '.csv': 'CSV',
  '.tif': 'GeoTIFF',
  '.tiff': 'GeoTIFF',
  '.img': 'HFA',
  '.vrt': 'VRT',
  '.dxf': 'DXF',
  '.tab': 'MapInfo',
  '.mif': 'MapInfo',
  '.gpx': 'GPX',
  '.sqlite': 'SQLite',
  '.3dtiles': '3D Tiles'
};

export function formatFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return EXTENSION_FORMATS[ext] ?? (ext ? ext.slice(1).toUpperCase() : '未知');
}

export function isPointCloudFormat(originFormat: string): boolean {
  return originFormat === 'LAS' || originFormat === 'LAZ';
}

export function normalizeSrs(value?: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const match = /^(?:EPSG:)?(\d{4,6})$/i.exec(raw);
  if (!match) throw new BizError(400, '坐标系格式应为 EPSG:编号');
  return `EPSG:${match[1]}`;
}

export function dataFileDirectory(dataDir: string, id: string): string {
  return path.join(dataDir, 'files', 'datafiles', id);
}

export function dataFileOutputUrl(id: string, kind: DataFileKind): string {
  if (kind === 'vector') return `/files/datafiles/${id}/data.geojson`;
  if (kind === 'raster') return `/files/datafiles/${id}/tiles/{z}/{x}/{y}.png`;
  return `/files/datafiles/${id}/3dtiles/tileset.json`;
}

export function toDataFileItem(file: DataFileRow): DataFileItem {
  return {
    id: file.id,
    name: file.name,
    originFormat: file.originFormat,
    kind: file.kind,
    status: file.status,
    progress: file.progress,
    errorMsg: file.errorMsg,
    srs: file.srs ?? '',
    outputUrl: file.outputUrl,
    createTime: file.createdAt.toISOString(),
    createUserName: file.owner.nickname || file.owner.username
  };
}

function canManage(user: AuthUser, ownerId: string): boolean {
  return user.role === 'admin' || user.id === ownerId;
}

export async function listDataFiles(
  prisma: PrismaClient,
  user: AuthUser,
  params: DataFileListParams
): Promise<{ data: DataFileItem[]; count: number }> {
  const where: Prisma.DataFileWhereInput = {};
  if (user.role !== 'admin') where.ownerId = user.id;
  if (params.kind) where.kind = params.kind;
  if (params.status) where.status = params.status;
  if (params.keyword) where.name = { contains: params.keyword };

  const [rows, count] = await Promise.all([
    prisma.dataFile.findMany({
      where,
      include: dataFileInclude,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit
    }),
    prisma.dataFile.count({ where })
  ]);
  return { data: rows.map(toDataFileItem), count };
}

export async function getDataFile(
  prisma: PrismaClient,
  user: AuthUser,
  id: string
): Promise<DataFileItem> {
  const file = await prisma.dataFile.findUnique({ where: { id }, include: dataFileInclude });
  if (!file) throw new BizError(404, '数据文件不存在');
  if (!canManage(user, file.ownerId)) throw new BizError(403, '无权限查看该数据文件');
  return toDataFileItem(file);
}

export async function deleteDataFiles(
  prisma: PrismaClient,
  user: AuthUser,
  dataDir: string,
  ids: string[]
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) throw new BizError(400, 'ids 不能为空');
  const files = await prisma.dataFile.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, ownerId: true }
  });
  if (files.length === 0) throw new BizError(404, '数据文件不存在');
  for (const file of files) {
    if (!canManage(user, file.ownerId)) throw new BizError(403, '无权限删除该数据文件');
  }
  await prisma.dataFile.deleteMany({ where: { id: { in: files.map((file) => file.id) } } });
  for (const file of files) {
    await rm(dataFileDirectory(dataDir, file.id), { recursive: true, force: true });
  }
}

export async function resetDataFileForRetry(
  prisma: PrismaClient,
  user: AuthUser,
  id: string,
  srs?: string
): Promise<DataFile> {
  const file = await prisma.dataFile.findUnique({ where: { id } });
  if (!file) throw new BizError(404, '数据文件不存在');
  if (!canManage(user, file.ownerId)) throw new BizError(403, '无权限操作该数据文件');
  if (file.status !== 'failed') throw new BizError(400, '只有失败的任务才能重试');
  return prisma.dataFile.update({
    where: { id },
    data: {
      status: 'pending',
      progress: 0,
      errorMsg: '',
      outputUrl: '',
      srs: srs ?? file.srs
    }
  });
}

export function truncateError(message: string, limit = 500): string {
  const text = message.replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function isDataFileOwner(user: AuthUser, file: { ownerId: string }): boolean {
  return canManage(user, file.ownerId);
}
