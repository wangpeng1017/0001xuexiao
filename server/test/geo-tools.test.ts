import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createGeoTools,
  createSpawnRunner,
  type CommandRunner,
  type RunOptions,
  type RunResult,
  type SpawnHandle
} from '../src/lib/geo-tools.js';

function result(command: string, args: string[], extra: Partial<RunResult> = {}): RunResult {
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

interface RecordedCall {
  command: string;
  args: string[];
  options?: RunOptions;
}

function createFakeRunner(
  handler: (command: string, args: string[], options?: RunOptions) => Promise<RunResult>
): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = {
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return handler(command, args, options);
    },
    spawn: () => {
      throw new Error('不应调用 spawn');
    }
  };
  return { runner, calls };
}

describe('geo-tools 命令封装', () => {
  it('GDAL_BIN_DIR 会拼接命令路径，参数以数组传递', async () => {
    const { runner, calls } = createFakeRunner(async (command, args) => result(command, args));
    const tools = createGeoTools(runner, { GDAL_BIN_DIR: '/opt/gdal/bin' });

    await tools.gdalinfo('/data/a.tif');
    await tools.ogrinfo('/data/a.shp');
    await tools.gdalFormats();
    await tools.ogrFormats();

    expect(calls[0]!.command).toBe(path.join('/opt/gdal/bin', 'gdalinfo'));
    expect(calls[0]!.args).toEqual(['-json', '/data/a.tif']);
    expect(calls[1]!.command).toBe(path.join('/opt/gdal/bin', 'ogrinfo'));
    expect(calls[1]!.args).toEqual(['-ro', '-so', '/data/a.shp']);
    expect(calls[2]!.args).toEqual(['--formats']);
    expect(calls[3]!.args).toEqual(['--formats']);
  });

  it('ogr2ogr 对 CSV 追加 X/Y 字段名，普通矢量不加', async () => {
    const { runner, calls } = createFakeRunner(async (command, args) => result(command, args));
    const tools = createGeoTools(runner, {});

    await tools.ogr2ogrToGeoJson('/data/a.geojson', '/out/a.geojson');
    await tools.ogr2ogrToGeoJson('/data/a.csv', '/out/b.geojson', { csv: true });

    expect(calls[0]!.args).toEqual([
      '-f',
      'GeoJSON',
      '-t_srs',
      'EPSG:4326',
      '/out/a.geojson',
      '/data/a.geojson'
    ]);
    expect(calls[1]!.args).toContain('X_POSSIBLE_NAMES=lon,lng,longitude,经度');
    expect(calls[1]!.args).toContain('Y_POSSIBLE_NAMES=lat,latitude,纬度');
  });

  it('gdal2tiles 使用 XYZ 且可回退到 gdal2tiles.py 不存在的情况', async () => {
    const { runner, calls } = createFakeRunner(async (command, args) => {
      if (command === 'gdal2tiles.py') {
        return result(command, args, { code: null, error: 'spawn gdal2tiles.py ENOENT' });
      }
      return result(command, args);
    });
    const tools = createGeoTools(runner, {});

    const output = await tools.gdal2tiles('/data/a.tif', '/out/tiles');
    expect(output.code).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.command).toBe('gdal2tiles');
    for (const call of calls) {
      expect(call.args).toContain('--xyz');
      expect(call.args).toContain('-w');
      expect(call.args).toContain('none');
      expect(call.args.some((arg) => arg.startsWith('--processes='))).toBe(true);
    }
  });

  it('py3dtiles 输出 EPSG:4978，并在指定输入坐标系时传 --srs_in', async () => {
    const { runner, calls } = createFakeRunner(async (command, args) => result(command, args));
    const tools = createGeoTools(runner, { PY3DTILES_CMD: '/opt/py3dtiles' });

    await tools.py3dtiles('/data/a.las', '/out/3dtiles', 'EPSG:4547');
    await tools.py3dtiles('/data/b.las', '/out/3dtiles2');

    expect(calls[0]!.command).toBe('/opt/py3dtiles');
    expect(calls[0]!.args).toContain('--srs_out');
    expect(calls[0]!.args).toContain('EPSG:4978');
    expect(calls[0]!.args).toContain('--srs_in');
    expect(calls[0]!.args).toContain('EPSG:4547');
    expect(calls[1]!.args).not.toContain('--srs_in');
  });

  it('ffmpeg 参数符合 RTSP 转封装与本地文件转码约定', () => {
    const tools = createGeoTools(createSpawnRunner(), {});
    const rtsp = tools.ffmpegArgs('rtsp://camera/live', false);
    expect(rtsp.slice(0, 4)).toEqual(['-rtsp_transport', 'tcp', '-i', 'rtsp://camera/live']);
    expect(rtsp).toContain('-c:v');
    expect(rtsp).toContain('copy');
    expect(rtsp).toContain('-an');
    expect(rtsp.slice(-5)).toEqual([
      '-f',
      'flv',
      '-flvflags',
      'no_duration_filesize',
      'pipe:1'
    ]);

    const fileArgs = tools.ffmpegArgs('C:\\videos\\test.mp4', true);
    expect(fileArgs.slice(0, 6)).toEqual(['-re', '-stream_loop', '-1', '-i', 'C:\\videos\\test.mp4', '-c:v']);
    expect(fileArgs).toContain('libx264');
    expect(fileArgs).toContain('-g');
    expect(fileArgs).toContain('25');
  });
});

describe('geo-tools 真实子进程行为', () => {
  const runner = createSpawnRunner();

  it('参数不会被 shell 解释', async () => {
    const tricky = 'a;b$(whoami)&c';
    const output = await runner.run(
      process.execPath,
      ['-e', 'console.log(process.argv[1])', tricky],
      { timeoutMs: 10_000 }
    );
    expect(output.code).toBe(0);
    expect(output.stdout.trim()).toBe(tricky);
  });

  it('支持超时终止', async () => {
    const output = await runner.run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
      timeoutMs: 150
    });
    expect(output.timedOut).toBe(true);
    expect(output.code).toBeNull();
  });

  it('支持 AbortSignal 取消', async () => {
    const controller = new AbortController();
    const pending = runner.run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
      signal: controller.signal
    });
    setTimeout(() => controller.abort(), 100);
    const output = await pending;
    expect(output.canceled).toBe(true);
  });

  it('从输出中解析进度并回调', async () => {
    const percents: number[] = [];
    const output = await runner.run(
      process.execPath,
      ['-e', "console.log('10%'); console.log('55%'); console.log('100%')"],
      { onProgress: (percent) => percents.push(percent) }
    );
    expect(output.code).toBe(0);
    expect(percents).toEqual([10, 55, 100]);
  });

  it('命令不存在时返回错误而不是抛出', async () => {
    const output = await runner.run('definitely-not-a-real-command-xyz', ['--version']);
    expect(output.code).toBeNull();
    expect(output.error).toBeTruthy();
  });
});
