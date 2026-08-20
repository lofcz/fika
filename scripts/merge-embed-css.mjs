import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const embedDir = join(root, 'dist/embed')
const entryName = 'fika-embed.css'
const entryPath = join(embedDir, entryName)

if (!existsSync(entryPath)) {
  console.error('dist/embed/fika-embed.css missing — run rsbuild build --config rsbuild.config.embed.ts first')
  process.exit(1)
}

const vendorCssFiles = readdirSync(embedDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.css') && entry.name !== entryName)
  .map(entry => entry.name)
  .sort()

if (vendorCssFiles.length === 0) {
  console.log('No initial embed CSS chunks to merge')
  process.exit(0)
}

const merged = [
  ...vendorCssFiles.map(fileName => readFileSync(join(embedDir, fileName), 'utf8')),
  readFileSync(entryPath, 'utf8'),
].join('\n')

writeFileSync(entryPath, merged)
for (const fileName of vendorCssFiles) {
  rmSync(join(embedDir, fileName))
}

console.log(`Merged ${vendorCssFiles.length} initial embed CSS chunks into ${entryName}: ${vendorCssFiles.join(', ')}`)
