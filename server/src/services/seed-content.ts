import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { BizError } from '../lib/resp.js';
import type { AuthUser } from '../types.js';
import { isAdmin } from './project-access.js';
import {
  MATERIAL_CATEGORIES,
  createMaterialFromFile,
  type MaterialCategory
} from './material.js';
import type { TemplateCategory } from './template.js';

interface SeedManifestItem {
  file: string;
  category: MaterialCategory;
  name: string;
}

interface SeedManifest {
  version: number;
  materials: SeedManifestItem[];
}

interface SeedTemplateFile {
  name: string;
  category: string;
  content: Record<string, unknown>;
}

interface SeedMaterialRef {
  id: string;
  url: string;
}

export interface ImportSeedContentOptions {
  dataDir: string;
  seedDir?: string;
}

export interface ImportSeedContentResult {
  materials: { created: number; skipped: number };
  templates: { created: number; skipped: number };
}

const MATERIAL_PLACEHOLDER = /\{\{material:([^}]+)\}\}/g;
const TEMPLATE_CATEGORY_ALIASES: Record<string, TemplateCategory> = {
  campus: 'campus',
  校园三维: 'campus',
  device: 'device',
  设备监控: 'device',
  data: 'data',
  数据统计: 'data',
  other: 'other',
  其他: 'other'
};

export function resolveSeedContentDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'seed-content'),
    path.resolve(process.cwd(), 'server', 'seed-content'),
    path.resolve(moduleDir, '../../seed-content'),
    path.resolve(moduleDir, '../../../seed-content'),
    path.resolve(moduleDir, '../seed-content')
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'manifest.json'))) return candidate;
  }
  throw new BizError(500, '未找到预置内容目录 seed-content');
}

function assertInside(root: string, target: string, message: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new BizError(500, message);
  }
  return resolved;
}

function normalizeTemplateCategory(value: string): TemplateCategory {
  const category = TEMPLATE_CATEGORY_ALIASES[value.trim()];
  if (!category) {
    throw new BizError(500, `模板分类不合法：${value}`);
  }
  return category;
}

async function readManifest(seedDir: string): Promise<SeedManifest> {
  const manifestPath = path.join(seedDir, 'manifest.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new BizError(500, '预置素材清单 manifest.json 无法读取或解析');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BizError(500, '预置素材清单格式不正确');
  }
  const raw = parsed as { version?: unknown; materials?: unknown };
  if (typeof raw.version !== 'number' || !Array.isArray(raw.materials)) {
    throw new BizError(500, '预置素材清单格式不正确');
  }

  const seen = new Set<string>();
  const materials: SeedManifestItem[] = [];
  for (const entry of raw.materials) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BizError(500, '预置素材清单条目格式不正确');
    }
    const item = entry as Record<string, unknown>;
    if (
      typeof item.file !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.category !== 'string' ||
      !item.file.trim() ||
      !item.name.trim()
    ) {
      throw new BizError(500, '预置素材清单条目缺少 file/name/category');
    }
    if (!(MATERIAL_CATEGORIES as readonly string[]).includes(item.category)) {
      throw new BizError(500, `预置素材分类不合法：${item.category}`);
    }
    assertInside(seedDir, path.join(seedDir, item.file), `预置素材路径越界：${item.file}`);
    if (seen.has(item.file)) {
      throw new BizError(500, `预置素材清单存在重复文件：${item.file}`);
    }
    seen.add(item.file);
    materials.push({
      file: item.file,
      category: item.category as MaterialCategory,
      name: item.name
    });
  }

  return { version: raw.version, materials };
}

async function importMaterials(
  prisma: PrismaClient,
  admin: AuthUser,
  seedDir: string,
  dataDir: string
): Promise<{ materials: Map<string, SeedMaterialRef>; created: number; skipped: number }> {
  const manifest = await readManifest(seedDir);
  const materials = new Map<string, SeedMaterialRef>();
  let created = 0;
  let skipped = 0;

  for (const item of manifest.materials) {
    const existing = await prisma.material.findFirst({
      where: { name: item.name, scope: 'public', category: item.category },
      select: { id: true, url: true }
    });
    if (existing) {
      materials.set(item.file, { id: existing.id, url: existing.url });
      skipped += 1;
      continue;
    }

    const material = await createMaterialFromFile(prisma, admin, dataDir, {
      filePath: assertInside(
        seedDir,
        path.join(seedDir, item.file),
        `预置素材路径越界：${item.file}`
      ),
      fileName: path.basename(item.file),
      category: item.category,
      name: item.name,
      scope: 'public'
    });
    materials.set(item.file, { id: material.id, url: material.url });
    created += 1;
  }

  return { materials, created, skipped };
}

function replaceMaterialPlaceholders(
  value: unknown,
  materials: Map<string, SeedMaterialRef>
): unknown {
  if (typeof value === 'string') {
    return value.replace(MATERIAL_PLACEHOLDER, (_match, file: string) => {
      const material = materials.get(file.trim());
      if (!material) {
        throw new BizError(500, `模板引用了不存在的素材：${file}`);
      }
      return material.url;
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceMaterialPlaceholders(item, materials));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = replaceMaterialPlaceholders(child, materials);
    }
    return result;
  }
  return value;
}

