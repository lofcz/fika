import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist/embed')

if (!existsSync(out)) {
  console.error('dist/embed missing — run rsbuild build --config rsbuild.config.embed.ts first')
  process.exit(1)
}

for (const dir of ['mocks', 'imgs', 'fonts']) {
  const src = join(root, 'public', dir)
  const dest = join(out, dir)
  if (!existsSync(src)) continue
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
}

console.log('Copied public/mocks and public/imgs → dist/embed/')
