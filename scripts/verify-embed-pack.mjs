/**
 * Fail the pack/publish if the embed artifacts are missing on disk or (with
 * `--tarball`) missing from the npm tarball. The 3.0.0 publish shipped docs
 * only because `dist/` was never built and `files` entries that do not exist
 * are silently omitted.
 *
 * Do not trust `npm pack --dry-run --json`: Bun's `npm` shim on PATH can
 * return a JSON object with no `files` list. Pack a real `.tgz` with the npm
 * that sits next to `process.execPath`, then list it with `tar`.
 *
 *   node scripts/verify-embed-pack.mjs
 *   node scripts/verify-embed-pack.mjs --tarball
 *   node scripts/verify-embed-pack.mjs --tarball path/to/fika-editor-x.tgz
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tarballFlag = process.argv.indexOf('--tarball')
const checkTarball = tarballFlag !== -1
const tarballArg = tarballFlag !== -1 ? process.argv[tarballFlag + 1] : undefined
const explicitTarball = tarballArg && !tarballArg.startsWith('-') ? tarballArg : null

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

function resolveNpmCli() {
  const dir = dirname(process.execPath)
  const candidates = [
    join(dir, 'node_modules/npm/bin/npm-cli.js'),
    join(dir, '../lib/node_modules/npm/bin/npm-cli.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`npm-cli.js not found next to ${process.execPath}`)
}

function runNpm(args, options = {}) {
  const cli = resolveNpmCli()
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  })
}

function packTarball() {
  const dest = mkdtempSync(join(tmpdir(), 'fika-pack-'))
  const cli = resolveNpmCli()
  const version = runNpm(['--version']).trim()
  console.log(`pack: node=${process.execPath}`)
  console.log(`pack: npm=${cli} (${version})`)
  runNpm(['pack', '--pack-destination', dest, '--ignore-scripts'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const tgz = readdirSync(dest).find((name) => name.endsWith('.tgz'))
  if (!tgz) {
    rmSync(dest, { recursive: true, force: true })
    throw new Error(`npm pack produced no tarball in ${dest}`)
  }
  return { dest, tarball: join(dest, tgz) }
}

function listTarball(tarball) {
  const out = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((entry) => entry.replace(/^package\//, ''))
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

  const embedJs = join(root, 'dist/embed/fika-embed.js')
  if (existsSync(embedJs)) {
    const js = readFileSync(embedJs, 'utf8')
    assert(
      !js.includes('new URL("./",import.meta.url)') && !js.includes("new URL('./',import.meta.url)"),
      'fika-embed.js still contains new URL("./", import.meta.url) — host bundlers fail with Can\'t resolve \'./\'',
    )
  }

  const embedCss = join(root, 'dist/embed/fika-embed.css')
  if (existsSync(embedCss)) {
    const css = readFileSync(embedCss, 'utf8')
    assert(
      css.includes('transition-property:transform,visibility,opacity') &&
        css.includes('[data-animation=scale][data-state=hidden]'),
      'fika-embed.css is missing tippy transition styles — initial CSS chunks must be merged into the embed stylesheet',
    )

    const orphanCss = readdirSync(dirname(embedCss)).filter(fileName => fileName.endsWith('.css') && fileName !== 'fika-embed.css')
    assert(orphanCss.length === 0, `orphan initial embed CSS chunks present: ${orphanCss.join(', ')}`)
  }
}

function assertTarball(tarball) {
  const bytes = statSync(tarball).size
  const files = new Set(listTarball(tarball))
  console.log(`pack: tarball=${tarball} (${bytes} bytes, ${files.size} files)`)

  for (const rel of REQUIRED) {
    assert(files.has(rel), `tarball missing ${rel}`)
  }
  assert(files.size > 20, `tarball is too small (${files.size} files) — embed build was not packed`)
  assert(bytes > 100_000, `tarball is too small (${bytes} bytes) — embed build was not packed`)
}

assertOnDisk()

let packedDir = null
try {
  if (checkTarball) {
    let tarball = explicitTarball
    if (!tarball) {
      const packed = packTarball()
      packedDir = packed.dest
      tarball = packed.tarball
    }
    if (!existsSync(tarball)) {
      failures.push(`tarball not found: ${tarball}`)
    } else {
      assertTarball(tarball)
    }
  }
} finally {
  if (packedDir) rmSync(packedDir, { recursive: true, force: true })
}

if (failures.length) {
  console.error(failures.map((message) => `fail: ${message}`).join('\n'))
  process.exit(1)
}

console.log(
  checkTarball
    ? `pack ok: ${REQUIRED.length} required files present on disk and in the tarball`
    : `embed ok: ${REQUIRED.length} required files present`,
)
