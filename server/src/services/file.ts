import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_IMAGE_BYTES } from '../config.js';
import { BizError } from '../lib/resp.js';

const IMAGE_MIME_TYPES: Record<string, readonly string[]> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'],
  '.svg': ['image/svg+xml'],
  '.webp': ['image/webp']
};

const IMAGE_EXTENSION_HINT = 'png/jpg/jpeg/gif/svg/webp';

export interface UploadedImage {
  fileName: string;
  fileurl: string;
}

export async function saveProjectImage(
  dataDir: string,
  buffer: Buffer,
  originalName: string,
  mimetype: string
): Promise<UploadedImage> {
  const extension = path.extname(originalName).toLowerCase();
  const allowedMimes = IMAGE_MIME_TYPES[extension];
  if (!allowedMimes) {
    throw new BizError(400, `只允许上传图片（${IMAGE_EXTENSION_HINT}）`);
  }

  const normalizedMime = (mimetype.split(';')[0] ?? '').trim().toLowerCase();
  if (!allowedMimes.includes(normalizedMime)) {
    throw new BizError(400, '文件 MIME 类型与扩展名不匹配');
  }
  if (buffer.byteLength === 0) {
    throw new BizError(400, '上传文件为空');
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new BizError(400, '图片大小不能超过 10MB');
  }

  const now = new Date();
  const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetDir = path.join(dataDir, 'files', 'uploads', month);
  await mkdir(targetDir, { recursive: true });

  const storedName = `${randomUUID()}${extension}`;
  await writeFile(path.join(targetDir, storedName), buffer);

  return {
    fileName: originalName,
    fileurl: `/files/uploads/${month}/${storedName}`
  };
}
