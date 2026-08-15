/**
 * Count cases in the official rstest suite (and leftover scripts).
 *
 *   node tests/count-cases.mjs
 *   node tests/count-cases.mjs --json
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const json = process.argv.includes('--json')

function listFrom(src, name) {
  const block = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\]`))
  if (!block) return []
  return [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1])
}

function countFile(rel) {
  const src = readFileSync(join(root, rel), 'utf8')
  const casesBlock = src.match(/const CASES\s*=\s*\[([\s\S]*?)\n\]/)
  if (casesBlock) {
    const n = [...casesBlock[1].matchAll(/\[\s*\d+\s*,/g)].length
    if (n) return { rel, count: n, kind: 'cases' }
  }
  const expected = src.match(/expected (\d+) cases/)
  if (expected) return { rel, count: Number(expected[1]), kind: 'cases' }
  const recNums = [...src.matchAll(/\brec\(\s*(\d+)\s*,/g)].map(m => Number(m[1]))
  if (recNums.length) return { rel, count: Math.max(...recNums), kind: 'cases' }
  const asserts = [...src.matchAll(/^\s*assert\s*\(/gm)].length
  if (asserts) return { rel, count: asserts, kind: 'asserts' }
  return { rel, count: 1, kind: 'script' }
}

function shortName(rel) {
  return rel.replace(/^scripts\//, '')
}

function sum(rows) {
  return rows.reduce((n, row) => n + row.count, 0)
}

function table(rows, countLabel) {
  const nameW = Math.max(28, ...rows.map(r => shortName(r.rel).length))
  const lines = [`${'script'.padEnd(nameW)}  ${countLabel.padStart(7)}  kind`]
  for (const row of rows) {
    lines.push(`${shortName(row.rel).padEnd(nameW)}  ${String(row.count).padStart(7)}  ${row.kind}`)
  }
  return lines.join('\n')
}

const runner = readFileSync(join(root, 'tests/all.test.ts'), 'utf8')
const unitRels = listFrom(runner, 'unitScripts')
const e2eRels = listFrom(runner, 'e2eScripts')
const official = new Set([...unitRels, ...e2eRels])

const unit = unitRels.map(countFile)
const e2e = e2eRels.map(countFile)

const leftover = []
for (const name of readdirSync(join(root, 'scripts')).toSorted()) {
  if (!/^(check|e2e)-.+\.mjs$/.test(name)) continue
  const rel = `scripts/${name}`
  if (!official.has(rel)) leftover.push(countFile(rel))
}

const report = {
  rstest: unit.length + e2e.length,
  unit: { scripts: unit.length, asserts: sum(unit), files: unit },
  e2e: { suites: e2e.length, cases: sum(e2e), files: e2e },
  leftover: leftover.length
    ? { scripts: leftover.length, cases: sum(leftover), files: leftover }
    : null,
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

console.log('Official suite (npm test / tests/all.test.ts)')
console.log(`  rstest tests   ${report.rstest}`)
console.log(`  unit scripts   ${report.unit.scripts}  (${report.unit.asserts} asserts)`)
console.log(`  e2e suites     ${report.e2e.suites}  (${report.e2e.cases} cases)`)
console.log(`  e2e cases      ${report.e2e.cases}`)
console.log('')
console.log('Unit')
console.log(table(unit, 'count'))
console.log('')
console.log('E2E')
console.log(table(e2e, 'cases'))
if (leftover.length) {
  console.log('')
  console.log(`Not in npm test (${leftover.length} scripts, ${sum(leftover)} counted)`)
  console.log(table(leftover, 'count'))
}
