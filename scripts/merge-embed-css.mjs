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

function listCssFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listCssFiles(full)
    if (entry.isFile() && entry.name.endsWith('.css') && full !== entryPath) return [full]
    return []
  }).sort()
}

const vendorCssFiles = listCssFiles(embedDir)

if (vendorCssFiles.length === 0) {
  console.log('No initial embed CSS chunks to merge')
  process.exit(0)
}

const merged = [
  ...vendorCssFiles.map((filePath) => readFileSync(filePath, 'utf8')),
  readFileSync(entryPath, 'utf8'),
].join('\n')

writeFileSync(entryPath, merged)
for (const filePath of vendorCssFiles) {
  rmSync(filePath)
}

console.log(`Merged ${vendorCssFiles.length} embed CSS chunks into ${entryName}`)
