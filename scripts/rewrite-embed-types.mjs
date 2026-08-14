import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const typesRoot = join(root, 'dist/types')

function listDeclarationFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) files.push(...listDeclarationFiles(path))
    else if (path.endsWith('.d.ts')) files.push(path)
  }
  return files
}

function toRelativeImport(fromFile, aliasPath) {
  const target = resolve(typesRoot, aliasPath)
  let next = relative(dirname(fromFile), target).replaceAll('\\', '/')
  if (!next.startsWith('.')) next = `./${next}`
  return next
}

for (const file of listDeclarationFiles(typesRoot)) {
  const source = readFileSync(file, 'utf8')
  const rewritten = source.replace(/(["'])@\/([^"']+)\1/g, (match, quote, aliasPath) => {
    return `${quote}${toRelativeImport(file, aliasPath)}${quote}`
  })
  if (rewritten !== source) writeFileSync(file, rewritten)
}

console.log('Rewrote dist/types @/ imports to package-relative declaration imports')
