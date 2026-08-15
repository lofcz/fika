import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ensureDevServer } from './lib/dev-server.mjs'

const srcRoot = join(process.cwd(), 'src')
const started = await ensureDevServer()
const base = (process.argv[2] || started.url).replace(/\/$/, '')

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, acc)
    else if (name.endsWith('.module.scss')) acc.push(abs)
  }
  return acc
}

const files = walk(srcRoot)
const errors = []
for (const abs of files) {
  const rel = relative(process.cwd(), abs).replace(/\\/g, '/')
  const url = `${base}/${rel}`
  try {
    const res = await fetch(url)
    const text = await res.text()
    if (!res.ok || text.includes('[postcss]') || text.includes('Internal server error')) {
      const msg = text.match(/\[postcss\][^\n]+/)?.[0] || text.slice(0, 200)
      errors.push({ rel, status: res.status, msg })
      console.log('FAIL', rel, msg)
    }
  }
  catch (err) {
    errors.push({ rel, msg: String(err) })
    console.log('ERR', rel, err.message)
  }
}
console.log(`checked ${files.length}, failed ${errors.length} @ ${base}`)
if (started.child) started.child.kill()
process.exit(errors.length ? 1 : 0)
