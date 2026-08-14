import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  pptxPictureSource,
  pptxImageClip,
  pptxPictureShapeCanBeImage,
} = await import(pathToFileURL(join(root, 'src/utils/pptxImportPicture.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const nativeImage = pptxPictureSource({
  type: 'image',
  base64: 'data:image/png;base64,aaa',
  geom: 'ellipse',
  isFlipH: true,
})
assert(nativeImage?.geom === 'ellipse', 'native image keeps geom')
assert(pptxImageClip(nativeImage.geom)?.shape === 'ellipse', 'ellipse geom becomes clip')

const pictureShape = pptxPictureSource({
  type: 'shape',
  shapType: 'rect',
  fill: { type: 'image', value: { base64: 'data:image/png;base64,bbb' } },
  isFlipV: true,
})
assert(pictureShape?.src.includes('bbb'), 'rect picture-shape becomes image source')
assert(pictureShape?.geom === 'rect', 'rect picture-shape keeps geom')
assert(pptxImageClip(pictureShape.geom) === undefined, 'full rect picture has no clip (no stretch-via-crop)')

const cropped = pptxPictureSource({
  type: 'shape',
  shapType: 'rect',
  fill: { type: 'image', value: { base64: 'data:image/png;base64,ccc', rect: { l: 10, t: 5, r: 15, b: 20 } } },
})
const clip = pptxImageClip(cropped.geom, cropped.rect)
assert(clip?.range[0][0] === 10 && clip?.range[0][1] === 5, 'srcRect start')
assert(clip?.range[1][0] === 85 && clip?.range[1][1] === 80, 'srcRect end')

assert(pptxPictureSource({
  type: 'shape',
  shapType: 'custom',
  fill: { type: 'image', value: { base64: 'data:image/png;base64,ddd' } },
}) === null, 'custom-path picture fill stays a shape')
assert(!pptxPictureShapeCanBeImage('custom'), 'custom geom is not an image clip')
assert(pptxPictureSource({
  type: 'shape',
  shapType: 'line',
  fill: { type: 'image', value: { base64: 'data:image/png;base64,eee' } },
}) === null, 'connectors stay connectors')

const importSrc = readFileSync(join(root, 'src/hooks/useImport.ts'), 'utf8')
assert(importSrc.includes('pptxPictureSource'), 'useImport maps picture-shapes via pptxPictureSource')
assert(importSrc.includes('pptxImageClip'), 'useImport applies pptxImageClip')

const sample = join(homedir(), 'Desktop', 'Rizika použití EF s ohledem na výkonnost.pptx')
if (existsSync(sample)) {
  const buf = readFileSync(sample)
  const { parse } = await import(pathToFileURL(join(root, 'node_modules/pptxtojson/dist/index.js')).href)
  const json = await parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const slide3 = json.slides[2]
  const mapped = slide3.elements.map(el => {
    const picture = pptxPictureSource(el)
    return picture
      ? { kind: 'image', w: el.width, h: el.height, clip: pptxImageClip(picture.geom, picture.rect) }
      : { kind: el.type, w: el.width, h: el.height }
  })
  const images = mapped.filter(el => el.kind === 'image')
  assert(images.length === 1, `slide 3 should import exactly one image, got ${images.length} (${mapped.map(el => el.kind).join(',')})`)
  const img = images[0]
  const ratio = img.w / img.h
  assert(ratio > 1.8 && ratio < 2.6, `slide 3 image frame should stay landscape, ratio=${ratio.toFixed(3)} w=${img.w} h=${img.h}`)
  assert(!img.clip, 'slide 3 picture has no srcRect, so no clip')
}

if (failures.length) {
  console.error('pptx import picture checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('pptx import picture checks passed')
