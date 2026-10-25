// tsc 只输出 .js：把 src 下所有非 TypeScript 文件（如 gdal-formats.json）原样复制到 dist，保持相对路径
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const distDir = join(root, 'dist')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const assets = walk(srcDir).filter((file) => !file.endsWith('.ts'))
for (const file of assets) {
  const target = join(distDir, relative(srcDir, file))
  mkdirSync(dirname(target), { recursive: true })
  cpSync(file, target)
}
console.log(`copy-assets: 已复制 ${assets.length} 个非 TS 文件到 dist`)
