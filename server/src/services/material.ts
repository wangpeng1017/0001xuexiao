import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';
import { isAdmin } from './project-access.js';

export const MATERIAL_CATEGORIES = ['model', 'map', 'image2d'] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];
export type MaterialScope = 'public' | 'private';

export const MAX_MATERIAL_BYTES = 200 * 1024 * 1024;
const MAX_UNZIP_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_UNZIP_FILES = 20000;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp']);
const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

export interface MaterialItem {
  id: string;
  category: string;
  name: string;
  url: string;
  thumb: string;
  scope: string;
  createUserName: string;
  createTime: string;
}

export interface UploadMaterialInput {
  category: MaterialCategory;
  name: string;
  scope: MaterialScope;
  filename: string;
  buffer: Buffer;
}

const materialInclude = {
  owner: { select: { username: true, nickname: true } }
};

function toMaterialItem(row: {
  id: string;
  category: string;
  name: string;
  url: string;
  thumb: string;
  scope: string;
  createdAt: Date;
  owner: { username: string; nickname: string };
}): MaterialItem {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    url: row.url,
    thumb: row.thumb,
    scope: row.scope,
    createUserName: row.owner.nickname || row.owner.username,
    createTime: row.createdAt.toISOString()
  };
}

function materialDir(dataDir: string, id: string): string {
  return path.join(dataDir, 'files', 'materials', id);
}

function encodeRelativePath(relative: string): string {
  return relative
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function safeImageName(originalName: string): string {
  const base = path.basename(originalName).replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_');
  if (!base || base === '.' || base === '..') return `image${path.extname(originalName)}`;
  return base;
}

function safeEntryPath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new BizError(400, '压缩包包含非法路径');
  }
  const parts = normalized.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.includes('..')) {
    throw new BizError(400, '压缩包包含非法路径');
  }
  return parts.join('/');
}

function assertInside(targetDir: string, filePath: string): void {
  const root = path.resolve(targetDir);
  const resolved = path.resolve(filePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new BizError(400, '压缩包包含非法路径');
  }
}

async function extractZip(buffer: Buffer, targetDir: string): Promise<string[]> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new BizError(400, '压缩包无法解析');
  }

  const entries = zip.getEntries();
  if (entries.length === 0) throw new BizError(400, '压缩包为空');
  if (entries.length > MAX_UNZIP_FILES) {
    throw new BizError(400, `压缩包文件数不能超过 ${MAX_UNZIP_FILES}`);
  }

  const files: string[] = [];
  let totalBytes = 0;
  for (const entry of entries) {
    const relative = safeEntryPath(entry.entryName);
    if (!relative) continue;
    const dest = path.resolve(targetDir, relative);
    assertInside(targetDir, dest);

    if (entry.isDirectory) {
      await mkdir(dest, { recursive: true });
      continue;
    }

    totalBytes += entry.header.size;
    if (totalBytes > MAX_UNZIP_TOTAL_BYTES) {
      throw new BizError(400, '压缩包解压后总大小超过 1GB');
    }
    if (files.length >= MAX_UNZIP_FILES) {
      throw new BizError(400, `压缩包文件数不能超过 ${MAX_UNZIP_FILES}`);
    }

    let data: Buffer;
    try {
      data = entry.getData();
    } catch {
      throw new BizError(400, '压缩包内容损坏或已加密');
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, data);
    files.push(relative);
  }

  if (files.length === 0) throw new BizError(400, '压缩包为空');
  return files;
}

async function findTileRoot(extractDir: string): Promise<string | null> {
  const queue = [extractDir];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (!/\.png$/i.test(entry.name)) continue;
      const relative = path.relative(extractDir, fullPath).split(path.sep);
      if (relative.length < 3) continue;
      const y = relative[relative.length - 1].replace(/\.png$/i, '');
      const x = relative[relative.length - 2];
      const z = relative[relative.length - 3];
      if (/^\d+$/.test(x) && /^\d+$/.test(y) && /^\d+$/.test(z)) {
        return path.resolve(extractDir, ...relative.slice(0, relative.length - 3));
      }
    }
  }
  return null;
}

