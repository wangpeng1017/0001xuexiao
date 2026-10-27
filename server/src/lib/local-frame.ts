import { BizError } from './resp.js';

export const LOCAL_SRS = 'LOCAL';

export interface LocalAnchor {
  lon: number;
  lat: number;
  height: number;
}

export const DEFAULT_LOCAL_ANCHOR: LocalAnchor = { lon: 116.31, lat: 40, height: 0 };

const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;
const DEG_TO_RAD = Math.PI / 180;

export function validateLocalAnchor(value?: Partial<LocalAnchor> | null): LocalAnchor {
  const lon = value?.lon ?? DEFAULT_LOCAL_ANCHOR.lon;
  const lat = value?.lat ?? DEFAULT_LOCAL_ANCHOR.lat;
  const height = value?.height ?? DEFAULT_LOCAL_ANCHOR.height;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new BizError(400, '局部坐标经度应为 -180 到 180 之间的数字');
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new BizError(400, '局部坐标纬度应为 -90 到 90 之间的数字');
  }
  if (!Number.isFinite(height)) {
    throw new BizError(400, '局部坐标高度应为有限数字');
  }
  return { lon, lat, height };
}

export function encodeLocalSrs(anchor: LocalAnchor): string {
  return `${LOCAL_SRS}:${anchor.lon},${anchor.lat},${anchor.height}`;
}

export interface StoredSrs {
  srs?: string;
  anchor?: LocalAnchor;
}

export function parseStoredSrs(value?: string | null): StoredSrs {
  const raw = value?.trim();
  if (!raw) return {};
  if (raw.toUpperCase() === LOCAL_SRS) return { srs: LOCAL_SRS, anchor: DEFAULT_LOCAL_ANCHOR };
  const match = /^LOCAL:(.+)$/i.exec(raw);
  if (!match) return { srs: raw };
  const parts = match[1]!.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    throw new BizError(400, '局部坐标锚点格式不正确');
  }
  return {
    srs: LOCAL_SRS,
    anchor: validateLocalAnchor({ lon: parts[0], lat: parts[1], height: parts[2] })
  };
}

// 列主序 4x4：局部 ENU -> ECEF(EPSG:4978)，X 东、Y 北、Z 上
export function enuToEcefMatrix(anchor: LocalAnchor): number[] {
  const lon = anchor.lon * DEG_TO_RAD;
  const lat = anchor.lat * DEG_TO_RAD;
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const x = (primeVertical + anchor.height) * cosLat * cosLon;
  const y = (primeVertical + anchor.height) * cosLat * sinLon;
  const z = (primeVertical * (1 - WGS84_E2) + anchor.height) * sinLat;
  return [
    -sinLon, cosLon, 0, 0,
    -sinLat * cosLon, -sinLat * sinLon, cosLat, 0,
    cosLat * cosLon, cosLat * sinLon, sinLat, 0,
    x, y, z, 1
  ];
}

export function multiplyMatrix4(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row]! * b[col * 4 + k]!;
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function applyLocalAnchorTransform(transform: number[] | undefined, anchor: LocalAnchor): number[] {
  const localToEcef = enuToEcefMatrix(anchor);
  if (transform === undefined) return localToEcef;
  if (transform.length !== 16 || !transform.every((value) => Number.isFinite(value))) {
    throw new Error('tileset.json 的 root.transform 格式不正确');
  }
  return multiplyMatrix4(localToEcef, transform);
}
