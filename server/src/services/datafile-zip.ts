import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

export const MAX_ZIP_ENTRIES = 20_000;
export const MAX_UNZIP_BYTES = 20 * 1024 * 1024 * 1024;

export interface ZipEntryInfo {
  name: string;
  size: number;
  isDirectory: boolean;
}

export interface ZipInspection {
  entries: ZipEntryInfo[];
  totalBytes: number;
  files: string[];
}

function decodeName(entry: yauzl.Entry): string {
  return entry.fileName.replace(/\\/g, '/');
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true, decodeStrings: true }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new Error('无法打开 zip 文件'));
      else resolve(zipFile);
    });
  });
}

export async function inspectZip(zipPath: string): Promise<ZipInspection> {
  const zipFile = await openZip(zipPath);
  return new Promise((resolve, reject) => {
    const entries: ZipEntryInfo[] = [];
    const files: string[] = [];
    let totalBytes = 0;
    let failed = false;

    zipFile.on('error', (error) => {
      if (!failed) {
        failed = true;
        reject(error);
      }
    });
    zipFile.on('entry', (entry: yauzl.Entry) => {
      const name = decodeName(entry);
      const isDirectory = /\/$/.test(name);
      entries.push({ name, size: entry.uncompressedSize, isDirectory });
      if (!isDirectory) files.push(name);
      totalBytes += entry.uncompressedSize;
      if (entries.length > MAX_ZIP_ENTRIES) {
        failed = true;
        zipFile.close();
        reject(new Error(`zip 内文件数量超过 ${MAX_ZIP_ENTRIES} 个限制`));
        return;
      }
      if (totalBytes > MAX_UNZIP_BYTES) {
        failed = true;
        zipFile.close();
        reject(new Error('zip 解压后总大小超过 20GB 限制'));
        return;
      }
      zipFile.readEntry();
    });
    zipFile.on('end', () => {
      if (!failed) resolve({ entries, totalBytes, files });
    });
    zipFile.readEntry();
  });
}

export function normalizeEntryName(rawName: string): string {
  const name = rawName.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new Error(`zip 内包含非法路径: ${rawName}`);
  }
  const segments: string[] = [];
  for (const segment of name.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') throw new Error(`zip 内包含非法路径: ${rawName}`);
    segments.push(segment);
  }
  if (segments.length === 0) throw new Error(`zip 内包含非法路径: ${rawName}`);
  return segments.join('/');
}

function isSymbolicLink(entry: yauzl.Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

export async function extractZip(zipPath: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const targetRoot = path.resolve(targetDir);
  const zipFile = await openZip(zipPath);

  await new Promise<void>((resolve, reject) => {
    let failed = false;
    let count = 0;
    let totalBytes = 0;

    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      zipFile.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    zipFile.on('error', fail);
    zipFile.on('entry', (entry: yauzl.Entry) => {
      const handle = async () => {
        if (isSymbolicLink(entry)) throw new Error(`zip 内不允许符号链接: ${entry.fileName}`);
        const relative = normalizeEntryName(decodeName(entry));
        const targetPath = path.resolve(targetRoot, relative);
        if (targetPath !== targetRoot && !targetPath.startsWith(`${targetRoot}${path.sep}`)) {
          throw new Error(`zip 内包含路径穿越: ${entry.fileName}`);
        }
        count += 1;
        totalBytes += entry.uncompressedSize;
        if (count > MAX_ZIP_ENTRIES) throw new Error(`zip 内文件数量超过 ${MAX_ZIP_ENTRIES} 个限制`);
        if (totalBytes > MAX_UNZIP_BYTES) throw new Error('zip 解压后总大小超过 20GB 限制');

        if (/\/$/.test(entry.fileName)) {
          await mkdir(targetPath, { recursive: true });
          return;
        }
        await mkdir(path.dirname(targetPath), { recursive: true });
        await new Promise<void>((streamResolve, streamReject) => {
          zipFile.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              streamReject(error ?? new Error('无法读取 zip 条目'));
              return;
            }
            pipeline(stream, createWriteStream(targetPath)).then(
              () => streamResolve(),
              streamReject
            );
          });
        });
      };

      handle().then(
        () => {
          if (!failed) zipFile.readEntry();
        },
        (error) => fail(error)
      );
    });
    zipFile.on('end', () => {
      if (!failed) resolve();
    });
    zipFile.readEntry();
  });
}

async function walk(root: string, maxDepth: number): Promise<string[]> {
  const result: string[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      result.push(full);
      if (entry.isDirectory()) await visit(full, depth + 1);
    }
  };
  await visit(root, 0);
  return result;
}

export async function findTilesetRoot(root: string): Promise<string | null> {
  const all = await walk(root, 4);
  const tilesets = all.filter((item) => path.basename(item).toLowerCase() === 'tileset.json');
  if (tilesets.length === 0) return null;
  tilesets.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return path.dirname(tilesets[0]!);
}

export async function findVectorSource(root: string): Promise<string | null> {
  const all = await walk(root, 5);
  const directories = all.filter((item) => item.toLowerCase().endsWith('.gdb'));
  if (directories.length > 0) {
    const info = await stat(directories[0]!);
    if (info.isDirectory()) return directories[0]!;
  }
  const shapefiles = all
    .filter((item) => item.toLowerCase().endsWith('.shp'))
    .sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return shapefiles[0] ?? null;
}

export function zipHasTileset(inspection: ZipInspection): boolean {
  return inspection.files.some((name) => path.basename(name).toLowerCase() === 'tileset.json');
}

export function zipHasVectorSource(inspection: ZipInspection): boolean {
  return inspection.files.some(
    (name) => name.toLowerCase().endsWith('.shp') || name.toLowerCase().endsWith('.gdb/')
  ) || inspection.entries.some((entry) => entry.isDirectory && entry.name.toLowerCase().endsWith('.gdb/'));
}
