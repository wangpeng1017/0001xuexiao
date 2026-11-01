import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
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

/** 复制一份可改动的种子目录：两百兆的预置点云不复制，用目录链接指回原目录 */
function copySeed(target: string): void {
  const datafiles = path.join(seedDir, 'datafiles');
  cpSync(seedDir, target, { recursive: true, filter: (source) => source !== datafiles });
  symlinkSync(datafiles, path.join(target, 'datafiles'), 'junction');
}

/** 先断开目录链接再删临时目录，保证不会误删原种子目录里的点云 */
function removeSeedCopy(workDir: string, target: string): void {
  unlinkSync(path.join(target, 'datafiles'));
  rmSync(workDir, { recursive: true, force: true });
}

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

// 每个用例都会把预置点云（约 200 MB）导入临时数据目录，放宽超时
describe('预置内容 F018', { timeout: 90_000 }, () => {
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

  it('导入 30 个素材、1 个预置数据文件和 6 个模板，落盘且替换全部占位符，重复执行幂等', async () => {
    const first = await importContent();
    expect(first.materials).toEqual({ created: 30, updated: 0, skipped: 0 });
    expect(first.datafiles).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(first.templates).toEqual({ created: 6, updated: 0, skipped: 0 });

    const datafiles = await ctx.app.prisma.dataFile.findMany();
    expect(datafiles).toHaveLength(1);
    const ship = datafiles[0]!;
    expect(ship).toMatchObject({ name: '船舶点云', kind: 'tiles3d', status: 'success', ownerId: admin.id });
    expect(ship.outputUrl).toBe(`/files/datafiles/${ship.id}/3dtiles/tileset.json`);
    expect(
      existsSync(path.join(ctx.app.config.dataDir, 'files', 'datafiles', ship.id, '3dtiles', 'tileset.json'))
    ).toBe(true);

    const materials = await ctx.app.prisma.material.findMany({ orderBy: { name: 'asc' } });
    expect(materials).toHaveLength(30);
    expect(materials.every((material) => material.scope === 'public')).toBe(true);
    expect(materials.filter((material) => material.category === 'model')).toHaveLength(14);
    expect(materials.filter((material) => material.category === 'map')).toHaveLength(4);
    expect(materials.filter((material) => material.category === 'image2d')).toHaveLength(12);

    for (const material of materials.filter((item) => item.category === 'model')) {
      expect(material.thumb, `模型缺少预览图：${material.name}`).toMatch(
        /^\/files\/materials\/[^/]+\/thumb\.png$/
      );
      const thumbRelative = decodeURIComponent(material.thumb.replace(/^\/files\//, ''));
      expect(
        existsSync(path.join(ctx.app.config.dataDir, 'files', thumbRelative)),
        `预览图未落盘：${material.name}`
      ).toBe(true);
    }

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
    expect(projects).toHaveLength(6);
    expect(new Set(projects.map((project) => project.templateCategory))).toEqual(
      new Set(['campus', 'device', 'data', 'other'])
    );

    const materialIdByUrl = new Map(materials.map((material) => [material.url, material.id]));
    for (const project of projects) {
      expect(project.content).not.toContain('{{material:');
      expect(project.content).not.toContain('{{datafile:');
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

      if (project.projectName === '船舶点云数字孪生') {
        const scene = content.componentList.find((component) => component.chartConfig.key === 'Scene3D');
        const layers = (
          scene!.option as { layerSets: Array<{ layers: Array<{ source: { from?: string; refId?: string; url?: string } }> }> }
        ).layerSets.flatMap((set) => set.layers);
        const cloud = layers.find((layer) => layer.source.from === 'datafile');
        expect(cloud?.source.url).toBe(ship.outputUrl);
        expect(cloud?.source.refId).toBe(ship.id);
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
        expect(project.remarks ?? '').toContain('绑定第三方数据后在此粘贴接口地址');
      }
    }

    const materialIds = materials.map((material) => material.id).sort();
    const projectIds = projects.map((project) => project.id).sort();
    const second = await importContent();
    expect(second.materials).toEqual({ created: 0, updated: 0, skipped: 30 });
    expect(second.datafiles).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(second.templates).toEqual({ created: 0, updated: 0, skipped: 6 });
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

  it('种子内容变化后再次导入会原位更新，id 与地址不变，未变化的继续跳过', async () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'seed-update-'));
    const changedSeed = path.join(workDir, 'seed-content');
    try {
      copySeed(changedSeed);
      const options = { dataDir: ctx.app.config.dataDir, seedDir: changedSeed };
      await importSeedContent(ctx.app.prisma, admin, options);
      const before = await ctx.app.prisma.material.findMany({ orderBy: { name: 'asc' } });
      const beforeIds = await ctx.app.prisma.project.findMany({
        where: { isTemplate: true },
        select: { id: true }
      });

      const templatePath = path.join(changedSeed, 'templates', 'campus-3d.json');
      const template = JSON.parse(readFileSync(templatePath, 'utf8')) as {
        content: { editCanvasConfig: { remarks: string } };
      };
      template.content.editCanvasConfig.remarks = '已更新的备注';
      writeFileSync(templatePath, JSON.stringify(template));
      writeFileSync(path.join(changedSeed, 'maps', 'campus-roads.geojson'), '{"type":"FeatureCollection","features":[]}');

      const result = await importSeedContent(ctx.app.prisma, admin, options);
      expect(result.materials).toEqual({ created: 0, updated: 1, skipped: 29 });
      expect(result.templates).toEqual({ created: 0, updated: 1, skipped: 5 });

      const after = await ctx.app.prisma.material.findMany({ orderBy: { name: 'asc' } });
      expect(after.map((m) => [m.id, m.url])).toEqual(before.map((m) => [m.id, m.url]));
      const roads = after.find((material) => material.url.endsWith('data.geojson') && material.name.includes('道路'));
      expect(roads).toBeTruthy();
      const stored = readFileSync(
        path.join(ctx.app.config.dataDir, 'files', 'materials', roads!.id, 'data.geojson'),
        'utf8'
      );
      expect(stored).toContain('"features":[]');

      const templates = await ctx.app.prisma.project.findMany({
        where: { isTemplate: true },
        select: { id: true, projectName: true, remarks: true }
      });
      expect(templates.map((item) => item.id).sort()).toEqual(beforeIds.map((item) => item.id).sort());
      expect(templates.find((item) => item.projectName === '智慧校园三维总览')?.remarks).toBe('已更新的备注');
    } finally {
      removeSeedCopy(workDir, changedSeed);
    }
  });

  it('改动预览图后重新导入会原位更新，id 与预览图地址不变', async () => {
    const workDir = mkdtempSync(path.join(tmpdir(), 'seed-thumb-'));
    const changedSeed = path.join(workDir, 'seed-content');
    try {
      copySeed(changedSeed);
      const options = { dataDir: ctx.app.config.dataDir, seedDir: changedSeed };
      await importSeedContent(ctx.app.prisma, admin, options);
      const before = await ctx.app.prisma.material.findMany({ orderBy: { name: 'asc' } });

      const previewPath = path.join(changedSeed, 'previews', 'tree.png');
      const original = readFileSync(previewPath);
      const changed = Buffer.concat([original, Buffer.from('changed')]);
      writeFileSync(previewPath, changed);

      const result = await importSeedContent(ctx.app.prisma, admin, options);
      expect(result.materials).toEqual({ created: 0, updated: 1, skipped: 29 });

      const after = await ctx.app.prisma.material.findMany({ orderBy: { name: 'asc' } });
      expect(after.map((m) => [m.id, m.url, m.thumb])).toEqual(
        before.map((m) => [m.id, m.url, m.thumb])
      );
      const tree = after.find((material) => material.name === '景观树模型')!;
      const stored = readFileSync(
        path.join(ctx.app.config.dataDir, 'files', 'materials', tree.id, 'thumb.png')
      );
      expect(stored.equals(changed)).toBe(true);
    } finally {
      removeSeedCopy(workDir, changedSeed);
    }
  });

  it('预置点云不能删除（admin 也不行，批量中含预置时整批不删），旧记录重新导入后补上标记', async () => {
    await importContent();
    const token = await loginToken(ctx.app, 'admin');
    const ship = await ctx.app.prisma.dataFile.findFirstOrThrow({ where: { name: '船舶点云' } });
    expect(ship.preset).toBe(true);
    const tileset = path.join(ctx.app.config.dataDir, 'files', 'datafiles', ship.id, '3dtiles', 'tileset.json');
    const ordinary = await ctx.app.prisma.dataFile.create({
      data: { name: '普通文件', originFormat: 'ZIP', storedPath: 'x', ownerId: admin.id }
    });
    const remove = async (ids: string) =>
      readJson<unknown>(
        await ctx.app.inject({
          method: 'DELETE',
          url: `/api/goview/datafile/delete?ids=${ids}`,
          headers: authHeaders(token)
        })
      );

    expect((await remove(ship.id)).code).toBe(403);
    expect((await remove(`${ordinary.id},${ship.id}`)).code).toBe(403);
    expect(await ctx.app.prisma.dataFile.count()).toBe(2);
    expect(existsSync(tileset)).toBe(true);

    const listed = readJson<Array<{ id: string; preset: boolean }>>(
      await ctx.app.inject({
        method: 'GET',
        url: '/api/goview/datafile/list?page=1&limit=20',
        headers: authHeaders(token)
      })
    );
    expect(listed.data.find((item) => item.id === ship.id)?.preset).toBe(true);
    expect(listed.data.find((item) => item.id === ordinary.id)?.preset).toBe(false);
    expect((await remove(ordinary.id)).code).toBe(200);

    await ctx.app.prisma.dataFile.update({ where: { id: ship.id }, data: { preset: false } });
    const again = await importContent();
    expect(again.datafiles).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect((await ctx.app.prisma.dataFile.findUniqueOrThrow({ where: { id: ship.id } })).preset).toBe(true);
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
    expect(listed.data).toHaveLength(6);
    expect(listed.data.map((item) => item.templateCategory).sort()).toEqual([
      'campus',
      'data',
      'data',
      'device',
      'device',
      'other'
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
