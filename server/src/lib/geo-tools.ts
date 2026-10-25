import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  cwd?: string;
  onProgress?: (percent: number) => void;
  onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export interface RunResult {
  command: string;
  args: string[];
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  canceled: boolean;
  error?: string;
}

export interface SpawnOptions {
  cwd?: string;
  onStderr?: (chunk: string) => void;
}

export interface SpawnHandle {
  stdout: NodeJS.ReadableStream | null;
  kill: (signal?: NodeJS.Signals) => void;
  onExit: (callback: (code: number | null, signal: string | null, stderr: string) => void) => void;
  onError: (callback: (error: Error) => void) => void;
}

export interface CommandRunner {
  run: (command: string, args: string[], options?: RunOptions) => Promise<RunResult>;
  spawn: (command: string, args: string[], options?: SpawnOptions) => SpawnHandle;
}

export interface GeoEnv {
  GDAL_BIN_DIR?: string;
  PY3DTILES_CMD?: string;
  FFMPEG_PATH?: string;
}

export interface GeoRunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 512 * 1024;

const PERCENT_PATTERN = /(\d{1,3})\s*%/g;
const GDAL2TILES_PATTERN = /(?:^|[^\d])(\d{1,3})(?=\.\.\.)/g;

function parseProgress(text: string): number[] {
  const result: number[] = [];
  for (const regex of [PERCENT_PATTERN, GDAL2TILES_PATTERN]) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const value = Number(match[1]);
      if (value >= 0 && value <= 100) result.push(value);
    }
  }
  return result;
}

function appendLimited(target: Buffer[], chunk: Buffer, limit: number, total: number): number {
  if (total >= limit) return total;
  const remaining = limit - total;
  const part = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
  target.push(part);
  return total + part.length;
}

