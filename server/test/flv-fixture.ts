export function buildTag(type: number, body: Buffer, timestamp = 0): Buffer {
  const header = Buffer.alloc(11);
  header[0] = type;
  header.writeUIntBE(body.length, 1, 3);
  header.writeUIntBE(timestamp & 0xffffff, 4, 3);
  header[7] = Math.floor(timestamp / 0x1000000) & 0xff;
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(11 + body.length);
  return Buffer.concat([header, body, tail]);
}

export function buildFlv(tags: Buffer[]): Buffer {
  const header = Buffer.from([0x46, 0x4c, 0x56, 0x01, 0x01, 0x00, 0x00, 0x00, 0x09]);
  const previous = Buffer.alloc(4);
  return Buffer.concat([header, previous, ...tags]);
}

export const metadataBody = Buffer.concat([
  Buffer.from([0x02, 0x00, 0x0a]),
  Buffer.from('onMetaData', 'utf8')
]);
export const avcSequenceBody = Buffer.from([0x17, 0x00, 0x00, 0x00, 0x00, 0x01, 0x64, 0x00, 0x1f]);
export const keyframeBody = Buffer.from([0x17, 0x01, 0x00, 0x00, 0x00, 0xaa, 0xbb]);
export const interFrameBody = Buffer.from([0x27, 0x01, 0x00, 0x00, 0x00, 0xcc]);
export const audioBody = Buffer.from([0xaf, 0x01]);
