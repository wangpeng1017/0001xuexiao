export const FLV_TAG_TYPE = {
  AUDIO: 8,
  VIDEO: 9,
  SCRIPT: 18
} as const;

export interface FlvTag {
  type: number;
  dataSize: number;
  timestamp: number;
  body: Buffer;
  raw: Buffer;
  isAudio: boolean;
  isVideo: boolean;
  isScript: boolean;
  frameType: number;
  videoCodecId: number;
  avcPacketType: number;
  isVideoKeyframe: boolean;
  isAvcSequenceHeader: boolean;
}

export type FlvTagHandler = (tag: FlvTag) => void;

const TAG_HEADER_SIZE = 11;
const PREVIOUS_TAG_SIZE = 4;
const MAX_TAG_SIZE = 32 * 1024 * 1024;

export class FlvParser {
  private buffer: Buffer = Buffer.alloc(0);
  private header: Buffer | null = null;
  private dataOffset = 0;

  get headerBytes(): Buffer | null {
    return this.header;
  }

  get initialized(): boolean {
    return this.header !== null;
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
    this.header = null;
    this.dataOffset = 0;
  }

  push(chunk: Buffer, onTag: FlvTagHandler): void {
    if (chunk.length === 0) return;
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    this.consume(onTag);
  }

  private consume(onTag: FlvTagHandler): void {
    if (!this.header) {
      if (this.buffer.length < 9) return;
      if (this.buffer.toString('ascii', 0, 3) !== 'FLV') {
        throw new Error('不是有效的 FLV 数据');
      }
      this.dataOffset = this.buffer.readUInt32BE(5);
      if (this.dataOffset < 9 || this.dataOffset > 1024) {
        throw new Error('无效的 FLV 头长度');
      }
    }

    if (!this.header) {
      const headerSize = this.dataOffset + PREVIOUS_TAG_SIZE;
      if (this.buffer.length < headerSize) return;
      this.header = Buffer.from(this.buffer.subarray(0, headerSize));
      this.buffer = this.buffer.subarray(headerSize);
    }

    let offset = 0;
    while (this.buffer.length - offset >= TAG_HEADER_SIZE) {
      const start = offset;
      const type = this.buffer.readUInt8(offset);
      const dataSize = this.buffer.readUIntBE(offset + 1, 3);
      if (dataSize > MAX_TAG_SIZE) throw new Error('FLV tag 超出大小限制');
      const total = TAG_HEADER_SIZE + dataSize + PREVIOUS_TAG_SIZE;
      if (this.buffer.length - offset < total) break;

      const timestamp =
        this.buffer.readUIntBE(offset + 4, 3) + this.buffer.readUInt8(offset + 7) * 0x1000000;
      const bodyStart = offset + TAG_HEADER_SIZE;
      const body = this.buffer.subarray(bodyStart, bodyStart + dataSize);
      const raw = this.buffer.subarray(start, start + total);
      offset += total;

      const isVideo = type === FLV_TAG_TYPE.VIDEO;
      const isAudio = type === FLV_TAG_TYPE.AUDIO;
      const isScript = type === FLV_TAG_TYPE.SCRIPT;
      const frameType = isVideo && dataSize > 0 ? body[0] >> 4 : 0;
      const videoCodecId = isVideo && dataSize > 0 ? body[0] & 0x0f : 0;
      const avcPacketType = isVideo && videoCodecId === 7 && dataSize >= 5 ? body[1] : 0;

      onTag({
        type,
        dataSize,
        timestamp,
        body,
        raw,
        isAudio,
        isVideo,
        isScript,
        frameType,
        videoCodecId,
        avcPacketType,
        isVideoKeyframe: isVideo && frameType === 1 && videoCodecId === 7 && avcPacketType === 1,
        isAvcSequenceHeader: isVideo && videoCodecId === 7 && avcPacketType === 0
      });
    }

    if (offset > 0) this.buffer = this.buffer.subarray(offset);
  }
}

export function isFlvData(buffer: Buffer): boolean {
  return buffer.length >= 9 && buffer.toString('ascii', 0, 3) === 'FLV';
}