export function createSpawnRunner(): CommandRunner {
  return {
    run(command, args, options = {}) {
      return new Promise<RunResult>((resolve) => {
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;
        let canceled = false;
        let settled = false;
        let lastProgress = -1;

        const child = spawn(command, args, {
          cwd: options.cwd,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        const finish = (code: number | null, signal: string | null, error?: Error) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (options.signal) options.signal.removeEventListener('abort', onAbort);
          resolve({
            command,
            args,
            code,
            signal,
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
            timedOut,
            canceled,
            error: error?.message
          });
        };

        const handleChunk = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
          if (stream === 'stdout') {
            stdoutBytes = appendLimited(stdoutChunks, chunk, MAX_STDOUT_BYTES, stdoutBytes);
          } else {
            stderrBytes = appendLimited(stderrChunks, chunk, MAX_STDERR_BYTES, stderrBytes);
          }
          const text = chunk.toString('utf8');
          options.onOutput?.(text, stream);
          if (options.onProgress) {
            for (const percent of parseProgress(text)) {
              if (percent > lastProgress) {
                lastProgress = percent;
                options.onProgress(percent);
              }
            }
          }
        };

        child.stdout?.on('data', (chunk: Buffer) => handleChunk(chunk, 'stdout'));
        child.stderr?.on('data', (chunk: Buffer) => handleChunk(chunk, 'stderr'));
        child.on('error', (error) => finish(null, null, error));
        child.on('close', (code, signal) => finish(code, signal));

        const kill = () => child.kill('SIGKILL');
        const timer = setTimeout(() => {
          timedOut = true;
          kill();
        }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        if (typeof timer.unref === 'function') timer.unref();

        const onAbort = () => {
          canceled = true;
          kill();
        };
        if (options.signal) {
          if (options.signal.aborted) onAbort();
          else options.signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    },

    spawn(command, args, options = {}) {
      const child = spawn(command, args, {
        cwd: options.cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const stderrChunks: Buffer[] = [];
      let stderrBytes = 0;
      let exitInfo: { code: number | null; signal: string | null } | null = null;
      let spawnError: Error | null = null;
      const exitCallbacks: Array<(code: number | null, signal: string | null, stderr: string) => void> = [];
      const errorCallbacks: Array<(error: Error) => void> = [];

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBytes = appendLimited(stderrChunks, chunk, MAX_STDERR_BYTES, stderrBytes);
        options.onStderr?.(chunk.toString('utf8'));
      });

      child.on('error', (error) => {
        spawnError = error;
        for (const callback of errorCallbacks.splice(0)) callback(error);
      });
      child.on('close', (code, signal) => {
        exitInfo = { code, signal };
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        for (const callback of exitCallbacks.splice(0)) callback(code, signal, stderr);
      });

      return {
        stdout: child.stdout,
        kill: (signal?: NodeJS.Signals) => {
          if (!child.killed) child.kill(signal ?? 'SIGKILL');
        },
        onExit: (callback) => {
          if (exitInfo) callback(exitInfo.code, exitInfo.signal, Buffer.concat(stderrChunks).toString('utf8'));
          else exitCallbacks.push(callback);
        },
        onError: (callback) => {
          if (spawnError) callback(spawnError);
          else errorCallbacks.push(callback);
        }
      };
    }
  };
}

function resolveGdalCommand(env: GeoEnv, name: string): string {
  return env.GDAL_BIN_DIR ? path.join(env.GDAL_BIN_DIR, name) : name;
}

function resolveExecutable(env: GeoEnv, value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  return raw ? raw : fallback;
}

function isMissingCommand(result: RunResult): boolean {
  if (result.code !== null) return false;
  const message = `${result.error ?? ''} ${result.stderr}`.toLowerCase();
  return message.includes('enoent') || message.includes('not found') || message.includes('no such file');
}

export interface GeoTools {
  runner: CommandRunner;
  env: GeoEnv;
  gdalinfo: (file: string, options?: GeoRunOptions) => Promise<RunResult>;
  ogrinfo: (file: string, options?: GeoRunOptions) => Promise<RunResult>;
  gdalFormats: () => Promise<RunResult>;
  ogrFormats: () => Promise<RunResult>;
  ogr2ogrToGeoJson: (
    input: string,
    output: string,
    options?: GeoRunOptions & { csv?: boolean }
  ) => Promise<RunResult>;
  gdalwarpTo3857: (input: string, output: string, options?: GeoRunOptions) => Promise<RunResult>;
  gdal2tiles: (input: string, outDir: string, options?: GeoRunOptions) => Promise<RunResult>;
  py3dtiles: (
    input: string,
    outDir: string,
    srsIn?: string,
    options?: GeoRunOptions
  ) => Promise<RunResult>;
  ffmpegArgs: (input: string, fileMode: boolean) => string[];
  spawnFfmpeg: (input: string, fileMode: boolean, onStderr?: (chunk: string) => void) => SpawnHandle;
  isAvailable: (tool: 'gdalinfo' | 'ogrinfo' | 'gdal2tiles' | 'py3dtiles' | 'ffmpeg') => Promise<boolean>;
}

export function createGeoTools(runner: CommandRunner = createSpawnRunner(), env: GeoEnv = process.env): GeoTools {
  const availability = new Map<string, Promise<boolean>>();

  const run = (command: string, args: string[], options?: GeoRunOptions) =>
    runner.run(command, args, options);

  const gdal2tilesProcesses = Math.max(1, (os.cpus().length || 2) - 1);

  const tools: GeoTools = {
    runner,
    env,
    gdalinfo: (file, options) => run(resolveGdalCommand(env, 'gdalinfo'), ['-json', file], options),
    ogrinfo: (file, options) =>
      run(resolveGdalCommand(env, 'ogrinfo'), ['-ro', '-so', file], options),
    gdalFormats: () => run(resolveGdalCommand(env, 'gdalinfo'), ['--formats'], { timeoutMs: 20_000 }),
    ogrFormats: () => run(resolveGdalCommand(env, 'ogrinfo'), ['--formats'], { timeoutMs: 20_000 }),
    ogr2ogrToGeoJson: (input, output, options = {}) => {
      const args = ['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', output, input];
      if (options.csv) {
        args.push(
          '-oo',
          'X_POSSIBLE_NAMES=lon,lng,longitude,经度',
          '-oo',
          'Y_POSSIBLE_NAMES=lat,latitude,纬度'
        );
      }
      return run(resolveGdalCommand(env, 'ogr2ogr'), args, options);
    },
    gdalwarpTo3857: (input, output, options) =>
      run(resolveGdalCommand(env, 'gdalwarp'), ['-t_srs', 'EPSG:3857', '-of', 'GTiff', input, output], options),
    gdal2tiles: (input, outDir, options) => {
      const args = [
        '--xyz',
        '-w',
        'none',
        `--processes=${gdal2tilesProcesses}`,
        input,
        outDir
      ];
      const primary = resolveGdalCommand(env, 'gdal2tiles.py');
      return run(primary, args, options).then((result) => {
        if (!isMissingCommand(result)) return result;
        return run(resolveGdalCommand(env, 'gdal2tiles'), args, options);
      });
    },
    py3dtiles: (input, outDir, srsIn, options) => {
      const args = ['convert', input, '--out', outDir, '--srs_out', 'EPSG:4978'];
      if (srsIn) args.push('--srs_in', srsIn);
      return run(resolveExecutable(env, env.PY3DTILES_CMD, 'py3dtiles'), args, options);
    },
    ffmpegArgs: (input, fileMode) => {
      if (fileMode) {
        return [
          '-re',
          '-stream_loop',
          '-1',
          '-i',
          input,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-tune',
          'zerolatency',
          '-g',
          '25',
          '-an',
          '-f',
          'flv',
          '-flvflags',
          'no_duration_filesize',
          'pipe:1'
        ];
      }
      return [
        '-rtsp_transport',
        'tcp',
        '-i',
        input,
        '-c:v',
        'copy',
        '-an',
        '-f',
        'flv',
        '-flvflags',
        'no_duration_filesize',
        'pipe:1'
      ];
    },
    spawnFfmpeg: (input, fileMode, onStderr) =>
      runner.spawn(
        resolveExecutable(env, env.FFMPEG_PATH, 'ffmpeg'),
        ['-nostdin', '-loglevel', 'error', ...tools.ffmpegArgs(input, fileMode)],
        { onStderr }
      ),
    isAvailable: (tool) => {
      const cached = availability.get(tool);
      if (cached) return cached;
      let promise: Promise<boolean>;
      if (tool === 'gdalinfo') {
        promise = run(resolveGdalCommand(env, 'gdalinfo'), ['--version'], { timeoutMs: 10_000 }).then(
          (result) => result.code === 0
        );
      } else if (tool === 'ogrinfo') {
        promise = run(resolveGdalCommand(env, 'ogrinfo'), ['--version'], { timeoutMs: 10_000 }).then(
          (result) => result.code === 0
        );
      } else if (tool === 'gdal2tiles') {
        promise = run(resolveGdalCommand(env, 'gdal2tiles.py'), ['--version'], { timeoutMs: 10_000 })
          .then((result) =>
            result.code === 0
              ? true
              : run(resolveGdalCommand(env, 'gdal2tiles'), ['--version'], { timeoutMs: 10_000 }).then(
                  (fallback) => fallback.code === 0
                )
          );
      } else if (tool === 'py3dtiles') {
        promise = run(resolveExecutable(env, env.PY3DTILES_CMD, 'py3dtiles'), ['--version'], {
          timeoutMs: 10_000
        }).then((result) => result.code === 0);
      } else {
        promise = run(resolveExecutable(env, env.FFMPEG_PATH, 'ffmpeg'), ['-version'], {
          timeoutMs: 10_000
        }).then((result) => result.code === 0);
      }
      availability.set(tool, promise);
      return promise;
    }
  };

  return tools;
}

export const geoTools = createGeoTools();

export function extractProgress(text: string): number[] {
  return parseProgress(text);
}
