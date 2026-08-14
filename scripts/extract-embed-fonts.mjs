import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = join(root, 'dist/embed/fika-embed.css')
const fontsDir = join(root, 'dist/embed/fonts')

if (!existsSync(cssPath)) {
  console.error('dist/embed/fika-embed.css missing — run rsbuild build --config rsbuild.config.embed.ts first')
  process.exit(1)
}

mkdirSync(fontsDir, { recursive: true })

const css = readFileSync(cssPath, 'utf8')
let count = 0
let extractedBytes = 0

const safeToken = value => (value || '').trim().replace(/^['"]|['"]$/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '')

const rewritten = css.replace(
  /@font-face\{([^{}]*?font-family:([^;{}]+);[^{}]*?)src:url\(data:font\/([^;,{}]+);base64,([^){}]+)\)([^{}]*?)\}/g,
  (match, beforeSrc, rawFamily, ext, base64, afterSrc) => {
    const family = safeToken(rawFamily)
    const declaration = `${beforeSrc}${afterSrc}`
    const weight = safeToken((declaration.match(/font-weight:([^;{}]+)/) || [])[1])
    const style = safeToken((declaration.match(/font-style:([^;{}]+)/) || [])[1])
    const fontBuffer = Buffer.from(base64, 'base64')
    const hash = createHash('sha1').update(fontBuffer).digest('hex').slice(0, 8)
    const fileName = [family, weight, style, hash].filter(Boolean).join('-') + `.${ext === 'woff' ? 'woff' : 'woff2'}`
    writeFileSync(join(fontsDir, fileName), fontBuffer)
    count++
    extractedBytes += fontBuffer.length
    return `@font-face{${beforeSrc}src:url(./fonts/${fileName})${afterSrc}}`
  },
)

writeFileSync(cssPath, rewritten)
console.log(`Extracted ${count} embedded fonts (${extractedBytes} bytes) from embed CSS`)
