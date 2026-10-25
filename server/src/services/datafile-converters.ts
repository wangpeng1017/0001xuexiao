import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { GeoTools, RunResult } from '../lib/geo-tools.js';
import { dataFileDirectory, type DataFileKind } from './datafile.js';
import { readLasSrs } from './datafile-las.js';
import {
  extractZip,
  findTilesetRoot,
  findVectorSource,
  inspectZip,
  zipHasTileset,
  zipHasVectorSource
} from './datafile-zip.js';

export interface ConversionContext {
  id: string;
  filePath: string;
  fileName: string;
  dataDir: string;
  srs?: string;
  tools: GeoTools;
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}

export interface ConversionOutput {
  kind: DataFileKind;
  outputUrl: string;
}

export interface DataConverter {
  kind: DataFileKind;
  detect: (ctx: ConversionContext) => Promise<boolean>;
  convert: (ctx: ConversionContext) => Promise<ConversionOutput>;
}

const VECTOR_EXTENSIONS = new Set([
  '.shp',
  '.gdb',
  '.geojson',
  '.json',
  '.kml',
  '.kmz',
  '.gpkg',
  '.gml',
  '.csv',
  '.tab',
  '.mif',
  '.dxf',
  '.gpx',
  '.sqlite',
  '.e00',
  '.txt'
]);

const MISSING_TOOL_HINT = /enoent|not found|no such file|不是内部或外部命令/i;

function report(ctx: ConversionContext, percent: number): void {
  ctx.onProgress(Math.max(0, Math.min(100, Math.round(percent))));
}

function failureMessage(label: string, result: RunResult): Error {
  const text = `${result.error ?? ''} ${result.stderr}`.trim();
  if (result.code === null && MISSING_TOOL_HINT.test(text)) {
    return new Error(`服务器未安装 ${label}，无法完成转换`);
  }
  if (result.timedOut) return new Error(`${label} 执行超时`);
  if (result.canceled) return new Error(`${label} 已取消`);
  const tail = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(' ');
  return new Error(`${label} 执行失败${tail ? `：${tail}` : ''}`);
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function hasPng(directory: string, depth = 3): Promise<boolean> {
  if (depth < 0) return false;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) return true;
    if (entry.isDirectory() && (await hasPng(path.join(directory, entry.name), depth - 1))) {
      return true;
    }
  }
  return false;
}

function outDir(ctx: ConversionContext): string {
  return dataFileDirectory(ctx.dataDir, ctx.id);
}

function pointCloudConverter(): DataConverter {
  return {
    kind: 'pointcloud',
    detect: async (ctx) => ['.las', '.laz'].includes(path.extname(ctx.fileName).toLowerCase()),
    convert: async (ctx) => {
      const srs = ctx.srs || (await readLasSrs(ctx.filePath));
      if (!srs) throw new Error('LAS 文件头中未读取到坐标系，请指定坐标系后重试');

      const targetDir = path.join(outDir(ctx), '3dtiles');
      await rm(targetDir, { recursive: true, force: true });
      await mkdir(path.dirname(targetDir), { recursive: true });
      report(ctx, 5);
      const result = await ctx.tools.py3dtiles(ctx.filePath, targetDir, srs, {
        timeoutMs: 2 * 60 * 60 * 1000,
        signal: ctx.signal,
        onProgress: (percent) => report(ctx, 5 + percent * 0.9)
      });
      if (result.code !== 0) throw failureMessage('py3dtiles', result);
      if (!(await exists(path.join(targetDir, 'tileset.json')))) {
        throw new Error('py3dtiles 未生成 tileset.json');
      }
      return { kind: 'pointcloud', outputUrl: `/files/datafiles/${ctx.id}/3dtiles/tileset.json` };
    }
  };
}

function tiles3dConverter(): DataConverter {
  return {
    kind: 'tiles3d',
    detect: async (ctx) => {
      if (path.extname(ctx.fileName).toLowerCase() !== '.zip') return false;
      const inspection = await inspectZip(ctx.filePath);
      return zipHasTileset(inspection);
    },
    convert: async (ctx) => {
      const base = outDir(ctx);
      const tempDir = path.join(base, '.unzip');
      const targetDir = path.join(base, '3dtiles');
      await rm(tempDir, { recursive: true, force: true });
      await rm(targetDir, { recursive: true, force: true });
      await mkdir(tempDir, { recursive: true });
      report(ctx, 10);
      await extractZip(ctx.filePath, tempDir);
      report(ctx, 70);
      const tilesetRoot = await findTilesetRoot(tempDir);
      if (!tilesetRoot) throw new Error('zip 中未找到 tileset.json');
      if (tilesetRoot === tempDir) {
        await rename(tempDir, targetDir);
      } else {
        await rename(tilesetRoot, targetDir);
        await rm(tempDir, { recursive: true, force: true });
      }
      if (!(await exists(path.join(targetDir, 'tileset.json')))) {
        throw new Error('3D Tiles 解压结果缺少 tileset.json');
      }
      report(ctx, 95);
      return { kind: 'tiles3d', outputUrl: `/files/datafiles/${ctx.id}/3dtiles/tileset.json` };
    }
  };
}