async function finalizeModel(
  dataDir: string,
  id: string,
  input: UploadMaterialInput
): Promise<string> {
  const extension = path.extname(input.filename).toLowerCase();
  const targetDir = materialDir(dataDir, id);

  if (extension === '.glb') {
    await writeFile(path.join(targetDir, 'model.glb'), input.buffer);
    return `/files/materials/${id}/model.glb`;
  }
  if (extension !== '.zip') {
    throw new BizError(400, '模型素材只支持 .glb 文件或包含 .gltf 的 zip 压缩包');
  }

  const files = await extractZip(input.buffer, targetDir);
  const gltfFiles = files.filter((file) => /\.gltf$/i.test(file));
  if (gltfFiles.length === 0) {
    throw new BizError(400, 'zip 压缩包中未找到 .gltf 文件');
  }
  const preferred =
    gltfFiles.find((file) => /(^|\/)scene\.gltf$/i.test(file)) ??
    gltfFiles.find((file) => !file.includes('/')) ??
    gltfFiles[0];
  return `/files/materials/${id}/${encodeRelativePath(preferred)}`;
}

async function finalizeMap(dataDir: string, id: string, input: UploadMaterialInput): Promise<string> {
  const extension = path.extname(input.filename).toLowerCase();
  const targetDir = materialDir(dataDir, id);

  if (extension === '.geojson') {
    await writeFile(path.join(targetDir, 'data.geojson'), input.buffer);
    return `/files/materials/${id}/data.geojson`;
  }
  if (extension !== '.zip') {
    throw new BizError(400, '地图素材只支持 .geojson 文件或 XYZ 瓦片 zip 压缩包');
  }

  const extractDir = path.join(targetDir, '_unzip');
  await mkdir(extractDir, { recursive: true });
  await extractZip(input.buffer, extractDir);
  const tileRoot = await findTileRoot(extractDir);
  if (!tileRoot) {
    throw new BizError(400, '瓦片压缩包必须包含 {z}/{x}/{y}.png 目录结构');
  }

  const tilesDir = path.join(targetDir, 'tiles');
  await rename(tileRoot, tilesDir);
  await rm(extractDir, { recursive: true, force: true });
  return `/files/materials/${id}/tiles/{z}/{x}/{y}.png`;
}

async function finalizeImage2d(
  dataDir: string,
  id: string,
  input: UploadMaterialInput
): Promise<{ url: string; thumb: string }> {
  const extension = path.extname(input.filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new BizError(400, '二维素材只支持 png/jpg/jpeg/svg/gif/webp');
  }
  const storedName = safeImageName(input.filename);
  await writeFile(path.join(materialDir(dataDir, id), storedName), input.buffer);
  const url = `/files/materials/${id}/${encodeURIComponent(storedName)}`;
  return { url, thumb: url };
}

export interface CreateMaterialFromFileInput {
  filePath: string;
  fileName: string;
  category: MaterialCategory;
  name: string;
  scope: MaterialScope;
}

async function createMaterialFromBuffer(
  prisma: PrismaClient,
  user: AuthUser,
  dataDir: string,
  input: UploadMaterialInput
): Promise<MaterialItem> {
  const id = randomUUID();
  const targetDir = materialDir(dataDir, id);
  await mkdir(targetDir, { recursive: true });

  try {
    let url: string;
    let thumb = '';
    if (input.category === 'model') {
      url = await finalizeModel(dataDir, id, input);
    } else if (input.category === 'map') {
      url = await finalizeMap(dataDir, id, input);
    } else {
      const result = await finalizeImage2d(dataDir, id, input);
      url = result.url;
      thumb = result.thumb;
    }

    const row = await prisma.material.create({
      data: {
        id,
        category: input.category,
        name: input.name,
        url,
        thumb,
        scope: input.scope,
        ownerId: user.id
      },
      include: materialInclude
    });
    return toMaterialItem(row);
  } catch (error) {
    await rm(targetDir, { recursive: true, force: true });
    throw error;
  }
}

