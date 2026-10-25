import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { User } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';
import type { Role } from '../src/types.js';

const serverRoot = fileURLToPath(new URL('..', import.meta.url));

export const DEFAULT_PASSWORD = 'Passw0rd1';

export interface TestContext {
  app: FastifyInstance;
  dir: string;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export interface SeedUserOptions {
  username: string;
  nickname?: string;
  password?: string;
  role?: Role;
  disabled?: boolean;
  mustChangePwd?: boolean;
}

export interface LoginUserinfo {
  id: string;
  username: string;
  nickname: string;
  role: Role;
  mustChangePwd: boolean;
}

export interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  count?: number;
}

export interface LoginData {
  token: { tokenName: string; tokenValue: string };
  userinfo: LoginUserinfo;
}

export interface MultipartPart {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  content?: Buffer | string;
}

function toSqliteUrl(filePath: string): string {
  return `file:${filePath.replace(/\\/g, '/')}`;
}

export async function createTestContext(): Promise<TestContext> {
  const dir = mkdtempSync(path.join(tmpdir(), 'goview-m1-test-'));
  const databaseUrl = toSqliteUrl(path.join(dir, 'test.db'));
  const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');

  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PRISMA_HIDE_UPDATE_MESSAGE: '1'
    },
    stdio: 'pipe'
  });

  const app = await buildApp({
    logger: false,
    config: {
      databaseUrl,
      dataDir: path.join(dir, 'data'),
      jwtSecret: 'test-jwt-secret-for-vitest',
      nodeEnv: 'test'
    }
  });
  await app.ready();

  return {
    app,
    dir,
    reset: async () => {
      await app.prisma.project.deleteMany();
      await app.prisma.material.deleteMany();
      await app.prisma.teamMember.deleteMany();
      await app.prisma.team.deleteMany();
      await app.prisma.user.deleteMany();
    },
    close: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

export async function seedUser(
  app: FastifyInstance,
  options: SeedUserOptions
): Promise<User> {
  return app.prisma.user.create({
    data: {
      username: options.username,
      nickname: options.nickname ?? options.username,
      role: options.role ?? 'teacher',
      passwordHash: await hashPassword(options.password ?? DEFAULT_PASSWORD),
      disabled: options.disabled ?? false,
      mustChangePwd: options.mustChangePwd ?? false
    }
  });
}

export async function login(
  app: FastifyInstance,
  username: string,
  password: string = DEFAULT_PASSWORD
) {
  return app.inject({
    method: 'POST',
    url: '/api/goview/sys/login',
    payload: { username, password }
  });
}

export async function loginToken(
  app: FastifyInstance,
  username: string,
  password: string = DEFAULT_PASSWORD
): Promise<string> {
  const response = await login(app, username, password);
  const body = readJson<LoginData>(response);
  if (body.code !== 200) {
    throw new Error(`登录失败: ${response.body}`);
  }
  return body.data.token.tokenValue;
}

export function authHeaders(tokenValue: string): Record<string, string> {
  return { authorization: tokenValue };
}

export function readJson<T>(response: { body: string }): ApiEnvelope<T> {
  return JSON.parse(response.body) as ApiEnvelope<T>;
}

export function multipartBody(parts: MultipartPart[]): {
  payload: Buffer;
  headers: Record<string, string>;
} {
  const boundary = `----GoviewTestBoundary${Date.now()}${Math.random()
    .toString(16)
    .slice(2)}`;
  const chunks: Buffer[] = [];

  for (const part of parts) {
    let disposition = `Content-Disposition: form-data; name="${part.name}"`;
    if (part.filename !== undefined) {
      disposition += `; filename="${part.filename}"`;
    }
    const headerLines = [`--${boundary}`, disposition];
    if (part.contentType) headerLines.push(`Content-Type: ${part.contentType}`);
    chunks.push(Buffer.from(`${headerLines.join('\r\n')}\r\n\r\n`, 'utf8'));

    const content = part.content ?? part.value ?? '';
    chunks.push(Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }
  };
}

export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
  'base64'
);
