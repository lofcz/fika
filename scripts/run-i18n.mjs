import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBun } from './find-bun.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const bun = findBun()
if (!bun) {
  console.error('i18n codegen needs Bun so @lofcz/typesafe-i18n can transpile locale files.')
  console.error('Install Bun from https://bun.sh and retry.')
  process.exit(1)
}

const cli = join(root, 'node_modules', 'typesafe-i18n', 'cli', 'typesafe-i18n.mjs')
const extra = process.argv.slice(2)
const result = spawnSync(bun, ['--bun', cli, ...extra], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    PATH: `${dirname(bun)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
  },
})

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

if (extra.includes('--no-watch')) {
  const types = readFileSync(join(root, 'src', 'i18n', 'i18n-types.ts'), 'utf8')
  if (!types.includes('loadingData:')) {
    console.error('typesafe-i18n wrote empty i18n types. The CLI must run under Bun (`bun --bun`).')
    process.exit(1)
  }
}
