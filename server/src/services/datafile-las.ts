import { open } from 'node:fs/promises';

const MAX_HEADER_READ = 8 * 1024 * 1024;
const VLR_HEADER_SIZE = 54;

function epsgFromGeoKeys(payload: Buffer): string | null {
  if (payload.length < 8) return null;
  const keyCount = payload.readUInt16LE(6);
  const keys = new Map<number, number>();
  for (let index = 0; index < keyCount; index += 1) {
    const offset = 8 + index * 8;
    if (offset + 8 > payload.length) break;
    const keyId = payload.readUInt16LE(offset);
    const valueOffset = payload.readUInt16LE(offset + 6);
    keys.set(keyId, valueOffset);
  }
  for (const keyId of [3072, 2048]) {
    const code = keys.get(keyId);
    if (code && code !== 32767 && code > 0) return `EPSG:${code}`;
  }
  return null;
}

function epsgFromWkt(text: string): string | null {
  const patterns = [
    /AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(\d{4,6})"?\s*\]/gi,
    /ID\s*\[\s*"EPSG"\s*,\s*(\d{4,6})\s*\]/gi
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    let last: string | null = null;
    while ((match = pattern.exec(text)) !== null) {
      last = match[1] ?? last;
    }
    if (last) return `EPSG:${last}`;
  }
  return null;
}

export async function readLasSrs(filePath: string): Promise<string | null> {
  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(375);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 227) return null;
    if (header.toString('ascii', 0, 4) !== 'LASF') return null;

    const headerSize = header.readUInt16LE(94);
    const pointDataOffset = header.readUInt32LE(96);
    const vlrCount = header.readUInt32LE(100);
    if (headerSize < 227 || vlrCount === 0 || pointDataOffset <= headerSize) return null;

    const readSize = Math.min(pointDataOffset, MAX_HEADER_READ);
    const buffer = Buffer.alloc(readSize);
    const readResult = await handle.read(buffer, 0, readSize, 0);
    if (readResult.bytesRead < headerSize) return null;

    let offset = headerSize;
    for (let index = 0; index < vlrCount; index += 1) {
      if (offset + VLR_HEADER_SIZE > readResult.bytesRead) break;
      const recordId = buffer.readUInt16LE(offset + 18);
      const recordLength = buffer.readUInt16LE(offset + 20);
      const payloadStart = offset + VLR_HEADER_SIZE;
      const payloadEnd = payloadStart + recordLength;
      if (payloadEnd > readResult.bytesRead) break;
      const payload = buffer.subarray(payloadStart, payloadEnd);

      if (recordId === 34735) {
        const epsg = epsgFromGeoKeys(payload);
        if (epsg) return epsg;
      }
      if (recordId === 2111 || recordId === 2112) {
        const epsg = epsgFromWkt(payload.toString('utf8').replace(/\0/g, ''));
        if (epsg) return epsg;
      }
      offset = payloadEnd;
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}
