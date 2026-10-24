import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authHeaders,
  createTestContext,
  loginToken,
  multipartBody,
  readJson,
  seedUser,
  TINY_PNG,
  type TestContext
} from './helpers.js';

interface UploadResult {
  fileName: string;
  fileurl: string;
}

describe('项目图片上传', () => {
  let ctx: TestContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    await seedUser(ctx.app, { username: 'teacher01', role: 'teacher' });
    token = await loginToken(ctx.app, 'teacher01');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('图片上传成功，可通过 /files 匿名访问', async () => {
    const upload = multipartBody([
      {
        name: 'object',
        filename: 'pixel.png',
        contentType: 'image/png',
        content: TINY_PNG
      }
    ]);

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/upload',
      headers: { ...authHeaders(token), ...upload.headers },
      payload: upload.payload
    });
    const body = readJson<UploadResult>(response);
    expect(body.code).toBe(200);
    expect(body.data.fileName).toBe('pixel.png');
    expect(body.data.fileurl).toMatch(
      /^\/files\/uploads\/\d{6}\/[0-9a-f-]+\.png$/
    );

    const fileResponse = await ctx.app.inject({
      method: 'GET',
      url: body.data.fileurl
    });
    expect(fileResponse.statusCode).toBe(200);
    expect(fileResponse.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(fileResponse.rawPayload, TINY_PNG)).toBe(0);
  });

  it('exe 与 MIME 不匹配的文件被拒绝', async () => {
    const exeUpload = multipartBody([
      {
        name: 'object',
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
        content: Buffer.from('MZ-not-an-image')
      }
    ]);
    const exeResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/upload',
      headers: { ...authHeaders(token), ...exeUpload.headers },
      payload: exeUpload.payload
    });
    const exeBody = readJson<unknown>(exeResponse);
    expect(exeBody.code).toBe(400);
    expect(exeBody.msg).toContain('只允许上传图片');

    const mismatchUpload = multipartBody([
      {
        name: 'object',
        filename: 'fake.png',
        contentType: 'application/octet-stream',
        content: TINY_PNG
      }
    ]);
    const mismatchResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/upload',
      headers: { ...authHeaders(token), ...mismatchUpload.headers },
      payload: mismatchUpload.payload
    });
    const mismatchBody = readJson<unknown>(mismatchResponse);
    expect(mismatchBody.code).toBe(400);
    expect(mismatchBody.msg).toContain('MIME');
  });

  it('未登录上传返回 886，字段名错误返回 400', async () => {
    const upload = multipartBody([
      {
        name: 'object',
        filename: 'pixel.png',
        contentType: 'image/png',
        content: TINY_PNG
      }
    ]);

    const anonymousResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/upload',
      headers: upload.headers,
      payload: upload.payload
    });
    expect(readJson<unknown>(anonymousResponse).code).toBe(886);

    const wrongField = multipartBody([
      {
        name: 'file',
        filename: 'pixel.png',
        contentType: 'image/png',
        content: TINY_PNG
      }
    ]);
    const wrongFieldResponse = await ctx.app.inject({
      method: 'POST',
      url: '/api/goview/project/upload',
      headers: { ...authHeaders(token), ...wrongField.headers },
      payload: wrongField.payload
    });
    const wrongFieldBody = readJson<unknown>(wrongFieldResponse);
    expect(wrongFieldBody.code).toBe(400);
    expect(wrongFieldBody.msg).toContain('object');
  });
});
