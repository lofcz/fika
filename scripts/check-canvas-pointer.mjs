import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  renderedScale,
  clientToCanvasPoint,
  clientDeltaToCanvas,
} = await import(pathToFileURL(join(root, 'src/utils/canvasPointer.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(Math.abs(renderedScale(1500, 1000, 1) - 1.5) < 1e-9, 'renderedScale uses rect/offset')
assert(renderedScale(0, 1000, 0.8) === 0.8, 'renderedScale falls back when rect is empty')
assert(renderedScale(1500, 0, 0.8) === 0.8, 'renderedScale falls back when layout size is empty')

const p = clientToCanvasPoint(250, 180, 100, 80, 1.5)
assert(Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y - 200 / 3) < 1e-9, 'clientToCanvasPoint divides by zoom')

const d = clientDeltaToCanvas(30, -15, 1.5)
assert(Math.abs(d.x - 20) < 1e-9 && Math.abs(d.y - -10) < 1e-9, 'clientDeltaToCanvas divides by zoom')

const unzoomed = clientDeltaToCanvas(30, -15, 1)
assert(unzoomed.x === 30 && unzoomed.y === -15, 'scale 1 is a no-op')

const ancestorZoom = renderedScale(900, 900, 1)
assert(ancestorZoom === 1, 'wrapper rect/offset is 1 when there is no extra CSS zoom')
const totalScale = 0.72 * ancestorZoom
const fromWrapper = clientToCanvasPoint(100 + 72, 50, 100, 50, totalScale)
assert(Math.abs(fromWrapper.x - 100) < 1e-9, 'wrapper origin + canvasScale maps visual px to slide px')

if (failures.length) {
  console.error('canvasPointer checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('canvasPointer checks passed')
