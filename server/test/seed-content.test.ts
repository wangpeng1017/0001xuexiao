import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/types.js';
import { importSeedContent } from '../src/services/seed-content.js';
import {
  authHeaders,
  createTestContext,
  loginToken,
  readJson,
  seedUser,
  type TestContext
} from './helpers.js';

const seedDir = fileURLToPath(new URL('../seed-content', import.meta.url));

interface ProjectItem {
  id: string;
  projectName: string;
  indexImage: string;
  isTemplate: boolean;
  templateCategory: string;
  remarks: string;
}

interface IdData {
  id: string;
}

describe('预置内容 F018', () => {
  let ctx: TestContext;
  let admin: AuthUser;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    const row = await seedUser(ctx.app, {
      username: 'admin',
      nickname: '管理员',
      role: 'admin'
    });
    admin = {
      id: row.id,
      username: row.username,
      nickname: row.nickname,
      role: 'admin',
      disabled: row.disabled,
      mustChangePwd: row.mustChangePwd
    };
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function importContent() {
    return importSeedContent(ctx.app.prisma, admin, {
      dataDir: ctx.app.config.dataDir,
      seedDir
    });
  }

  it('导入 20 个素材和 3 个模板，落盘且替换全部占位符，重复执行幂等', async () => {
    const first = await importContent();
    expect(first.materials).toEqual({ created: 20, skipped: 0 });
    expect(first.templates).toEqual({ created: 3, skipped: 0 });

    const materials = await ctx.app.prisma.material.findMany({ orderBy: { name: 'asc' } });
    expect(materials).toHaveLength(20);
    expect(materials.every((material) => material.scope === 'public')).toBe(true);
    expect(materials.filter((material) => material.category === 'model')).toHaveLength(4);
    expect(materials.filter((material) => material.category === 'map')).toHaveLength(4);
    expect(materials.filter((material) => material.category === 'image2d')).toHaveLength(12);

    for (const material of materials) {
      if (material.url.endsWith('/tiles/{z}/{x}/{y}.png')) {
        const tilesDir = path.join(
          ctx.app.config.dataDir,
          'files',
          'materials',
          material.id,
          'tiles'
        );
        expect(existsSync(tilesDir)).toBe(true);
        expect(readdirSync(tilesDir).length).toBeGreaterThan(0);
      } else {
        const relative = decodeURIComponent(material.url.replace(/^\/files\//, ''));
        expect(
          existsSync(path.join(ctx.app.config.dataDir, 'files', relative)),
          `素材文件未落盘：${material.name}`
        ).toBe(true);
      }
    }

    const projects = await ctx.app.prisma.project.findMany({
      where: { isTemplate: true, deletedAt: null }
    });
    expect(projects).toHaveLength(3);
    expect(new Set(projects.map((project) => project.templateCategory))).toEqual(
      new Set(['campus', 'device', 'data'])
    );

    const materialIdByUrl = new Map(materials.map((material) => [material.url, material.id]));
    for (const project of projects) {
      expect(project.content).not.toContain('{{material:');
      expect(project.content).toContain('/files/materials/');
      const coverUrl = project.indexImage ?? '';
      expect(coverUrl).toMatch(/^\/files\/templates\/[A-Za-z0-9._-]+\.png$/);
      const coverRelative = decodeURIComponent(coverUrl.replace(/^\/files\//, ''));
      expect(existsSync(path.join(ctx.app.config.dataDir, 'files', coverRelative))).toBe(true);

      const content = JSON.parse(project.content) as {
        editCanvasConfig: { backgroundImage?: string };
        componentList: Array<{
          chartConfig: { key: string };
          option: Record<string, unknown>;
          request?: { requestDataType: number; requestUrl: string };
        }>;
      };
      expect(content.componentList.length).toBeGreaterThan(0);
      expect(content.editCanvasConfig.backgroundImage).toMatch(/^\/files\/materials\//);

      if (project.projectName === '智慧校园三维总览') {
        const scene = content.componentList.find(
          (component) => component.chartConfig.key === 'Scene3D'
        );
        expect(scene).toBeTruthy();
        const option = scene!.option as {
          camera: { lon: number; lat: number };
          layerSets: Array<{
            name: string;
            layers: Array<{
              id: string;
              type: string;
              source: {
                from?: string;
                refId?: string;
                url?: string;
                imageUrl?: string;
                points?: Array<{ imageUrl: string }>;
              };
            }>;
          }>;
        };
        expect(option.camera.lon).toBeGreaterThanOrEqual(116.3);
        expect(option.camera.lon).toBeLessThanOrEqual(116.32);
        expect(option.camera.lat).toBeGreaterThanOrEqual(39.99);
        expect(option.camera.lat).toBeLessThanOrEqual(40.01);
        expect(option.layerSets.map((set) => set.name)).toEqual([
          '校园底图',
          '校园要素',
          '三维模型',
          '360 街景'
        ]);

        const layers = option.layerSets.flatMap((set) => set.layers);
        const raster = layers.find((layer) => layer.type === 'raster');
        expect(raster?.source.url).toContain('/tiles/{z}/{x}/{y}.png');
        const vectors = layers.filter((layer) => layer.type === 'vector');
        expect(vectors).toHaveLength(3);
        const models = layers.filter((layer) => layer.type === 'model');
        expect(models).toHaveLength(3);
        const panorama = layers.find((layer) => layer.type === 'panorama');
        expect(panorama?.source.points?.[0]?.imageUrl).toMatch(/^\/files\/materials\//);
        for (const layer of layers) {
          if (layer.source.from === 'material' && layer.source.url) {
            expect(materialIdByUrl.has(layer.source.url)).toBe(true);
            expect(layer.source.refId).toBe(materialIdByUrl.get(layer.source.url));
          }
        }
        expect(content.editCanvasConfig.backgroundImage).toBe(
          materials.find((material) => material.name === '科技网格大屏背景')!.url
        );
      }

      if (project.projectName === '实训设备监控') {
        const video = content.componentList.find(
          (component) => component.chartConfig.key === 'RtspVideo'
        );
        expect(video).toBeTruthy();
        expect((video!.option as { rtspUrl: string }).rtspUrl).toBe('');
      }

      if (project.projectName === '教学数据统计') {
        const dynamic = content.componentList.find(
          (component) =>
            component.request?.requestDataType === 1 && component.request?.requestUrl === ''
        );
        expect(dynamic).toBeTruthy();
        expect(project.remarks ?? '').toContain('绑定数据集后在此粘贴接口地址');
      }
    }

    const materialIds = materials.map((material) => material.id).sort();
    const projectIds = projects.map((project) => project.id).sort();
    const second = await importContent();
    expect(second.materials).toEqual({ created: 0, skipped: 20 });
    expect(second.templates).toEqual({ created: 0, skipped: 3 });
    expect(
      (await ctx.app.prisma.material.findMany({ select: { id: true } }))
        .map((material) => material.id)
        .sort()
    ).toEqual(materialIds);
    expect(
      (await ctx.app.prisma.project.findMany({ select: { id: true } }))
        .map((project) => project.id)
        .sort()
    ).toEqual(projectIds);
  });

  it('模板可通过 HTTP 接口列出并从模板新建项目', async () => {
    await importContent();
    const token = await loginToken(ctx.app, 'admin');

    const listed = readJson<ProjectItem[]>(
      await ctx.app.inject({
        method: 'GET',
        url: '/api/goview/project/templates',
        headers: authHeaders(token)
      })
    );
    expect(listed.code).toBe(200);
    expect(listed.data).toHaveLength(3);
    expect(listed.data.map((item) => item.templateCategory).sort()).toEqual([
      'campus',
      'data',
      'device'
    ]);

    const template = listed.data.find((item) => item.projectName === '智慧校园三维总览')!;
    const created = readJson<IdData>(
      await ctx.app.inject({
        method: 'POST',
        url: '/api/goview/project/createFromTemplate',
        headers: authHeaders(token),
        payload: { templateId: template.id, projectName: '我的校园大屏' }
      })
    );
    expect(created.code).toBe(200);
    const project = await ctx.app.prisma.project.findUnique({
      where: { id: created.data.id }
    });
    expect(project?.isTemplate).toBe(false);
    expect(project?.content).toContain('Scene3D');
    expect(project?.content).not.toContain('{{material:');
  });
});
