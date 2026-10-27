import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CHUNK_SIZE, cleanupExpiredUploads, uploadDirectory } from '../src/lib/chunk-upload.js';
import { authHeaders, createTestContext, loginToken, seedUser, type TestContext } from './helpers.js';
import {
  envelope,
  getDataFile,
  uploadBuffer,
  waitForDataFile
} from './datafile-helpers.js';
import { createZip } from './zip-fixture.js';

describe('数据文件上传与转换', () => {
  let ctx: TestContext;
  let adminToken: string;
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await ctx.app.prisma.dataFile.deleteMany();
    await ctx.app.prisma.uploadSession.deleteMany();
  });

  it('支持格式清单 >=200，且包含 LAS 与栅格/矢量分组', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/datafile/formats',
      headers: authHeaders(aliceToken)
    });
    const body = envelope<{
      total: number;
      groups: Array<{ name: string; items: Array<{ code: string; name: string }> }>;
    }>(response);
    expect(body.code).toBe(200);
    expect(body.data.total).toBeGreaterThanOrEqual(200);
    const names = body.data.groups.map((group) => group.name);
    expect(names).toEqual(['栅格', '矢量', '三维/点云']);
    const extra = body.data.groups.find((group) => group.name === '三维/点云')!;
    expect(extra.items.map((item) => item.code)).toEqual(
      expect.arrayContaining(['LAS', 'LAZ', 'glTF', 'GLB', '3D Tiles'])
    );
  });

  it('分片上传 zip tileset 后转换成功，支持断点续传与权限隔离', async () => {
    const zip = await createZip([
      { name: 'tileset.json', content: '{"asset":{"version":"1.0"}}' },
      { name: 'tiles/0/0/0.b3dm', content: Buffer.from([1, 2, 3]) }
    ]);
    const uploaded = await uploadBuffer(ctx.app, aliceToken, 'scene.zip', zip);
    const detail = await waitForDataFile(
      ctx.app,
      aliceToken,
      uploaded.fileId,
      (file) => file.status === 'success' || file.status === 'failed'
    );
    expect(detail.status).toBe('success');
    expect(detail.kind).toBe('tiles3d');
    expect(detail.originFormat).toBe('ZIP');
    expect(detail.outputUrl).toBe(`/files/datafiles/${uploaded.fileId}/3dtiles/tileset.json`);
    expect(
      existsSync(path.join(ctx.dir, 'data', 'files', 'datafiles', uploaded.fileId, '3dtiles', 'tileset.json'))
    ).toBe(true);

    const aliceList = envelope<Array<{ id: string }>>(
      await ctx.app.inject({
        method: 'GET',
        url: '/api/goview/datafile/list?page=1&limit=10',
        headers: authHeaders(aliceToken)
      })
    );
    expect(aliceList.data.map((item) => item.id)).toContain(uploaded.fileId);

    const bobList = envelope<Array<{ id: string }>>(
      await ctx.app.inject({
        method: 'GET',
        url: '/api/goview/datafile/list?page=1&limit=10',
        headers: authHeaders(bobToken)
      })
    );
    expect(bobList.data.map((item) => item.id)).not.toContain(uploaded.fileId);

    const adminList = envelope<Array<{ id: string }>>(
      await ctx.app.inject({
        method: 'GET',
        url: '/api/goview/datafile/list?page=1&limit=10',
        headers: authHeaders(adminToken)
      })
    );
    expect(adminList.data.map((item) => item.id)).toContain(uploaded.fileId);

    const bobDetail = await ctx.app.inject({
      method: 'GET',
      url: `/api/goview/datafile/detail?id=${uploaded.fileId}`,
      headers: authHeaders(bobToken)
    });
    expect(envelope(bobDetail).code).toBe(403);

    const bobDelete = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/datafile/delete?ids=${uploaded.fileId}`,
      headers: authHeaders(bobToken)
    });
    expect(envelope(bobDelete).code).toBe(403);

    const deleteResponse = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/datafile/delete?ids=${uploaded.fileId}`,
      headers: authHeaders(aliceToken)
    });
    expect(envelope(deleteResponse).code).toBe(200);
    expect(existsSync(path.join(ctx.dir, 'data', 'files', 'datafiles', uploaded.fileId))).toBe(false);
  });

  it('同一用户同名同大小的未完成上传复用 uploadId 并返回已上传分片', async () => {
    const fileName = 'resume.bin';
    const size = CHUNK_SIZE + 100;
    const first = envelope<{ uploadId: string; chunkSize: number; uploadedChunks: number[] }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/datafile/upload/init',
        headers: authHeaders(aliceToken),
        payload: { fileName, size }
      })
    );
    expect(first.data.chunkSize).toBe(CHUNK_SIZE);
    const uploadId = first.data.uploadId;

    const chunk = Buffer.alloc(CHUNK_SIZE, 7);
    const chunkResponse = await ctx.app.inject({
      method: 'PUT',
      url: `/api/goview/datafile/upload/chunk?uploadId=${uploadId}&index=0`,
      headers: { ...authHeaders(aliceToken), 'content-type': 'application/octet-stream' },
      payload: chunk
    });
    expect(envelope(chunkResponse).code).toBe(200);

    const second = envelope<{ uploadId: string; uploadedChunks: number[] }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/datafile/upload/init',
        headers: authHeaders(aliceToken),
        payload: { fileName, size }
      })
    );
    expect(second.data.uploadId).toBe(uploadId);
    expect(second.data.uploadedChunks).toEqual([0]);
  });

  it('缺少分片时 complete 返回 400', async () => {
    const buffer = Buffer.from('hello');
    const init = envelope<{ uploadId: string }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/datafile/upload/init',
        headers: authHeaders(aliceToken),
        payload: { fileName: 'missing.txt', size: buffer.length }
      })
    );
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/datafile/upload/complete',
      headers: authHeaders(aliceToken),
      payload: { uploadId: init.data.uploadId }
    });
    const body = envelope(response);
    expect(body.code).toBe(400);
    expect(body.msg).toContain('分片不完整');
  });

  it('不支持的文件转换失败，可重试，LAS 无坐标系提示指定坐标系', async () => {
    const unknown = await uploadBuffer(ctx.app, aliceToken, 'unknown.foo', Buffer.from('foo'));
    const failed = await waitForDataFile(
      ctx.app,
      aliceToken,
      unknown.fileId,
      (file) => file.status === 'failed'
    );
    expect(failed.errorMsg).toContain('不支持的格式');

    const retry = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/datafile/retry',
      headers: authHeaders(aliceToken),
      payload: { id: unknown.fileId }
    });
    expect(envelope(retry).code).toBe(200);
    await waitForDataFile(ctx.app, aliceToken, unknown.fileId, (file) => file.status === 'failed');

    const las = await uploadBuffer(ctx.app, aliceToken, 'sample.las', Buffer.from('not a las'));
    const lasFailed = await waitForDataFile(
      ctx.app,
      aliceToken,
      las.fileId,
      (file) => file.status === 'failed'
    );
    expect(lasFailed.originFormat).toBe('LAS');
    expect(lasFailed.errorMsg).toContain('请指定坐标系');
  });

  it('局部坐标锚点超出范围时 complete 返回 400', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/datafile/upload/complete',
      headers: authHeaders(aliceToken),
      payload: { uploadId: 'missing', srs: 'LOCAL', anchor: { lon: 200, lat: 40, height: 0 } }
    });
    const body = envelope<unknown>(response);
    expect(body.code).toBe(400);
    expect(body.msg).toContain('经度');
  });

  it('超过 24 小时的未完成上传会被清理', async () => {
    const init = envelope<{ uploadId: string }>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/datafile/upload/init',
        headers: authHeaders(aliceToken),
        payload: { fileName: 'expired.zip', size: 100 }
      })
    );
    const uploadId = init.data.uploadId;
    const dir = uploadDirectory(path.join(ctx.dir, 'data'), uploadId);
    await mkdir(dir, { recursive: true });
    const chunk = Buffer.alloc(100, 1);
    await writeFile(path.join(dir, '0.part'), chunk);
    await ctx.app.prisma.uploadSession.update({
      where: { id: uploadId },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }
    });

    const removed = await cleanupExpiredUploads(ctx.app.prisma, path.join(ctx.dir, 'data'));
    expect(removed).toBe(1);
    expect(await ctx.app.prisma.uploadSession.findUnique({ where: { id: uploadId } })).toBeNull();
    expect(existsSync(dir)).toBe(false);
  });

  it('上传后源文件落盘且大小正确', async () => {
    const buffer = Buffer.from('abcdef');
    const { fileId } = await uploadBuffer(ctx.app, aliceToken, 'source.xyz', buffer);
    const record = await ctx.app.prisma.dataFile.findUniqueOrThrow({ where: { id: fileId } });
    const info = await stat(record.storedPath);
    expect(info.size).toBe(buffer.length);
    const detail = await getDataFile(ctx.app, aliceToken, fileId);
    expect(detail.name).toBe('source.xyz');
  });
});
