import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { GeoTools, RunResult } from '../src/lib/geo-tools.js';
import { convertDataFile, type ConversionContext } from '../src/services/datafile-converters.js';
import { dataFileDirectory } from '../src/services/datafile.js';
import { createZip } from './zip-fixture.js';

const root = mkdtempSync(path.join(tmpdir(), 'datafile-convert-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function ok(command: string, args: string[], extra: Partial<RunResult> = {}): RunResult {
  return {
    command,
    args,
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    canceled: false,
    ...extra
  };
}

function failed(command: string, args: string[]): RunResult {
  return ok(command, args, { code: 1, stderr: 'unsupported' });
}

function makeTools(overrides: Partial<GeoTools> = {}): GeoTools {
  const base: GeoTools = {
    runner: { run: async (c, a) => failed(c, a), spawn: () => { throw new Error('no spawn'); } },
    env: {},
    gdalinfo: async (file) => failed('gdalinfo', [file]),
    ogrinfo: async (file) => failed('ogrinfo', [file]),
    gdalFormats: async () => failed('gdalinfo', ['--formats']),
    ogrFormats: async () => failed('ogrinfo', ['--formats']),
    ogr2ogrToGeoJson: async (input, output) => failed('ogr2ogr', [input, output]),
    gdalwarpTo3857: async (input, output) => failed('gdalwarp', [input, output]),
    gdal2tiles: async (input, output) => failed('gdal2tiles', [input, output]),
    py3dtiles: async (input, output) => failed('py3dtiles', [input, output]),
    ffmpegArgs: () => [],
    spawnFfmpeg: () => {
      throw new Error('no ffmpeg');
    },
    isAvailable: async () => false
  };
  return { ...base, ...overrides };
}

function context(
  id: string,
  fileName: string,
  dataDir: string,
  tools: GeoTools,
  srs?: string
): ConversionContext {
  return {
    id,
    fileName,
    filePath: path.join(dataDir, fileName),
    dataDir,
    srs,
    tools,
    onProgress: () => undefined
  };
}

describe('数据文件转换器注册表', () => {
  const dataDir = path.join(root, 'data');

  beforeEach(async () => {
    await mkdir(dataDir, { recursive: true });
  });

  it('LAS 无坐标系时明确提示“请指定坐标系”', async () => {
    await writeFile(path.join(dataDir, 'nocrs.las'), 'not a real las');
    const ctx = context('pc-fail', 'nocrs.las', dataDir, makeTools());
    await expect(convertDataFile(ctx)).rejects.toThrow('请指定坐标系');
  });

  it('LAS 指定坐标系后调用 py3dtiles 并输出 tileset.json', async () => {
    const filePath = path.join(dataDir, 'cloud.las');
    await writeFile(filePath, 'las');
    const calls: string[][] = [];
    const tools = makeTools({
      py3dtiles: async (input, output, srs) => {
        calls.push([input, output, srs ?? '']);
        await mkdir(output, { recursive: true });
        await writeFile(path.join(output, 'tileset.json'), '{}');
        return ok('py3dtiles', [input, output]);
      }
    });
    const output = await convertDataFile(context('pc', 'cloud.las', dataDir, tools, 'EPSG:4547'));
    expect(output.kind).toBe('pointcloud');
    expect(output.outputUrl).toBe('/files/datafiles/pc/3dtiles/tileset.json');
    expect(calls[0]![2]).toBe('EPSG:4547');
  });

  it('zip 中包含 tileset.json 时直接作为 3D Tiles 输出', async () => {
    const zip = await createZip([
      { name: 'tileset.json', content: '{"asset":{"version":"1.0"}}' },
      { name: 'tiles/0/0/0.b3dm', content: Buffer.from([1, 2, 3]) }
    ]);
    await writeFile(path.join(dataDir, 'tiles.zip'), zip);
    const output = await convertDataFile(context('t3', 'tiles.zip', dataDir, makeTools()));
    expect(output.kind).toBe('tiles3d');
    const target = path.join(dataFileDirectory(dataDir, 't3'), '3dtiles', 'tileset.json');
    expect(await readFile(target, 'utf8')).toContain('asset');
  });

  it('CSV 走 ogr2ogr 并附带经纬度字段名选项', async () => {
    await writeFile(path.join(dataDir, 'points.csv'), 'lon,lat,name\n116.3,39.9,a\n');
    let csvOption = false;
    const tools = makeTools({
      ogr2ogrToGeoJson: async (input, output, options) => {
        csvOption = Boolean(options?.csv);
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, '{"type":"FeatureCollection","features":[]}');
        return ok('ogr2ogr', [input, output]);
      }
    });
    const output = await convertDataFile(context('csv', 'points.csv', dataDir, tools));
    expect(csvOption).toBe(true);
    expect(output.outputUrl).toBe('/files/datafiles/csv/data.geojson');
  });

  it('ogrinfo 可识别的文件按矢量转换', async () => {
    await writeFile(path.join(dataDir, 'layer.kml'), '<kml />');
    const tools = makeTools({
      ogrinfo: async (file) => ok('ogrinfo', [file], { stdout: 'Layer name: layer' }),
      ogr2ogrToGeoJson: async (input, output) => {
        await writeFile(output, '{"type":"FeatureCollection","features":[]}');
        return ok('ogr2ogr', [input, output]);
      }
    });
    const output = await convertDataFile(context('vec', 'layer.kml', dataDir, tools));
    expect(output.kind).toBe('vector');
  });

  it('gdalinfo 可识别的文件按栅格切片，参数带 XYZ 与进程数', async () => {
    await writeFile(path.join(dataDir, 'map.tif'), 'tif');
    let tileArgs: string[] = [];
    const tools = makeTools({
      gdalinfo: async (file) =>
        ok('gdalinfo', [file], { stdout: '{"size":[1,1],"driverShortName":"GTiff"}' }),
      gdalwarpTo3857: async (input, output) => {
        await writeFile(output, 'warped');
        return ok('gdalwarp', [input, output]);
      },
      gdal2tiles: async (input, output) => {
        tileArgs = [input, output];
        await mkdir(path.join(output, '1', '0'), { recursive: true });
        await writeFile(path.join(output, '1', '0', '0.png'), 'png');
        return ok('gdal2tiles', [input, output]);
      }
    });
    const output = await convertDataFile(context('rst', 'map.tif', dataDir, tools));
    expect(output.kind).toBe('raster');
    expect(output.outputUrl).toBe('/files/datafiles/rst/tiles/{z}/{x}/{y}.png');
    expect(tileArgs[1]!.replace(/\\/g, '/')).toContain('/rst/tiles');
  });

  it('无法识别的格式失败原因为“不支持的格式”', async () => {
    await writeFile(path.join(dataDir, 'unknown.foo'), 'foo');
    const ctx = context('bad', 'unknown.foo', dataDir, makeTools());
    await expect(convertDataFile(ctx)).rejects.toThrow('不支持的格式');
  });

  it('zip 内部路径穿越会被拒绝', async () => {
    await expect(
      (async () => {
        const { normalizeEntryName } = await import('../src/services/datafile-zip.js');
        return normalizeEntryName('../evil.sh');
      })()
    ).rejects.toThrow('非法路径');
  });
});
