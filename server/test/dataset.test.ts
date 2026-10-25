import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatasetOpenService } from '../src/services/dataset-open.js';
import { decryptJson } from '../src/services/dataset-crypto.js';
import type { MysqlConfig } from '../src/services/dataset-providers.js';
import {
  authHeaders,
  createTestContext,
  loginToken,
  seedUser,
  type TestContext
} from './helpers.js';
import { envelope } from './datafile-helpers.js';

interface DatasetRow {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createUserName: string;
}

describe('数据集与开放数据接口', () => {
  let ctx: TestContext;
  let adminToken: string;
  let aliceToken: string;
  let bobToken: string;
  let server: Server;
  let port: number;
  let calls = 0;

  beforeAll(async () => {
    server = createServer((request, response) => {
      calls += 1;
      const url = request.url ?? '/';
      if (url === '/iot') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ data: { list: [{ id: 1, value: 10 }, { id: 2, value: 20 }] } }));
        return;
      }
      if (url === '/rows') {
        const rows = Array.from({ length: 60 }, (_, index) => ({ id: index, value: index * 2 }));
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(rows));
        return;
      }
      if (url === '/huge') {
        const rows = Array.from({ length: 60 }, (_, index) => ({
          id: index,
          text: 'x'.repeat(2000)
        }));
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(rows));
        return;
      }
      if (url === '/big') {
        response.setHeader('content-type', 'application/json');
        response.setHeader('content-length', String(6 * 1024 * 1024));
        response.end('x'.repeat(6 * 1024 * 1024));
        return;
      }
      if (url === '/echo' && request.method === 'POST') {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          response.setHeader('content-type', 'application/json');
          response.end(Buffer.concat(chunks));
        });
        return;
      }
      response.statusCode = 500;
      response.end('error');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;

    ctx = await createTestContext();
    await seedUser(ctx.app, { username: 'admin', role: 'admin' });
    await seedUser(ctx.app, { username: 'alice' });
    await seedUser(ctx.app, { username: 'bob' });
    adminToken = await loginToken(ctx.app, 'admin');
    aliceToken = await loginToken(ctx.app, 'alice');
    bobToken = await loginToken(ctx.app, 'bob');
  });

  afterAll(async () => {
    await ctx.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await ctx.app.prisma.dataset.deleteMany();
    calls = 0;
  });

  async function createHttpDataset(name: string, path = '/iot'): Promise<string> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/dataset/create',
      headers: authHeaders(aliceToken),
      payload: {
        name,
        type: 'http',
        config: {
          url: `http://127.0.0.1:${port}${path}`,
          method: 'GET',
          headers: {},
          body: '',
          dataPath: path === '/iot' ? 'data.list' : ''
        }
      }
    });
    const body = envelope<{ id: string }>(response);
    expect(body.code).toBe(200);
    return body.data.id;
  }

  it('创建、列表、测试预览与开放接口（免登录 + 2 秒缓存）', async () => {
    const id = await createHttpDataset('物联网');
    const list = envelope<DatasetRow[]>(
      await ctx.app.inject({
        method: 'GET',
        url: '/api/goview/dataset/list?page=1&limit=10',
        headers: authHeaders(aliceToken)
      })
    );
    expect(list.code).toBe(200);
    expect(list.data[0]!.id).toBe(id);
    expect(list.data[0]!.createUserName).toBe('alice');
    expect(list.data[0]!.config.url).toContain('/iot');

    const previewResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/dataset/test',
      headers: authHeaders(aliceToken),
      payload: { id }
    });
    const preview = JSON.parse(previewResponse.body) as {
      code: number;
      data: unknown;
      truncated: boolean;
    };
    expect(preview.code).toBe(200);
    expect(preview.truncated).toBe(false);
    expect(preview.data).toEqual([
      { id: 1, value: 10 },
      { id: 2, value: 20 }
    ]);

    calls = 0;
    const first = envelope<Array<{ id: number }>>(
      await ctx.app.inject({ method: 'GET', url: `/api/goview/open/dataset/${id}/data` })
    );
    expect(first.code).toBe(200);
    expect(first.data).toHaveLength(2);
    await ctx.app.inject({ method: 'GET', url: `/api/goview/open/dataset/${id}/data` });
    expect(calls).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 2100));
    await ctx.app.inject({ method: 'GET', url: `/api/goview/open/dataset/${id}/data` });
    expect(calls).toBe(2);
  });

  it('http provider 支持 POST 透传与 dataPath，行数截断到 50 行', async () => {
    const echo = envelope<unknown>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/dataset/test',
        headers: authHeaders(aliceToken),
        payload: {
          type: 'http',
          config: {
            url: `http://127.0.0.1:${port}/echo`,
            method: 'POST',
            headers: { 'X-Token': 'abc' },
            body: '{"hello":"world"}',
            dataPath: 'hello'
          }
        }
      })
    );
    expect(echo.code).toBe(200);
    expect(echo.data).toBe('world');

    const rows = envelope<unknown[]>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/dataset/test',
        headers: authHeaders(aliceToken),
        payload: {
          type: 'http',
          config: {
            url: `http://127.0.0.1:${port}/rows`,
            method: 'GET',
            headers: {},
            body: '',
            dataPath: ''
          }
        }
      })
    );
    expect(rows.data).toHaveLength(50);
    expect((rows as unknown as { truncated: boolean }).truncated).toBe(false);

    const huge = envelope<{ preview?: string }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/dataset/test',
        headers: authHeaders(aliceToken),
        payload: {
          type: 'http',
          config: {
            url: `http://127.0.0.1:${port}/huge`,
            method: 'GET',
            headers: {},
            body: '',
            dataPath: ''
          }
        }
      })
    );
    expect((huge as unknown as { truncated: boolean }).truncated).toBe(true);
    expect(typeof huge.data.preview).toBe('string');
  });

  it('响应超过 5MB 与数据路径不存在时返回 400', async () => {
    const big = envelope(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/dataset/test',
        headers: authHeaders(aliceToken),
        payload: {
          type: 'http',
          config: {
            url: `http://127.0.0.1:${port}/big`,
            method: 'GET',
            headers: {},
            body: '',
            dataPath: ''
          }
        }
      })
    );
    expect(big.code).toBe(400);
    expect(big.msg).toContain('5MB');

    const missing = envelope(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/dataset/test',
        headers: authHeaders(aliceToken),
        payload: {
          type: 'http',
          config: {
            url: `http://127.0.0.1:${port}/iot`,
            method: 'GET',
            headers: {},
            body: '',
            dataPath: 'data.nope'
          }
        }
      })
    );
    expect(missing.code).toBe(400);
    expect(missing.msg).toContain('数据路径');
  });

  it('MySQL 密码加密存储，列表与编辑不回显，空密码保持原值', async () => {
    const config = {
      host: '127.0.0.1',
      port: 3306,
      database: 'school',
      user: 'reader',
      password: 'SuperSecret123',
      sql: 'SELECT id FROM students'
    };
    const created = envelope<{ id: string }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/dataset/create',
        headers: authHeaders(aliceToken),
        payload: { name: '业务库', type: 'mysql', config }
      })
    );
    expect(created.code).toBe(200);
    const id = created.data.id;
    const row = await ctx.app.prisma.dataset.findUniqueOrThrow({ where: { id } });
    expect(row.config).not.toContain('SuperSecret123');
    const decrypted = decryptJson<MysqlConfig>(row.config, ctx.app.config.jwtSecret);
    expect(decrypted.password).toBe('SuperSecret123');

    const list = envelope<DatasetRow[]>(
      await ctx.app.inject({
        method: 'GET',
        url: '/api/goview/dataset/list',
        headers: authHeaders(aliceToken)
      })
    );
    expect(list.data[0]!.config.password).toBe('');

    const edit = envelope(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/dataset/edit',
        headers: authHeaders(aliceToken),
        payload: {
          id,
          name: '业务库2',
          config: { ...config, password: '', sql: 'SELECT name FROM students' }
        }
      })
    );
    expect(edit.code).toBe(200);
    const updated = await ctx.app.prisma.dataset.findUniqueOrThrow({ where: { id } });
    const updatedConfig = decryptJson<MysqlConfig>(updated.config, ctx.app.config.jwtSecret);
    expect(updatedConfig.password).toBe('SuperSecret123');
    expect(updatedConfig.sql).toContain('SELECT name');
  });

  it('数据集编辑与删除权限：本人或 admin', async () => {
    const id = await createHttpDataset('权限测试');
    const bobEdit = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/dataset/edit',
      headers: authHeaders(bobToken),
      payload: { id, name: 'bob 改名' }
    });
    expect(envelope(bobEdit).code).toBe(403);

    const bobTest = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/dataset/test',
      headers: authHeaders(bobToken),
      payload: { id }
    });
    expect(envelope(bobTest).code).toBe(403);

    const adminEdit = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/dataset/edit',
      headers: authHeaders(adminToken),
      payload: { id, name: 'admin 改名' }
    });
    expect(envelope(adminEdit).code).toBe(200);

    const bobDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/dataset/delete?ids=${id}`,
      headers: authHeaders(bobToken)
    });
    expect(envelope(bobDelete).code).toBe(403);

    const adminDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/dataset/delete?ids=${id}`,
      headers: authHeaders(adminToken)
    });
    expect(envelope(adminDelete).code).toBe(200);
  });

  it('open 接口同 IP 每秒最多 20 次', () => {
    const service = new DatasetOpenService();
    for (let index = 0; index < 20; index += 1) {
      expect(service.checkRate('127.0.0.1')).toBe(true);
    }
    expect(service.checkRate('127.0.0.1')).toBe(false);
    expect(service.checkRate('127.0.0.2')).toBe(true);
  });
});
