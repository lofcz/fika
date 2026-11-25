import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist/embed')
const FORBIDDEN_RE = /^_(?:e2e|bench)/

if (!existsSync(out)) {
  console.error('dist/embed missing — run rsbuild build --config rsbuild.config.embed.ts first')
  process.exit(1)
}

function pruneForbidden(dir) {
  let removed = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (FORBIDDEN_RE.test(entry.name)) {
      rmSync(full, { recursive: true, force: true })
      removed++
    }
    else if (entry.isDirectory()) {
      removed += pruneForbidden(full)
    }
  }
  return removed
}

for (const dir of ['mocks', 'imgs', 'fonts']) {
  const src = join(root, 'public', dir)
  const dest = join(out, dir)
  if (!existsSync(src)) continue
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, {
    recursive: true,
    filter: item => !FORBIDDEN_RE.test(basename(item)),
  })
}

const pruned = pruneForbidden(out)
console.log(
  pruned > 0
    ? `Copied public/{mocks,imgs,fonts} → dist/embed/ (pruned ${pruned} _e2e/_bench fixture(s))`
    : 'Copied public/mocks and public/imgs → dist/embed/',
)
