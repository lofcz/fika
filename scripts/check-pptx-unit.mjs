import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  PPTX_PX_PER_INCH,
  PPTX_PX_PER_POINT,
  getPPTXImportScale,
  getPPTXImageCrop,
} = await import(pathToFileURL(join(root, 'src/utils/pptxUnit.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(PPTX_PX_PER_INCH === 96, 'PPTX_PX_PER_INCH should be 96')
assert(PPTX_PX_PER_POINT === 96 / 72, 'PPTX_PX_PER_POINT should be 96/72')
assert(getPPTXImportScale(720) === PPTX_PX_PER_POINT, 'default import scale is px/pt')
assert(getPPTXImportScale(720, 1000) === 1000 / 720, 'append/fixed viewport scale')

const crop = getPPTXImageCrop(200, 100, [[10, 20], [90, 80]], 96)
assert(Math.abs(crop.imageWidth - (200 / 0.8 / 96)) < 1e-9, 'crop imageWidth')
assert(Math.abs(crop.imageHeight - (100 / 0.6 / 96)) < 1e-9, 'crop imageHeight')
assert(Math.abs(crop.sizing.x - 0.1 * crop.imageWidth) < 1e-9, 'crop sizing.x')
assert(Math.abs(crop.sizing.w - 0.8 * crop.imageWidth) < 1e-9, 'crop sizing.w')

if (failures.length) {
  console.error('pptxUnit checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('pptxUnit checks passed')
