/**
 * Host bundlers treat `new URL("./", import.meta.url)` as a module request for
 * `./` and fail. Rspack emits that for the ESM-library base URI (`__webpack_require__.b`).
 * Rewrite it to a runtime document base so `fika-editor/embed` can be imported
 * from another Rsbuild/Vite app.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const embedJs = join(root, 'dist/embed/fika-embed.js')
const HOSTILE = 'new URL("./",import.meta.url)'
const SAFE = '(typeof document!=="undefined"&&document.baseURI)||"/"'

const source = readFileSync(embedJs, 'utf8')
if (!source.includes(HOSTILE)) {
  if (source.includes('import.meta.url')) {
    console.warn(
      '[rewrite-embed-base-uri] import.meta.url is still present; check the embed output before publishing',
    )
  } else {
    console.log('[rewrite-embed-base-uri] no hostile new URL("./", import.meta.url) — already clean')
  }
  process.exit(0)
}

writeFileSync(embedJs, source.replaceAll(HOSTILE, SAFE))
console.log('[rewrite-embed-base-uri] rewrote ESM library base URI for host bundlers')
