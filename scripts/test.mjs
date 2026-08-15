/**
 * Unified test entry:
 *   npm test                         full rstest suite
 *   npm test -- guidelines           one fixture (name or alias)
 *   npm test -- live-paint live-size several fixtures
 *   npm test -- --list               print fixture names
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listFixtureNames, matchFixtures } from './test-fixtures.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rstestBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'rstest.cmd' : 'rstest')

const raw = process.argv.slice(2)
const flags = new Set(raw.filter(arg => arg.startsWith('-')))
const queries = raw.filter(arg => !arg.startsWith('-'))

const run = (command, args = []) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32' && /\.cmd$/i.test(command),
    env: { ...process.env, CI: process.env.CI || '1' },
    windowsHide: true,
  })
  child.on('error', reject)
  child.on('exit', code => {
    if (code === 0) resolve()
    else reject(new Error(`${[command, ...args].join(' ')} exited ${code}`))
  })
})

if (flags.has('--list') || flags.has('-l')) {
  const rows = listFixtureNames()
  const width = Math.max(...rows.map(row => row.name.length))
  for (const row of rows) {
    console.log(`${row.name.padEnd(width + 2)}${row.kind.padEnd(8)}${row.file}`)
  }
  process.exit(0)
}

if (flags.has('--help') || flags.has('-h')) {
  console.log(`Usage:
  npm test                         run the full suite
  npm test -- <fixture> [more]     run named fixtures
  npm test -- --list               list fixture names

Examples:
  npm test -- guidelines
  npm test -- live-size live-paint
  npm test -- resize-elements:e2e
`)
  process.exit(0)
}

if (!queries.length) {
  await run(rstestBin)
  process.exit(0)
}

const { scripts, rstest, unknown } = matchFixtures(queries)
if (unknown.length) {
  const available = listFixtureNames().map(row => row.name).join(', ')
  console.error(`unknown fixture${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`)
  console.error(`available: ${available}`)
  process.exit(1)
}

if (!scripts.length && !rstest.length) {
  console.error(`no fixtures matched: ${queries.join(', ')}`)
  process.exit(1)
}

for (const file of scripts) {
  console.log(`\n> ${file}`)
  await run(process.execPath, [join(root, file)])
}
if (rstest.length) {
  console.log(`\n> rstest ${rstest.join(' ')}`)
  await run(rstestBin, rstest)
}
