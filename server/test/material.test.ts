import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MaterialItem } from '../src/services/material.js';
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
import { rawZip, zipOf } from './zip.js';

interface UploadResult {
  id: string;
  category: string;
  name: string;
  url: string;
  thumb: string;
  scope: string;
  createUserName: string;
  createTime: string;
}

describe('素材库 F016', () => {
  let ctx: TestContext;
  let adminToken: string;
  let studentToken: string;
  let otherToken: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    await seedUser(ctx.app, { username: 'admin', nickname: '管理员', role: 'admin' });
    await seedUser(ctx.app, { username: 'student_a', nickname: '学生 A', role: 'student' });
    await seedUser(ctx.app, { username: 'student_b', nickname: '学生 B', role: 'student' });
    adminToken = await loginToken(ctx.app, 'admin');
    studentToken = await loginToken(ctx.app, 'student_a');
    otherToken = await loginToken(ctx.app, 'student_b');
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function upload(
    token: string,
    category: string,
    name: string,
    scope: string,
    filename: string,
    content: Buffer
  ) {
    const body = multipartBody([
      { name: 'category', value: category },
      { name: 'name', value: name },
      { name: 'scope', value: scope },
      { name: 'file', filename, contentType: 'application/octet-stream', content }
    ]);
    return readJson<UploadResult>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/material/upload',
        headers: { ...authHeaders(token), ...body.headers },
        payload: body.payload
      })
    );
  }

  async function thumb(token: string, id: string, filename = 'thumb.png') {
    const body = multipartBody([
      { name: 'file', filename, contentType: 'image/png', content: TINY_PNG }
    ]);
    return readJson<{ thumb: string }>(
      await ctx.app.inject({
        method: 'POST',
        url: `/api/goview/material/thumb?id=${id}`,
        headers: { ...authHeaders(token), ...body.headers },
        payload: body.payload
      })
    );
  }

  async function list(token: string, query = '') {
    return readJson<MaterialItem[]>(
      await ctx.app.inject({
        method: 'GET',
        url: `/api/goview/material/list?page=1&limit=50${query}`,
        headers: authHeaders(token)
      })
    );
  }

  it('上传模型、地图、二维素材并生成缩略图', async () => {
    const glb = await upload(
      adminToken,
      'model',
      '教学楼模型',
      'public',
      'building.glb',
      Buffer.from('glTF-binary')
    );
    expect(glb.code).toBe(200);
    expect(glb.data.url).toBe(`/files/materials/${glb.data.id}/model.glb`);
    expect(
      existsSync(path.join(ctx.dir, 'data', 'files', 'materials', glb.data.id, 'model.glb'))
    ).toBe(true);

    const gltfZip = await upload(
      adminToken,
      'model',
      '实验楼模型',
      'public',
      'lab.zip',
      zipOf({ 'scene.gltf': '{"asset":{"version":"2.0"}}', 'scene.bin': 'bin' })
    );
    expect(gltfZip.code).toBe(200);
    expect(gltfZip.data.url).toBe(`/files/materials/${gltfZip.data.id}/scene.gltf`);

    const geojson = await upload(
      adminToken,
      'map',
      '校园边界',
      'public',
      'campus.geojson',
      Buffer.from('{"type":"FeatureCollection","features":[]}')
    );
    expect(geojson.code).toBe(200);
    expect(geojson.data.url).toBe(`/files/materials/${geojson.data.id}/data.geojson`);

    const tiles = await upload(
      adminToken,
      'map',
      '校园瓦片',
      'public',
      'tiles.zip',
      zipOf({ '0/0/0.png': TINY_PNG })
    );
    expect(tiles.code).toBe(200);
    expect(tiles.data.url).toBe(
      `/files/materials/${tiles.data.id}/tiles/{z}/{x}/{y}.png`
    );
    expect(
      existsSync(
        path.join(ctx.dir, 'data', 'files', 'materials', tiles.data.id, 'tiles', '0', '0', '0.png')
      )
    ).toBe(true);

    const image = await upload(
      adminToken,
      'image2d',
      '校园底图',
      'public',
      '校园底图.png',
      TINY_PNG
    );
    expect(image.code).toBe(200);
    expect(image.data.url).toBe(
      `/files/materials/${image.data.id}/${encodeURIComponent('校园底图.png')}`
    );
    expect(image.data.thumb).toBe(image.data.url);

    const thumbResponse = await thumb(adminToken, glb.data.id);
    expect(thumbResponse.code).toBe(200);
    expect(thumbResponse.data.thumb).toBe(`/files/materials/${glb.data.id}/thumb.png`);
    expect(
      existsSync(path.join(ctx.dir, 'data', 'files', 'materials', glb.data.id, 'thumb.png'))
    ).toBe(true);

    const all = await list(adminToken);
    expect(all.count).toBe(5);
    expect(all.data.map((item) => item.category).sort()).toEqual([
      'image2d',
      'map',
      'map',
      'model',
      'model'
    ]);
    expect(all.data.find((item) => item.id === glb.data.id)?.thumb).toBe(
      thumbResponse.data.thumb
    );

    const models = await list(adminToken, '&category=model');
    expect(models.count).toBe(2);

    const keyword = await list(adminToken, `&keyword=${encodeURIComponent('校园边')}`);
    expect(keyword.count).toBe(1);
    expect(keyword.data[0]?.name).toBe('校园边界');
  });

  it('拒绝非法扩展名、错误瓦片结构和 zip slip', async () => {
    const badModel = await upload(
      adminToken,
      'model',
      '非法模型',
      'public',
      'model.obj',
      Buffer.from('obj')
    );
    expect(badModel.code).toBe(400);

    const rawGltf = await upload(
      adminToken,
      'model',
      '未打包 gltf',
      'public',
      'model.gltf',
      Buffer.from('{}')
    );
    expect(rawGltf.code).toBe(400);

    const badImage = await upload(
      adminToken,
      'image2d',
      '非法图片',
      'public',
      'note.txt',
      Buffer.from('hello')
    );
    expect(badImage.code).toBe(400);

    const badTiles = await upload(
      adminToken,
      'map',
      '错误瓦片',
      'public',
      'tiles.zip',
      zipOf({ 'tile.png': TINY_PNG })
    );
    expect(badTiles.code).toBe(400);

    const slip = await upload(
      adminToken,
      'model',
      'zip slip',
      'public',
      'evil.zip',
      rawZip([{ name: '../evil.txt', data: Buffer.from('pwned') }])
    );
    expect(slip.code).toBe(400);
    expect(existsSync(path.join(ctx.dir, 'data', 'files', 'evil.txt'))).toBe(false);

    const slipTiles = await upload(
      adminToken,
      'map',
      'zip slip tiles',
      'public',
      'evil-tiles.zip',
      rawZip([{ name: '0/0/../../evil.png', data: TINY_PNG }])
    );
    expect(slipTiles.code).toBe(400);
  });

  it('公共素材与私有素材的可见性、上传与删除权限', async () => {
    const publicMaterial = await upload(
      adminToken,
      'image2d',
      '公共底图',
      'public',
      'public.png',
      TINY_PNG
    );
    expect(publicMaterial.code).toBe(200);

    const privateA = await upload(
      studentToken,
      'image2d',
      'A 的私有图',
      'private',
      'private.png',
      TINY_PNG
    );
    expect(privateA.code).toBe(200);

    const privateB = await upload(
      otherToken,
      'image2d',
      'B 的私有图',
      'private',
      'private-b.png',
      TINY_PNG
    );
    expect(privateB.code).toBe(200);

    const forbiddenPublic = await upload(
      studentToken,
      'image2d',
      '学生公共图',
      'public',
      'forbidden.png',
      TINY_PNG
    );
    expect(forbiddenPublic.code).toBe(403);

    const listB = await list(otherToken);
    const idsB = listB.data.map((item) => item.id);
    expect(idsB).toContain(publicMaterial.data.id);
    expect(idsB).toContain(privateB.data.id);
    expect(idsB).not.toContain(privateA.data.id);

    const publicOnly = await list(otherToken, '&scope=public');
    expect(publicOnly.data.map((item) => item.id)).toEqual([publicMaterial.data.id]);

    const deleteByB = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/material/delete?ids=${privateA.data.id}`,
      headers: authHeaders(otherToken)
    });
    expect(readJson<unknown>(deleteByB).code).toBe(403);

    const thumbByB = await thumb(otherToken, privateA.data.id);
    expect(thumbByB.code).toBe(403);

    const thumbByOwner = await thumb(studentToken, privateA.data.id);
    expect(thumbByOwner.code).toBe(200);

    const deleteByAdmin = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/goview/material/delete?ids=${privateA.data.id}`,
      headers: authHeaders(adminToken)
    });
    expect(readJson<unknown>(deleteByAdmin).code).toBe(200);
    expect(
      existsSync(path.join(ctx.dir, 'data', 'files', 'materials', privateA.data.id))
    ).toBe(false);

    const anonymous = await ctx.app.inject({
      method: 'GET',
      url: '/api/goview/material/list'
    });
    expect(readJson<unknown>(anonymous).code).toBe(886);
  });
});
