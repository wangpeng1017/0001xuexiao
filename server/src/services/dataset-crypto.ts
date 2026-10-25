import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'goview-dataset', 'aes-256-gcm', 32));
}

export function encryptJson(value: unknown, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptJson<T>(payload: string, secret: string): T {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('数据集配置密文格式无效');
  }
  const [, ivBase64, tagBase64, dataBase64] = parts;
  const key = deriveKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagBase64!, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataBase64!, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