export async function createMaterialFromFile(
  prisma: PrismaClient,
  user: AuthUser,
  dataDir: string,
  input: CreateMaterialFromFileInput
): Promise<MaterialItem> {
  if (input.scope === 'public' && !isAdmin(user)) {
    throw new BizError(403, '只有管理员可以上传公共素材');
  }

  const info = await stat(input.filePath).catch(() => null);
  if (!info || !info.isFile()) throw new BizError(400, '素材文件不存在');
  if (info.size === 0) throw new BizError(400, '上传文件为空');
  if (info.size > MAX_MATERIAL_BYTES) {
    throw new BizError(400, '素材文件不能超过 200MB');
  }

  const buffer = await readFile(input.filePath);
  return createMaterialFromBuffer(prisma, user, dataDir, {
    category: input.category,
    name: input.name,
    scope: input.scope,
    filename: input.fileName,
    buffer
  });
}

export async function uploadMaterial(
  prisma: PrismaClient,
  user: AuthUser,
  dataDir: string,
  input: UploadMaterialInput
): Promise<MaterialItem> {
  await mkdir(dataDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(dataDir, 'material-upload-'));
  const tempPath = path.join(tempDir, `upload${path.extname(input.filename).toLowerCase()}`);

  try {
    await writeFile(tempPath, input.buffer);
    return await createMaterialFromFile(prisma, user, dataDir, {
      filePath: tempPath,
      fileName: input.filename,
      category: input.category,
      name: input.name,
      scope: input.scope
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function saveMaterialThumb(
  prisma: PrismaClient,
  user: AuthUser,
  dataDir: string,
  id: string,
  buffer: Buffer,
  filename: string
): Promise<{ thumb: string }> {
  const material = await prisma.material.findUnique({ where: { id } });
  if (!material) throw new BizError(404, '素材不存在');
  if (!isAdmin(user) && material.ownerId !== user.id) {
    throw new BizError(403, '无权限操作该素材');
  }

  const extension = path.extname(filename).toLowerCase();
  const mime = IMAGE_MIME_TYPES[extension];
  if (!mime) throw new BizError(400, '缩略图只支持 png/jpg/jpeg/gif/svg/webp');
  if (buffer.byteLength === 0) throw new BizError(400, '缩略图文件为空');
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new BizError(400, '缩略图不能超过 10MB');
  }

  const dir = materialDir(dataDir, id);
  await mkdir(dir, { recursive: true });
  const fileName = `thumb${extension}`;
  await writeFile(path.join(dir, fileName), buffer);
  const thumb = `/files/materials/${id}/${fileName}`;
  await prisma.material.update({ where: { id }, data: { thumb } });
  return { thumb };
}

export async function listMaterials(
  prisma: PrismaClient,
  user: AuthUser,
  params: {
    category?: MaterialCategory;
    scope?: MaterialScope;
    keyword: string;
    page: number;
    limit: number;
  }
): Promise<{ data: MaterialItem[]; count: number }> {
  const where = {
    OR: [{ scope: 'public' }, { ownerId: user.id }],
    ...(params.category ? { category: params.category } : {}),
    ...(params.scope ? { scope: params.scope } : {}),
    ...(params.keyword ? { name: { contains: params.keyword } } : {})
  };

  const [rows, count] = await Promise.all([
    prisma.material.findMany({
      where,
      include: materialInclude,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit
    }),
    prisma.material.count({ where })
  ]);

  return { data: rows.map(toMaterialItem), count };
}

export async function deleteMaterials(
  prisma: PrismaClient,
  user: AuthUser,
  dataDir: string,
  ids: string[]
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) throw new BizError(400, 'ids 不能为空');

  const materials = await prisma.material.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, ownerId: true }
  });
  if (materials.length === 0) throw new BizError(404, '素材不存在');
  for (const material of materials) {
    if (!isAdmin(user) && material.ownerId !== user.id) {
      throw new BizError(403, '无权限删除该素材');
    }
  }

  await prisma.material.deleteMany({
    where: { id: { in: materials.map((material) => material.id) } }
  });
  await Promise.all(
    materials.map((material) =>
      rm(materialDir(dataDir, material.id), { recursive: true, force: true })
    )
  );
}
