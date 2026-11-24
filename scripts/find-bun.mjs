import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function findBun() {
  // A Windows npm install exposes bun.cmd on PATH. Ask it for the actual
  // executable so callers can pass arguments directly, including paths with spaces.
  const probe = spawnSync('bun -p process.execPath', { shell: true, encoding: 'utf8', windowsHide: true })
  const name = process.platform === 'win32' ? 'bun.exe' : 'bun'
  return [
    probe.status === 0 && probe.stdout.trim(),
    process.env.BUN_INSTALL && join(process.env.BUN_INSTALL, 'bin', name),
    join(homedir(), '.bun', 'bin', name),
  ].find(path => path && existsSync(path))
}
