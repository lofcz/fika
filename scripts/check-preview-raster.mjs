/** Architecture guard for model-driven, final-DPR canvas thumbnails. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

const canvasThumb = read('src/views/components/ThumbnailSlide/CanvasSlideThumb.tsx')
const thumbnail = read('src/views/components/ThumbnailSlide/index.tsx')
const scss = read('src/views/components/ThumbnailSlide/index.module.scss')
const painter = read('src/paint/slidePainter.ts')
const textPainter = read('src/paint/textPainter.ts')
const scheduler = read('src/paint/scheduler.ts')

assert(canvasThumb.includes("from '@/paint/slidePainter'"), 'the thumbnail delegates to the model-driven canvas painter')
assert(canvasThumb.includes('devicePixelRatio'), 'the canvas backing store follows the final device DPR')
assert(canvasThumb.includes('EDIT_DEBOUNCE_MS'), 'slide edits repaint through a bounded debounce')
assert(canvasThumb.includes('arePaintedSlideIdentitiesEqual'), 'thumbs re-render only when slide identity changes')
assert(!canvasThumb.includes('ScreenSlide'), 'thumbnail paint never mounts the ScreenSlide DOM')
assert(!canvasThumb.includes('snapdom'), 'thumbnail paint never captures DOM')
assert(thumbnail.includes('CanvasSlideThumb'), 'ThumbnailSlide displays the direct canvas renderer')
assert(scss.includes('pointer-events: none'), 'thumbnail content is not interactive')
assert(painter.includes('paintSlideToCanvas'), 'the slide painter exposes one canvas entry point')
assert(painter.includes('new Path2D'), 'SVG paths are parsed by the browser Path2D engine')
assert(painter.includes('basePaths') && painter.includes('scaledPaths'), 'parsed and transformed paths are cached')
assert(painter.includes('getCachedPreviewImageBitmap'), 'images reuse the existing preview ImageBitmap tier')
assert(textPainter.includes('prepareRichInline') && textPainter.includes('paintRichText'), 'Pretext drives rich text wrapping and Canvas paints fragments')
assert(scheduler.includes('FRAME_BUDGET_MS') && scheduler.includes('PaintPriority'), 'paint work is frame-budgeted and visibility-prioritized')

const shape = read('src/views/components/element/ShapeElement/BaseShapeElement.tsx')
const text = read('src/views/components/element/TextElement/BaseTextElement.tsx')
const chart = read('src/views/components/element/ChartElement/BaseChartElement.tsx')
assert(shape.includes('selectSlideById'), 'shape contrast resolves the owning slide, not the editor current slide')
assert(text.includes('selectSlideById'), 'text contrast resolves the owning slide, not the editor current slide')
assert(chart.includes('selectSlideById'), 'chart contrast resolves the owning slide, not the editor current slide')
assert(shape.includes('SlideIdContext') && text.includes('SlideIdContext') && chart.includes('SlideIdContext'), 'owning-slide resolution comes from SlideIdContext')

assert(read('src/store/slides.ts').includes('selectSlideById'), 'the store exposes per-id slide selection')

const draggable = read('src/components/Draggable.tsx')
assert(draggable.includes('CanvasSlideThumb'), 'the drag ghost uses the same direct canvas renderer')
assert(draggable.includes('overlayRender'), 'the slide drag ghost is opt-in — generic lists keep their own behavior')

const pkg = read('package.json')
assert(!pkg.includes('"konva"'), 'konva dependency is gone with the painter stack')
assert(!pkg.includes('@zumer/snapdom'), 'SnapDOM is gone with whole-slide DOM capture')

assert(!read('src/views/Editor/Thumbnails/index.tsx').includes('previewRaster'), 'the rail wires no raster subscription')
const virtualizer = read('src/views/Editor/Thumbnails/useThumbnailVirtualizer.ts')
assert(!virtualizer.includes('teardownThumbSnapshot'), 'virtualizer teardown does no capture work')
assert(!virtualizer.includes('MAX_PINNED_TEARDOWNS'), 'leaving rows are never pinned for raster capture')

const readOnlyConsumers = [
  'src/views/Editor/Thumbnails/index.tsx',
  'src/views/Screen/PresenterView.tsx',
  'src/views/Screen/BottomThumbnails.tsx',
  'src/views/Mobile/MobileThumbnails.tsx',
  'src/views/Editor/Thumbnails/Templates.tsx',
  'src/views/Editor/Thumbnails/LayoutPicker.tsx',
  'src/views/Screen/PresenterToolbar.tsx',
  'src/views/Screen/SlideThumbnails.tsx',
  'src/views/Mobile/MobilePreview.tsx',
  'src/views/Mobile/MobilePlayer.tsx',
  'src/views/Editor/Canvas/LinkDialog.tsx',
]
for (const consumer of readOnlyConsumers) {
  assert(read(consumer).includes('ThumbnailSlide'), `${consumer} uses the shared canvas-backed thumbnail`)
}
assert(!existsSync(join(root, 'src/views/components/ThumbnailSlide/LiveSlideThumb.tsx')), 'the live DOM thumbnail implementation is deleted')
assert(!existsSync(join(root, 'src/views/components/ThumbnailSlide/thumbSnapshot.ts')), 'the SnapDOM snapshot pipeline is deleted')

if (failures.length) {
  console.error(`check-preview-raster: ${failures.length} failure(s)`)
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log('check-preview-raster: ok')
