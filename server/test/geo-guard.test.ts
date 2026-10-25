import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('../src', import.meta.url));

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...collectFiles(full));
    else if (entry.name.endsWith('.ts')) result.push(full);
  }
  return result;
}

describe('外部命令边界守卫', () => {
  it('除 lib/geo-tools.ts 外，src 下不允许出现 child_process', () => {
    const offenders = collectFiles(srcRoot)
      .filter((file) => readFileSync(file, 'utf8').includes('child_process'))
      .map((file) => path.relative(srcRoot, file).replace(/\\/g, '/'));

    expect(offenders).toEqual(['lib/geo-tools.ts']);
  });
});
