import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

describe('路由鉴权声明守卫', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('所有 /api 路由都声明了 auth，public 路由只有固定三个', () => {
    const apiRoutes = ctx.app.authRouteRecords.filter((route) =>
      route.url.startsWith('/api/')
    );
    const primaryRoutes = apiRoutes.filter(
      (route) => route.method !== 'HEAD' && route.method !== 'OPTIONS'
    );

    expect(primaryRoutes.length).toBeGreaterThan(0);

    const missingAuth = primaryRoutes.filter((route) => route.auth === undefined);
    expect(missingAuth).toEqual([]);

    for (const route of primaryRoutes) {
      if (route.auth !== 'public') {
        expect(Array.isArray(route.auth), `${route.method} ${route.url}`).toBe(true);
        expect((route.auth as string[]).length, `${route.method} ${route.url}`).toBeGreaterThan(0);
      }
    }

    const publicRoutes = [
      ...new Set(
        primaryRoutes
          .filter((route) => route.auth === 'public')
          .map((route) => `${route.method} ${route.url}`)
      )
    ].sort();

    expect(publicRoutes).toEqual(
      [
        'GET /api/goview/open/dataset/:id/data',
        'GET /api/goview/open/video/:streamId.flv',
        'GET /api/goview/health',
        'GET /api/goview/project/getData',
        'GET /api/goview/sys/getOssInfo',
        'POST /api/goview/sys/login'
      ].sort()
    );
  });
});
