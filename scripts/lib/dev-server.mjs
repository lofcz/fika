import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
export const DEV_PORTS = [5173, 5174, 5175, 5176]
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function probe(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return false
    const text = await res.text()
    return !text.includes('Internal server error')
  }
  catch {
    return false
  }
}

/** True when the HTML shell is up and the main module has compiled. */
export async function isDevCompiled(base) {
  const origin = base.replace(/\/$/, '')
  if (!(await probe(`${origin}/`))) return false
  return probe(`${origin}/src/main.tsx`)
}

export async function findDevServer(timeoutMs = 1500) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const port of DEV_PORTS) {
      const base = `http://127.0.0.1:${port}`
      if (await isDevCompiled(base)) return `${base}/`
    }
    await sleep(300)
  }
  return ''
}

export async function ensureDevServer(timeoutMs = 90000) {
  const existing = await findDevServer(800)
  if (existing) return { url: existing, child: null }

  const child = spawn('bun', ['run', 'dev'], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
  })

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = await findDevServer(400)
    if (url) return { url, child }
    if (child.exitCode != null) break
    await sleep(400)
  }

  child.kill()
  throw new Error('fika dev server did not compile (tried ports 5173-5176)')
}