function applySceneMaterialRefs(value: unknown, materialIdByUrl: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) applySceneMaterialRefs(item, materialIdByUrl);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (record.from === 'material' && typeof record.url === 'string') {
    const id = materialIdByUrl.get(record.url);
    if (id) record.refId = id;
  }
  for (const child of Object.values(record)) {
    applySceneMaterialRefs(child, materialIdByUrl);
  }
}

async function readTemplates(templatesDir: string): Promise<Array<{ fileName: string; data: SeedTemplateFile }>> {
  let names: string[];
  try {
    names = await readdir(templatesDir);
  } catch {
    throw new BizError(500, '预置模板目录不存在');
  }
  const result: Array<{ fileName: string; data: SeedTemplateFile }> = [];
  for (const fileName of names.filter((name) => name.toLowerCase().endsWith('.json')).sort()) {
    const templatePath = path.join(templatesDir, fileName);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(templatePath, 'utf8'));
    } catch {
      throw new BizError(500, `模板 ${fileName} 无法读取或解析`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BizError(500, `模板 ${fileName} 格式不正确`);
    }
    const raw = parsed as Record<string, unknown>;
    if (
      typeof raw.name !== 'string' ||
      !raw.name.trim() ||
      typeof raw.category !== 'string' ||
      !raw.content ||
      typeof raw.content !== 'object' ||
      Array.isArray(raw.content)
    ) {
      throw new BizError(500, `模板 ${fileName} 缺少 name/category/content`);
    }
    result.push({
      fileName,
      data: {
        name: raw.name.trim(),
        category: raw.category,
        content: raw.content as Record<string, unknown>
      }
    });
  }
  if (result.length === 0) throw new BizError(500, '预置模板目录为空');
  return result;
}

async function importTemplates(
  prisma: PrismaClient,
  admin: AuthUser,
  seedDir: string,
  dataDir: string,
  materials: Map<string, SeedMaterialRef>
): Promise<{ created: number; skipped: number }> {
  const templates = await readTemplates(path.join(seedDir, 'templates'));
  const materialIdByUrl = new Map(
    [...materials.values()].map((material) => [material.url, material.id] as const)
  );
  let created = 0;
  let skipped = 0;

  for (const { fileName, data } of templates) {
    const existing = await prisma.project.findFirst({
      where: { projectName: data.name, isTemplate: true, deletedAt: null },
      select: { id: true }
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const baseName = path.basename(fileName, '.json');
    if (!/^[A-Za-z0-9._-]+$/.test(baseName)) {
      throw new BizError(500, `模板文件名不合法：${fileName}`);
    }
    const coverSource = assertInside(
      seedDir,
      path.join(seedDir, 'templates', `${baseName}.png`),
      `模板封面路径越界：${fileName}`
    );
    if (!existsSync(coverSource)) {
      throw new BizError(500, `模板 ${data.name} 缺少封面图 ${baseName}.png`);
    }

    const replaced = replaceMaterialPlaceholders(data.content, materials) as Record<
      string,
      unknown
    >;
    const serialized = JSON.stringify(replaced);
    if (serialized.includes('{{material:')) {
      throw new BizError(500, `模板 ${data.name} 存在未解析的素材占位符`);
    }

    const editCanvasConfig = replaced.editCanvasConfig;
    if (
      !editCanvasConfig ||
      typeof editCanvasConfig !== 'object' ||
      Array.isArray(editCanvasConfig)
    ) {
      throw new BizError(500, `模板 ${data.name} 缺少 editCanvasConfig`);
    }
    const canvas = editCanvasConfig as Record<string, unknown>;
    canvas.projectName = data.name;
    const remarks = typeof canvas.remarks === 'string' ? canvas.remarks : '';
    applySceneMaterialRefs(replaced, materialIdByUrl);

    const coversDir = path.join(dataDir, 'files', 'templates');
    await mkdir(coversDir, { recursive: true });
    const coverName = `${baseName}.png`;
    await copyFile(coverSource, path.join(coversDir, coverName));
    const indexImage = `/files/templates/${encodeURIComponent(coverName)}`;

    await prisma.project.create({
      data: {
        projectName: data.name,
        remarks,
        indexImage,
        state: -1,
        sortOrder: 0,
        isTemplate: true,
        templateCategory: normalizeTemplateCategory(data.category),
        content: JSON.stringify(replaced),
        version: 0,
        ownerId: admin.id,
        updatedById: admin.id
      }
    });
    created += 1;
  }

  return { created, skipped };
}

export async function importSeedContent(
  prisma: PrismaClient,
  admin: AuthUser,
  options: ImportSeedContentOptions
): Promise<ImportSeedContentResult> {
  if (!isAdmin(admin)) {
    throw new BizError(403, '预置内容导入需要管理员身份');
  }
  const seedDir = options.seedDir
    ? path.resolve(options.seedDir)
    : resolveSeedContentDir();
  const materialResult = await importMaterials(prisma, admin, seedDir, options.dataDir);
  const templateResult = await importTemplates(
    prisma,
    admin,
    seedDir,
    options.dataDir,
    materialResult.materials
  );

  return {
    materials: { created: materialResult.created, skipped: materialResult.skipped },
    templates: templateResult
  };
}
