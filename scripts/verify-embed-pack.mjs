/**
 * Fail the pack/publish if the embed artifacts are missing on disk or (with
 * `--tarball`) missing from the npm tarball. The 3.0.0 publish shipped docs
 * only because `dist/` was never built and `files` entries that do not exist
 * are silently omitted.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const checkTarball = process.argv.includes('--tarball')

const REQUIRED = [
  'dist/embed/fika-embed.js',
  'dist/embed/fika-embed.css',
  'dist/embed/agentic-manifest.json',
  'dist/types/embed/index.d.ts',
]

const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function assertOnDisk() {
  for (const rel of REQUIRED) {
    assert(existsSync(join(root, rel)), `missing ${rel} — run \`bun run build:embed\` before packing`)
  }

  if (!existsSync(join(root, 'dist/types/embed/index.d.ts'))) return
  const dts = readFileSync(join(root, 'dist/types/embed/index.d.ts'), 'utf8')
  assert(dts.includes('mountFika'), 'dist/types/embed/index.d.ts does not export mountFika')
  assert(dts.includes('FikaHeaderMenuItem'), 'dist/types/embed/index.d.ts does not export FikaHeaderMenuItem')
  assert(dts.includes('FikaViewMode'), 'dist/types/embed/index.d.ts does not export FikaViewMode')
}

function assertTarball() {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const raw = execFileSync(npmBin, ['pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  })
  const report = JSON.parse(raw)
  const files = new Set(
    (Array.isArray(report) ? report[0]?.files : report.files)?.map((file) => file.path) ?? [],
  )

  for (const rel of REQUIRED) {
    assert(files.has(rel), `tarball missing ${rel}`)
  }
  assert(files.size > 20, `tarball is too small (${files.size} files) — embed build was not packed`)
}

assertOnDisk()
if (checkTarball) assertTarball()

if (failures.length) {
  console.error(failures.map((message) => `fail: ${message}`).join('\n'))
  process.exit(1)
}

console.log(
  checkTarball
    ? `pack ok: ${REQUIRED.length} required files present on disk and in the tarball`
    : `embed ok: ${REQUIRED.length} required files present`,
)
