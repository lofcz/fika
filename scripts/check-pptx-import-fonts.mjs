/**
 * Embedded-font PPTX import: pptxtojson returns usedFonts as
 * `{ name, fontFamily, blob }[]`. Import must normalize those objects
 * and register blob FontFaces so Houby / any pptxgenjs addFont() deck
 * does not crash.
 *
 *   node scripts/check-pptx-import-fonts.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { HOUBY_PPTX, PLEX_FONT } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const houby = HOUBY_PPTX
const plex = PLEX_FONT

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const importSrc = readFileSync(join(root, 'src/hooks/useImport.ts'), 'utf8')
const fontSrc = readFileSync(join(root, 'src/utils/font.ts'), 'utf8')
const importFontsSrc = readFileSync(join(root, 'src/utils/pptxImportFonts.ts'), 'utf8')

assert(
  importSrc.includes('loadGoogleFonts(json.usedFonts)'),
  'useImport must still forward json.usedFonts into loadGoogleFonts',
)

const {
  normalizePptxUsedFonts,
  pptxUsedFontName,
  registerEmbeddedFonts,
  splitImportedFontFace,
} = await import(pathToFileURL(join(root, 'src/utils/pptxImportFonts.ts')).href)

const mixed = [
  ' "Arial" ',
  { name: 'Brygada 1918', fontFamily: 'Brygada 1918, sans-serif', blob: 'blob:nodedata:test' },
  { name: 'Brygada 1918 Bold', blob: 'blob:nodedata:bold' },
  { fontFamily: "'IBM Plex Sans', sans-serif" },
  null,
  12,
]
const normalized = normalizePptxUsedFonts(mixed)
assert(pptxUsedFontName(mixed[0]) === 'Arial', 'string usedFonts are unquoted')
assert(pptxUsedFontName(mixed[1]) === 'Brygada 1918', 'object usedFonts use .name')
assert(
  normalized.some(f => f.name === 'Brygada 1918' && f.blob === 'blob:nodedata:test'),
  `embedded blob is kept: ${JSON.stringify(normalized)}`,
)
assert(
  normalized.some(f => f.name === 'IBM Plex Sans' && !f.blob),
  'fontFamily-only objects still yield a family name',
)
assert(!normalized.some(f => f.name === '12' || !f.name), 'non-string entries are dropped')

let threw = null
try {
  normalizePptxUsedFonts(mixed)
  registerEmbeddedFonts(mixed)
}
catch (error) {
  threw = error instanceof Error ? error.message : String(error)
}
assert(threw == null, `normalize/register must not throw on usedFonts objects (${threw})`)

const split = splitImportedFontFace('Brygada 1918 Bold')
assert(split.family === 'Brygada 1918' && split.weight === '700', `Bold suffix splits, got ${JSON.stringify(split)}`)

function isEmbeddedFontObject(entry) {
  return !!entry && typeof entry === 'object' && typeof entry.name === 'string' && 'blob' in entry
}

const { parse } = await import(pathToFileURL(join(root, 'node_modules/pptxtojson/dist/index.js')).href)

async function parsePptx(path) {
  const buf = readFileSync(path)
  return parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
    imageMode: 'base64',
    videoMode: 'blob',
    audioMode: 'blob',
  })
}

async function parseGeneratedEmbeddedFontDeck() {
  const fontPath = plex
  if (!existsSync(fontPath)) return null
  const pptxgen = (await import('@lofcz/pptxgenjs')).default
  const pptx = new pptxgen()
  const fontBuf = readFileSync(fontPath)
  await pptx.addFont({
    fontFace: 'IBM Plex Sans',
    fontFile: fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength),
    fontType: 'ttf',
  })
  pptx.addSlide().addText('Hello', { x: 0.5, y: 0.5, w: 4, h: 1, fontFace: 'IBM Plex Sans', fontSize: 24 })
  const out = await pptx.write({ outputType: 'nodebuffer' })
  return parse(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), {
    imageMode: 'base64',
  })
}

function assertUsedFontsContract(label, json) {
  assert(Array.isArray(json.usedFonts) && json.usedFonts.length > 0, `${label}: expected embedded usedFonts`)
  const first = json.usedFonts[0]
  assert(
    isEmbeddedFontObject(first),
    `${label}: pptxtojson usedFonts[0] must be {name,blob} (got ${JSON.stringify(first)?.slice(0, 180)})`,
  )

  let mapThrew = null
  let names = []
  try {
    names = normalizePptxUsedFonts(json.usedFonts)
    registerEmbeddedFonts(json.usedFonts)
  }
  catch (error) {
    mapThrew = error instanceof Error ? error.message : String(error)
  }

  assert(
    mapThrew == null,
    `${label}: loadGoogleFonts(json.usedFonts) throws (${mapThrew}) — fika must normalize {name,blob} before string APIs`,
  )
  assert(names.every(n => typeof n.name === 'string' && n.name.length > 0), `${label}: names extractable`)
  assert(names.some(n => n.blob), `${label}: at least one embedded blob URL`)
}

if (existsSync(houby)) {
  const json = await parsePptx(houby)
  assertUsedFontsContract('Houby', json)
  assert(
    json.usedFonts.some(f => f.name === 'Brygada 1918'),
    `Houby must expose Brygada 1918, got ${JSON.stringify(json.usedFonts.map(f => f.name))}`,
  )
  assert(json.slides.length === 10, `Houby must parse 10 slides, got ${json.slides.length}`)
  const houbyNames = normalizePptxUsedFonts(json.usedFonts)
  assert(
    houbyNames.some(f => f.name === 'Brygada 1918' && f.blob),
    'Houby Brygada blob must survive normalizePptxUsedFonts',
  )
}
else {
  failures.push('Houby PPTX missing from tests/fixtures/pptx/houby.pptx')
}

const generated = await parseGeneratedEmbeddedFontDeck()
if (generated) {
  assertUsedFontsContract('pptxgenjs-addFont', generated)
}
else {
  console.warn('skipping generated addFont deck: IBM Plex TTF not found')
}

const handlesObjects = /typeof font === ['"]string['"]/.test(importFontsSrc)
  && (importFontsSrc.includes('item.name') || importFontsSrc.includes('font.name') || importFontsSrc.includes('font?.name'))
assert(
  handlesObjects,
  'font.ts / useImport.ts must accept pptxtojson usedFonts objects ({ name, fontFamily, blob })',
)

const registersBlobs = /new FontFace\([^)]*blob/.test(importFontsSrc)
  || /FontFace\([\s\S]{0,120}font\.blob/.test(importFontsSrc)
  || importSrc.includes('registerEmbeddedFonts')
  || fontSrc.includes('registerEmbeddedFonts')
assert(
  registersBlobs,
  'embedded font blobs from pptxtojson must be registered as FontFace, not only sent to Google Fonts',
)
assert(
  fontSrc.includes('isNonWebFontFamily') && fontSrc.includes('twemoji mozilla'),
  'loadGoogleFonts must skip local emoji/symbol faces (Twemoji Mozilla is not on Google Fonts)',
)

if (failures.length) {
  console.error('pptx-import-fonts FAILED:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('pptx-import-fonts passed')
