import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '@rstest/core'
import { e2eScripts, unitScripts } from '../scripts/test-fixtures.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function runScript(rel: string) {
  const file = join(root, rel)
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, CI: process.env.CI || '1' },
      windowsHide: true,
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${rel} exited ${code}`))
    })
  })
}

describe.sequential('unit', () => {
  for (const script of unitScripts) {
    it(script, async () => {
      await runScript(script)
      expect(true).toBe(true)
    }, script.includes('check-css-modules') ? 180_000 : 30_000)
  }
})

describe.sequential('e2e', () => {
  for (const script of e2eScripts) {
    it(script, async () => {
      await runScript(script)
      expect(true).toBe(true)
    }, 240_000)
  }
})
