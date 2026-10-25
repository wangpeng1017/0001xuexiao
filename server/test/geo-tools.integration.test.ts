import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createGeoTools } from '../src/lib/geo-tools.js';
import { parseGdalFormats } from '../src/services/datafile-formats.js';

const tools = createGeoTools();
const gdalAvailable = await tools.isAvailable('gdalinfo');
const ogrAvailable = await tools.isAvailable('ogrinfo');
const py3dtilesAvailable = await tools.isAvailable('py3dtiles');
const ffmpegAvailable = await tools.isAvailable('ffmpeg');

const tmpDir = mkdtempSync(path.join(tmpdir(), 'geo-integration-'));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('真实外部工具集成（不存在时自动跳过）', () => {
  it.skipIf(!gdalAvailable)(
    gdalAvailable ? '真实 gdalinfo 能输出驱动列表' : '真实 gdalinfo 能输出驱动列表（跳过原因：未安装 GDAL）',
    async () => {
      const result = await tools.gdalFormats();
      expect(result.code).toBe(0);
      expect(parseGdalFormats(result.stdout).length).toBeGreaterThan(50);
    }
  );

  it.skipIf(!ogrAvailable)(
    ogrAvailable ? '真实 ogrinfo 能输出驱动列表' : '真实 ogrinfo 能输出驱动列表（跳过原因：未安装 GDAL）',
    async () => {
      const result = await tools.ogrFormats();
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Supported Formats');
    }
  );

  it.skipIf(!py3dtilesAvailable)(
    py3dtilesAvailable
      ? '真实 py3dtiles 版本可用'
      : '真实 py3dtiles 版本可用（跳过原因：未安装 py3dtiles）',
    async () => {
      const result = await tools.runner.run('py3dtiles', ['--version'], { timeoutMs: 5000 });
      expect(result.code).toBe(0);
    }
  );

  it.skipIf(!ffmpegAvailable)(
    ffmpegAvailable ? '真实 ffmpeg 能生成 FLV 流' : '真实 ffmpeg 能生成 FLV 流（跳过原因：未安装 ffmpeg）',
    async () => {
      const source = path.join(tmpDir, 'source.mp4');
      const generated = await tools.runner.run(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=160x120:rate=10',
          '-t',
          '1',
          '-pix_fmt',
          'yuv420p',
          source
        ],
        { timeoutMs: 30_000 }
      );
      expect(generated.code, generated.stderr).toBe(0);
      expect(statSync(source).size).toBeGreaterThan(0);

      const handle = tools.spawnFfmpeg(source, true);
      const first = await new Promise<{ buffer: Buffer; stderr: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('等待 ffmpeg 输出超时')), 15_000);
        handle.stdout?.once('data', (chunk: Buffer) => {
          clearTimeout(timer);
          resolve({ buffer: chunk, stderr: '' });
        });
        handle.onError((error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      expect(first.buffer.subarray(0, 3).toString('ascii')).toBe('FLV');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2000);
        handle.onExit(() => {
          clearTimeout(timer);
          resolve();
        });
        handle.kill();
      });
    },
    30_000
  );
});
