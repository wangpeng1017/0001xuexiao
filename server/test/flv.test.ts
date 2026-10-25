import { describe, expect, it } from 'vitest';
import { FlvParser, type FlvTag } from '../src/lib/flv.js';
import {
  audioBody,
  avcSequenceBody,
  buildFlv,
  buildTag,
  interFrameBody,
  keyframeBody,
  metadataBody
} from './flv-fixture.js';

describe('FLV 解析器', () => {
  it('解析头、元数据、AVC 序列头、关键帧和普通帧', () => {
    const parser = new FlvParser();
    const tags: FlvTag[] = [];
    const data = buildFlv([
      buildTag(18, metadataBody),
      buildTag(9, avcSequenceBody),
      buildTag(9, keyframeBody, 100),
      buildTag(9, interFrameBody, 200),
      buildTag(8, audioBody, 250)
    ]);

    parser.push(data, (tag) => tags.push(tag));

    expect(parser.initialized).toBe(true);
    expect(parser.headerBytes?.length).toBe(13);
    expect(parser.headerBytes?.toString('ascii', 0, 3)).toBe('FLV');
    expect(tags).toHaveLength(5);
    expect(tags[0]!.isScript).toBe(true);
    expect(tags[1]!.isAvcSequenceHeader).toBe(true);
    expect(tags[2]!.isVideoKeyframe).toBe(true);
    expect(tags[2]!.timestamp).toBe(100);
    expect(tags[3]!.isVideoKeyframe).toBe(false);
    expect(tags[4]!.isAudio).toBe(true);
  });

  it('支持任意分片边界（逐字节输入）', () => {
    const parser = new FlvParser();
    const tags: FlvTag[] = [];
    const data = buildFlv([
      buildTag(18, metadataBody),
      buildTag(9, avcSequenceBody),
      buildTag(9, keyframeBody)
    ]);

    for (const byte of data) parser.push(Buffer.from([byte]), (tag) => tags.push(tag));

    expect(tags).toHaveLength(3);
    expect(tags[2]!.isVideoKeyframe).toBe(true);
    expect(tags[2]!.raw.equals(buildTag(9, keyframeBody))).toBe(true);
  });

  it('半个 tag 会等待后续数据，不提前回调', () => {
    const parser = new FlvParser();
    const tags: FlvTag[] = [];
    const data = buildFlv([buildTag(9, keyframeBody)]);
    parser.push(data.subarray(0, data.length - 3), (tag) => tags.push(tag));
    expect(tags).toHaveLength(0);
    parser.push(data.subarray(data.length - 3), (tag) => tags.push(tag));
    expect(tags).toHaveLength(1);
    expect(tags[0]!.isVideoKeyframe).toBe(true);
  });

  it('非 FLV 数据会抛出明确错误', () => {
    const parser = new FlvParser();
    expect(() => parser.push(Buffer.from('not-a-flv-stream'), () => undefined)).toThrow(
      '不是有效的 FLV 数据'
    );
  });
});
