import { describe, expect, it } from 'vitest';
import {
  encodeLocalSrs,
  enuToEcefMatrix,
  LOCAL_SRS,
  parseStoredSrs,
  validateLocalAnchor
} from '../src/lib/local-frame.js';

describe('局部坐标 ENU->ECEF 矩阵', () => {
  it('锚点 0,0,0 处为已知值（东=Y、北=Z、上=X，平移为赤道半径）', () => {
    const matrix = enuToEcefMatrix({ lon: 0, lat: 0, height: 0 });
    expect(matrix).toHaveLength(16);
    expect(matrix[0]).toBeCloseTo(0, 12);
    expect(matrix[1]).toBeCloseTo(1, 12);
    expect(matrix[2]).toBeCloseTo(0, 12);
    expect(matrix[3]).toBe(0);
    expect(matrix[4]).toBeCloseTo(0, 12);
    expect(matrix[5]).toBeCloseTo(0, 12);
    expect(matrix[6]).toBeCloseTo(1, 12);
    expect(matrix[7]).toBe(0);
    expect(matrix[8]).toBeCloseTo(1, 12);
    expect(matrix[9]).toBeCloseTo(0, 12);
    expect(matrix[10]).toBeCloseTo(0, 12);
    expect(matrix[11]).toBe(0);
    expect(matrix[12]).toBeCloseTo(6378137, 6);
    expect(matrix[13]).toBeCloseTo(0, 12);
    expect(matrix[14]).toBeCloseTo(0, 12);
    expect(matrix[15]).toBe(1);
  });

  it('校园锚点处 Z 轴方向为椭球法线', () => {
    const anchor = { lon: 116.31, lat: 40, height: 0 };
    const matrix = enuToEcefMatrix(anchor);
    const up = matrix.slice(8, 11);
    const lon = (anchor.lon * Math.PI) / 180;
    const lat = (anchor.lat * Math.PI) / 180;
    const normal = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    up.forEach((value, index) => expect(value).toBeCloseTo(normal[index]!, 10));
  });
});

describe('局部坐标存储格式', () => {
  it('编码后能解码回锚点，EPSG 保持原样', () => {
    expect(encodeLocalSrs({ lon: 116.31, lat: 40, height: 12.5 })).toBe('LOCAL:116.31,40,12.5');
    expect(parseStoredSrs('LOCAL:116.31,40,12.5')).toEqual({
      srs: LOCAL_SRS,
      anchor: { lon: 116.31, lat: 40, height: 12.5 }
    });
    expect(parseStoredSrs('EPSG:4547')).toEqual({ srs: 'EPSG:4547' });
    expect(parseStoredSrs(null)).toEqual({});
  });

  it('非法锚点被拒绝', () => {
    expect(() => validateLocalAnchor({ lon: 181, lat: 0, height: 0 })).toThrow('经度');
    expect(() => validateLocalAnchor({ lon: 0, lat: -91, height: 0 })).toThrow('纬度');
    expect(() => validateLocalAnchor({ lon: 0, lat: 0, height: Number.POSITIVE_INFINITY })).toThrow(
      '高度'
    );
  });
});
