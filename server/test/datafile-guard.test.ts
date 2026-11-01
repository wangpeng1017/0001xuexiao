import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('../src', import.meta.url));

describe('数据文件删除出口守卫', () => {
  it('删除数据文件记录只能走 services/datafile.ts，保证预置文件保护不被绕过', () => {
    const offenders = readdirSync(srcRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) => /dataFile\s*\.\s*delete/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(srcRoot, file).split(path.sep).join('/'));
    expect(offenders).toEqual(['services/datafile.ts']);
  });
});
