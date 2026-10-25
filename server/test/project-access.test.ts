import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/services/project.ts', import.meta.url), 'utf8');

describe('项目权限守卫', () => {
  it('services/project.ts 不允许直接比较 ownerId 或 role === admin', () => {
    expect(source).not.toMatch(/ownerId\s*===|===\s*[^\n;]*ownerId/);
    expect(source).not.toMatch(/role\s*===?\s*['"]admin['"]/);
    expect(source).not.toMatch(/role\s*!==?\s*['"]admin['"]/);
  });

  it('项目权限统一来自 project-access 模块', () => {
    expect(source).toContain("from './project-access.js'");
    for (const name of [
      'canReadProject',
      'canWriteProject',
      'canDeleteProject',
      'projectListWhere'
    ]) {
      expect(source).toContain(name);
    }
    expect(source).not.toContain('canManage');
  });
});
