import { readFileSync } from 'node:fs';
import type { GeoTools } from '../lib/geo-tools.js';

export interface FormatItem {
  code: string;
  name: string;
}

export interface FormatGroup {
  name: string;
  items: FormatItem[];
}

export interface FormatsResult {
  total: number;
  groups: FormatGroup[];
}

interface StaticFormats {
  raster: FormatItem[];
  vector: FormatItem[];
}

const EXTRA_3D_FORMATS: FormatItem[] = [
  { code: 'LAS', name: 'LAS 点云' },
  { code: 'LAZ', name: 'LAZ 压缩点云' },
  { code: 'glTF', name: 'glTF 模型' },
  { code: 'GLB', name: 'GLB 模型' },
  { code: '3D Tiles', name: '3D Tiles 瓦片包' }
];

let cachedFormats: FormatsResult | null = null;

function loadStaticFormats(): StaticFormats {
  const raw = readFileSync(new URL('../lib/gdal-formats.json', import.meta.url), 'utf8');
  return JSON.parse(raw) as StaticFormats;
}

function dedupe(items: FormatItem[], seen: Set<string>): FormatItem[] {
  const result: FormatItem[] = [];
  for (const item of items) {
    const key = item.code.toLowerCase();
    if (!item.code || seen.has(key)) continue;
    seen.add(key);
    result.push({ code: item.code, name: item.name || item.code });
  }
  return result;
}

function buildResult(raster: FormatItem[], vector: FormatItem[]): FormatsResult {
  const seen = new Set<string>();
  const groups: FormatGroup[] = [
    { name: '栅格', items: dedupe(raster, seen) },
    { name: '矢量', items: dedupe(vector, seen) },
    { name: '三维/点云', items: dedupe(EXTRA_3D_FORMATS, seen) }
  ];
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return { total, groups };
}

function staticResult(): FormatsResult {
  const formats = loadStaticFormats();
  return buildResult(formats.raster, formats.vector);
}

export function parseGdalFormats(output: string): FormatItem[] {
  const items: FormatItem[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\S+)\s+-raster-\s+\([^)]*\)(?::\s*(.*))?$/.exec(line);
    if (!match) continue;
    const code = match[1]!;
    items.push({ code, name: (match[2] ?? '').trim() || code });
  }
  return items;
}

export function parseOgrFormats(output: string): FormatItem[] {
  const items: FormatItem[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s{2,}(.+?)\s+-(?:raster,vector|vector,raster|vector)-\s+\([^)]*\)(?::\s*(.*))?$/.exec(
      line
    );
    if (!match) continue;
    const code = match[1]!.trim();
    if (!code || code === 'Supported Formats:') continue;
    items.push({ code, name: (match[2] ?? '').trim() || code });
  }
  return items;
}

export async function getSupportedFormats(tools: GeoTools): Promise<FormatsResult> {
  if (cachedFormats) return cachedFormats;

  const [hasGdal, hasOgr] = await Promise.all([
    tools.isAvailable('gdalinfo'),
    tools.isAvailable('ogrinfo')
  ]);
  if (!hasGdal || !hasOgr) {
    cachedFormats = staticResult();
    return cachedFormats;
  }

  const [gdalResult, ogrResult] = await Promise.all([tools.gdalFormats(), tools.ogrFormats()]);
  const raster = gdalResult.code === 0 ? parseGdalFormats(gdalResult.stdout) : [];
  const vector = ogrResult.code === 0 ? parseOgrFormats(ogrResult.stdout) : [];
  if (raster.length === 0 && vector.length === 0) {
    cachedFormats = staticResult();
    return cachedFormats;
  }
  cachedFormats = buildResult(raster, vector);
  return cachedFormats;
}

export function resetFormatsCache(): void {
  cachedFormats = null;
}