async function prepareVectorInput(ctx: ConversionContext): Promise<{ input: string; csv: boolean }> {
  const extension = path.extname(ctx.fileName).toLowerCase();
  if (extension !== '.zip') {
    return { input: ctx.filePath, csv: extension === '.csv' };
  }
  const extractDir = path.join(outDir(ctx), 'source-extracted');
  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });
  report(ctx, 5);
  await extractZip(ctx.filePath, extractDir);
  const source = await findVectorSource(extractDir);
  if (!source) throw new Error('zip 中未找到 .shp 或 .gdb 数据');
  return { input: source, csv: false };
}

function vectorConverter(): DataConverter {
  return {
    kind: 'vector',
    detect: async (ctx) => {
      const extension = path.extname(ctx.fileName).toLowerCase();
      if (extension === '.zip') {
        const inspection = await inspectZip(ctx.filePath);
        return zipHasVectorSource(inspection);
      }
      if (extension === '.csv' || extension === '.shp' || extension === '.gdb') return true;
      if (!VECTOR_EXTENSIONS.has(extension)) return false;
      const result = await ctx.tools.ogrinfo(ctx.filePath, { timeoutMs: 30_000, signal: ctx.signal });
      if (result.code !== 0) return false;
      return !/unable to open|not recognized as a supported file format|FAILURE/i.test(
        `${result.stdout}\n${result.stderr}`
      );
    },
    convert: async (ctx) => {
      const { input, csv } = await prepareVectorInput(ctx);
      const output = path.join(outDir(ctx), 'data.geojson');
      await mkdir(outDir(ctx), { recursive: true });
      await rm(output, { force: true });
      report(ctx, 10);
      const result = await ctx.tools.ogr2ogrToGeoJson(input, output, {
        csv,
        timeoutMs: 60 * 60 * 1000,
        signal: ctx.signal,
        onProgress: (percent) => report(ctx, 10 + percent * 0.85)
      });
      if (result.code !== 0) throw failureMessage('ogr2ogr', result);
      const info = await stat(output).catch(() => null);
      if (!info || info.size === 0) throw new Error('ogr2ogr 未生成 GeoJSON 数据');
      return { kind: 'vector', outputUrl: `/files/datafiles/${ctx.id}/data.geojson` };
    }
  };
}

function rasterConverter(): DataConverter {
  return {
    kind: 'raster',
    detect: async (ctx) => {
      if (path.extname(ctx.fileName).toLowerCase() === '.zip') return false;
      const result = await ctx.tools.gdalinfo(ctx.filePath, {
        timeoutMs: 30_000,
        signal: ctx.signal
      });
      if (result.code !== 0) return false;
      return result.stdout.trim().startsWith('{') && result.stdout.includes('"size"');
    },
    convert: async (ctx) => {
      const base = outDir(ctx);
      const warped = path.join(base, 'warped.tif');
      const tilesDir = path.join(base, 'tiles');
      await mkdir(base, { recursive: true });
      await rm(tilesDir, { recursive: true, force: true });
      await rm(warped, { force: true });

      report(ctx, 5);
      const warpResult = await ctx.tools.gdalwarpTo3857(ctx.filePath, warped, {
        timeoutMs: 2 * 60 * 60 * 1000,
        signal: ctx.signal,
        onProgress: (percent) => report(ctx, 5 + percent * 0.45)
      });
      if (warpResult.code !== 0) throw failureMessage('gdalwarp', warpResult);

      const tileResult = await ctx.tools.gdal2tiles(warped, tilesDir, {
        timeoutMs: 4 * 60 * 60 * 1000,
        signal: ctx.signal,
        onProgress: (percent) => report(ctx, 50 + percent * 0.45)
      });
      if (tileResult.code !== 0) throw failureMessage('gdal2tiles', tileResult);
      if (!(await hasPng(tilesDir))) throw new Error('gdal2tiles 未生成瓦片');
      await rm(warped, { force: true });
      return { kind: 'raster', outputUrl: `/files/datafiles/${ctx.id}/tiles/{z}/{x}/{y}.png` };
    }
  };
}

export function createConverters(): DataConverter[] {
  return [pointCloudConverter(), tiles3dConverter(), vectorConverter(), rasterConverter()];
}

export async function convertDataFile(ctx: ConversionContext): Promise<ConversionOutput> {
  let firstError: Error | null = null;
  for (const converter of createConverters()) {
    let detected = false;
    try {
      detected = await converter.detect(ctx);
    } catch (error) {
      firstError = firstError ?? (error instanceof Error ? error : new Error(String(error)));
      continue;
    }
    if (!detected) continue;
    return converter.convert(ctx);
  }
  throw firstError ?? new Error('不支持的格式');
}
