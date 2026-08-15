/**
 * sb1.pptx import crash lock: PptxGenJS-generated packages that omit
 * [Content_Types].xml slide Overrides are invisible to pptxtojson, so Fika
 * applies an empty deck and the editor throws.
 *
 * Run: node scripts/check-sb1-import.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import pptxgen from '@lofcz/pptxgenjs'
import { parse } from 'pptxtojson/dist/index.js'
import { SB1_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
const sb1Path = SB1_PPTX

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function slideOverrideCount(contentTypesXml) {
  const re = new RegExp(
    `PartName="/ppt/slides/slide\\d+\\.xml"\\s+ContentType="${SLIDE_CT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
    'g',
  )
  return (contentTypesXml.match(re) || []).length
}

if (!existsSync(sb1Path)) {
  console.error(`sb1.pptx not found at ${sb1Path}`)
  process.exit(1)
}

const sb1Buf = readFileSync(sb1Path)
const sb1Zip = await JSZip.loadAsync(sb1Buf)
const sb1Types = await sb1Zip.file('[Content_Types].xml').async('string')
const sb1Presentation = await sb1Zip.file('ppt/presentation.xml').async('string')
const sldIdCount = (sb1Presentation.match(/<p:sldId\b/g) || []).length
const sb1Overrides = slideOverrideCount(sb1Types)
const creator = (await sb1Zip.file('docProps/core.xml').async('string')).includes('PptxGenJS')

console.log(`fixture=${sb1Path}`)
console.log(`creator=PptxGenJS:${creator} sldId=${sldIdCount} slideOverrides=${sb1Overrides} bytes=${sb1Buf.length}`)

assert(creator, 'sb1.pptx must be a PptxGenJS-generated package')
assert(sldIdCount === 7, `sb1 presentation.xml lists 7 slides, got ${sldIdCount}`)
assert(
  sb1Overrides === 0,
  `diagnosis: sb1 [Content_Types].xml must still omit slide Overrides (got ${sb1Overrides}) — this is the package defect`,
)

const importSrc = readFileSync(join(root, 'src/hooks/useImport.ts'), 'utf8')
assert(
  importSrc.includes('!json?.slides?.length'),
  'useImport must refuse to apply a 0-slide parse (empty deck crashes the editor)',
)

const parsed = await parse(toArrayBuffer(sb1Buf), {
  imageMode: 'base64',
  videoMode: 'blob',
  audioMode: 'blob',
})
console.log(`pptxtojson slides=${parsed.slides.length} size=${JSON.stringify(parsed.size)}`)
assert(
  parsed.slides.length === 7,
  `pptxtojson must see all 7 slides in sb1.pptx, got ${parsed.slides.length} (empty import is what crashes Fika)`,
)

if (parsed.slides.length) {
  const texts = parsed.slides.flatMap(s => s.elements.map(el => String(el.content || ''))).join(' ').replace(/&nbsp;/g, ' ')
  assert(/Jan Hus/i.test(texts), 'imported deck must retain the Jan Hus title text')
}

const fresh = new pptxgen()
fresh.addSlide().addText('alpha', { x: 0.5, y: 0.5, w: 4, h: 1 })
fresh.addSlide().addText('beta', { x: 0.5, y: 0.5, w: 4, h: 1 })
const freshBuf = Buffer.from(await fresh.write({ outputType: 'nodebuffer' }))
const freshZip = await JSZip.loadAsync(freshBuf)
const freshTypes = await freshZip.file('[Content_Types].xml').async('string')
const freshOverrides = slideOverrideCount(freshTypes)
const freshParsed = await parse(toArrayBuffer(freshBuf), {
  imageMode: 'base64',
  videoMode: 'blob',
  audioMode: 'blob',
})
console.log(`current @lofcz/pptxgenjs ${fresh.version || '?'} overrides=${freshOverrides} parsedSlides=${freshParsed.slides.length}`)
assert(freshOverrides === 2, `current PptxGenJS must emit 2 slide Overrides, got ${freshOverrides}`)
assert(freshParsed.slides.length === 2, `current PptxGenJS output must parse to 2 slides, got ${freshParsed.slides.length}`)

if (failures.length) {
  console.error('sb1 import checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('sb1 import checks passed')
