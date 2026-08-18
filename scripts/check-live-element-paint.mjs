import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const shapePanel = readFileSync(join(root, 'src/views/Editor/Toolbar/ElementStylePanel/ShapeStylePanel.tsx'), 'utf8')
const paintBody = shapePanel.slice(shapePanel.indexOf('const paintGradient'), shapePanel.indexOf('const updateGradient'))
const commitBody = shapePanel.slice(shapePanel.indexOf('const updateGradient'), shapePanel.indexOf('const updateGradientColors'))
assert(shapePanel.includes("from '@/utils/liveElementPaint'"), 'shape style panel live-paints gradients')
assert(paintBody.includes('applyLiveGradient'), 'slider input writes the SVG def, not the store')
assert(!paintBody.includes('updateElement'), 'paintGradient must not call updateElement')
assert(shapePanel.includes('data-style-slider="gradient-angle"'), 'angle slider exposes a stable test hook')
assert(commitBody.includes('updateElement'), 'mouseup commits the painted gradient')

const slidePanel = readFileSync(join(root, 'src/views/Editor/Toolbar/SlideDesignPanel/index.tsx'), 'utf8')
const bgPaint = slidePanel.slice(slidePanel.indexOf('const paintGradientBackground'), slidePanel.indexOf('const updateGradientBackground'))
assert(slidePanel.includes('applyLiveBackgroundGradient'), 'slide background sliders live-paint CSS')
assert(!bgPaint.includes('updateSlide'), 'background paintGradient must not write the store')

const canvasThumb = readFileSync(join(root, 'src/views/components/ThumbnailSlide/CanvasSlideThumb.tsx'), 'utf8')
assert(canvasThumb.includes('paintSlideToCanvas'), 'the thumb repaints committed model changes through the direct canvas painter')
assert(canvasThumb.includes('EDIT_DEBOUNCE_MS'), 'thumbnail repainting is bounded during edit gestures')

const livePaint = readFileSync(join(root, 'src/utils/liveElementPaint.ts'), 'utf8')
assert(livePaint.includes('export const syncGradientDef'), 'stop nodes have a single imperative writer')

const gradientDefs = readFileSync(join(root, 'src/views/components/element/ShapeElement/GradientDefs.tsx'), 'utf8')
assert(gradientDefs.includes('syncGradientDef'), 'GradientDefs writes stops through the live-paint helper')
assert(!gradientDefs.includes('<stop'), 'GradientDefs must not render React-owned stop children')

const viewport = readFileSync(join(root, 'src/views/Editor/Canvas/ViewportBackground.tsx'), 'utf8')
assert(viewport.includes('data-live-background'), 'slide background is a live paint target')
assert(viewport.includes('selectCurrentSlide(s)?.background'), 'viewport background does not rerender on element writes')

if (failures.length) {
  console.error(`FAIL ${failures.length}`)
  for (const item of failures) console.error(`  - ${item}`)
  process.exit(1)
}
console.log('PASS 14 live-paint source checks')
