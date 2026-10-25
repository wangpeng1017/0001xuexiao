import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readLasSrs } from '../src/services/datafile-las.js';

const dir = mkdtempSync(path.join(tmpdir(), 'las-srs-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function buildLas(vlr: { recordId: number; payload: Buffer } | null): Buffer {
  const header = Buffer.alloc(227);
  header.write('LASF', 0, 'ascii');
  header[24] = 1;
  header[25] = 2;
  header.writeUInt16LE(227, 94);
  header.writeUInt32LE(1, 100);
  const vlrHeader = Buffer.alloc(54);
  let vlrBuffer = Buffer.alloc(0);
  if (vlr) {
    vlrHeader.writeUInt16LE(vlr.recordId, 18);
    vlrHeader.writeUInt16LE(vlr.payload.length, 20);
    vlrBuffer = Buffer.concat([vlrHeader, vlr.payload]);
  }
  header.writeUInt32LE(227 + vlrBuffer.length, 96);
  header.writeUInt32LE(vlr ? 1 : 0, 100);
  return Buffer.concat([header, vlrBuffer]);
}

function geoKeyPayload(epsg: number): Buffer {
  const payload = Buffer.alloc(8 + 8);
  payload.writeUInt16LE(1, 0);
  payload.writeUInt16LE(1, 2);
  payload.writeUInt16LE(0, 4);
  payload.writeUInt16LE(1, 6);
  payload.writeUInt16LE(3072, 8);
  payload.writeUInt16LE(0, 10);
  payload.writeUInt16LE(1, 12);
  payload.writeUInt16LE(epsg, 14);
  return payload;
}

describe('LAS 文件头坐标系读取', () => {
  it('能从 GeoKeyDirectory 读取 EPSG', async () => {
    const file = path.join(dir, 'geokey.las');
    await writeFile(file, buildLas({ recordId: 34735, payload: geoKeyPayload(4547) }));
    await expect(readLasSrs(file)).resolves.toBe('EPSG:4547');
  });

  it('能从 WKT VLR 读取 EPSG', async () => {
    const file = path.join(dir, 'wkt.las');
    const wkt = 'PROJCS["CGCS2000 / 3-degree Gauss-Kruger CM 114E",AUTHORITY["EPSG","4547"]]';
    await writeFile(file, buildLas({ recordId: 2112, payload: Buffer.from(wkt, 'utf8') }));
    await expect(readLasSrs(file)).resolves.toBe('EPSG:4547');
  });

  it('没有坐标系 VLR 时返回 null', async () => {
    const file = path.join(dir, 'empty.las');
    await writeFile(file, buildLas(null));
    await expect(readLasSrs(file)).resolves.toBeNull();
  });

  it('非 LAS 文件返回 null', async () => {
    const file = path.join(dir, 'not.las');
    await writeFile(file, 'hello');
    await expect(readLasSrs(file)).resolves.toBeNull();
  });
});
