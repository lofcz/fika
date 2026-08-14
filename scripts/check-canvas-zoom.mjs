import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  MIN_CANVAS_ZOOM,
  MAX_CANVAS_ZOOM,
  CANVAS_ZOOM_PRESETS,
  displayedZoomPercent,
  clampCanvasZoom,
  stepCanvasZoom,
  addCanvasZoom,
  wheelDeltaToZoom,
  occupancyForDisplayedZoom,
  occupancyForTargetZoom,
} = await import(pathToFileURL(join(root, 'src/utils/canvasZoom.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(displayedZoomPercent(0.981) === 98, 'displayedZoomPercent rounds 98.1 → 98')
assert(displayedZoomPercent(2) === 200, 'displayedZoomPercent 2 → 200')
assert(clampCanvasZoom(205) === MAX_CANVAS_ZOOM, 'clampCanvasZoom caps at 200')
assert(clampCanvasZoom(5) === MIN_CANVAS_ZOOM, 'clampCanvasZoom floors at 10')

assert(stepCanvasZoom(100, 1) === 110, 'plus from 100% goes to 110')
assert(stepCanvasZoom(110, 1) === 125, 'plus from 110% goes to 125')
assert(stepCanvasZoom(125, 1) === 150, 'plus from 125% goes to 150')
assert(stepCanvasZoom(50, 1) === 67, 'plus from 50% goes to 67')
assert(stepCanvasZoom(10, 1) === 25, 'plus from 10% goes to 25')
assert(stepCanvasZoom(53, 1) === 67, 'plus from an off-ladder 53% snaps to 67')
assert(stepCanvasZoom(98, 1) === 100, 'plus from 98% snaps to 100, not past it')
assert(stepCanvasZoom(196, 1) === 200, 'plus near ceiling lands on 200')
assert(stepCanvasZoom(200, 1) === 200, 'plus at 200 is a no-op')
assert(stepCanvasZoom(200, -1) === 175, 'minus from 200 goes to 175')
assert(stepCanvasZoom(100, -1) === 90, 'minus from 100% goes to 90')
assert(stepCanvasZoom(53, -1) === 50, 'minus from an off-ladder 53% snaps to 50')
assert(stepCanvasZoom(12, -1) === 10, 'minus near floor lands on 10')
assert(stepCanvasZoom(10, -1) === 10, 'minus at 10 is a no-op')

let walked = 10
const seen = [walked]
while (true) {
  const next = stepCanvasZoom(walked, 1)
  if (next === walked) break
  seen.push(next)
  walked = next
}
assert(
  JSON.stringify(seen) === JSON.stringify([...CANVAS_ZOOM_PRESETS]),
  'plus from 10% walks every preset up to 200',
)

assert(addCanvasZoom(197, 8) === 200, 'wheel remainder clamps to 200')
assert(addCanvasZoom(200, 5) === 200, 'wheel in at 200 is a no-op')
assert(Math.abs(wheelDeltaToZoom(-40) - 5) < 1e-9, '40px wheel-in is +5%')
assert(Math.abs(wheelDeltaToZoom(40) + 5) < 1e-9, '40px wheel-out is -5%')

const occupancy200 = occupancyForDisplayedZoom(200, 0.81, 90)
assert(Math.abs(occupancy200 - 90 * 2 / 0.81) < 1e-9, '200% displayed may require occupancy > 200')
const realized = 0.81 * occupancy200 / 90
assert(Math.abs(realized - 2) < 1e-9, 'occupancyForDisplayedZoom realizes exact 200% scale')

const occupancy100 = occupancyForDisplayedZoom(100, 0.98, 90)
const realized100 = 0.98 * occupancy100 / 90
assert(Math.abs(realized100 - 1) < 1e-9, '100% preset realizes exact 1.0 scale')

const occW = occupancyForTargetZoom(200, 1000, 800, 1000, 0.5625)
assert(Math.abs(occW - 200) < 1e-9, '200% on a 1000px-wide pane is occupancy 200')
const occW100 = occupancyForTargetZoom(100, 1000, 800, 1000, 0.5625)
assert(Math.abs(occW100 - 100) < 1e-9, '100% on a 1000px-wide pane is occupancy 100')
const occH = occupancyForTargetZoom(200, 2000, 400, 1000, 0.5625)
const scaleH = (400 * occH / 100) / (1000 * 0.5625)
assert(Math.abs(scaleH - 2) < 1e-9, '200% on a short pane uses occupancy from height')

if (failures.length) {
  console.error('canvasZoom checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('canvasZoom checks passed')
