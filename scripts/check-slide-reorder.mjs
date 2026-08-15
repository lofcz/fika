import { existsSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidates = []
    if (specifier.startsWith('@/')) {
      const without = specifier.slice(2)
      candidates.push(
        join(srcDir, without + '.ts'),
        join(srcDir, without + '.js'),
        join(srcDir, without, 'index.ts'),
        join(srcDir, without),
      )
    }
    else if (specifier.startsWith('.') && context.parentURL) {
      const parentDir = dirname(fileURLToPath(context.parentURL))
      candidates.push(
        join(parentDir, specifier + '.ts'),
        join(parentDir, specifier + '.js'),
        join(parentDir, specifier, 'index.ts'),
      )
    }
    const file = candidates.find(path => existsSync(path) && statSync(path).isFile())
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}
function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

const {
  restrictDragToVertical,
  mergeActiveVirtualRow,
  clampScrollTop,
  wheelDeltaPx,
} = await import(pathToFileURL(join(root, 'src/components/draggableLayout.ts')).href)

assert(restrictDragToVertical({ transform: { x: 40, y: 12, scaleX: 1, scaleY: 1 } }).x === 0, 'rail drag is locked to Y')
assert(restrictDragToVertical({ transform: { x: 40, y: 12, scaleX: 1, scaleY: 1 } }).y === 12, 'rail drag keeps Y')

const rows = [{ index: 0 }, { index: 2 }]
assert(mergeActiveVirtualRow(rows, 1, { index: 1 }).some(r => r.index === 1), 'active row stays mounted when virtualized away')
assert(mergeActiveVirtualRow(rows, 0).length === 2, 'already-visible active row is not duplicated')
assert(clampScrollTop(10, -40, 100) === 0, 'wheel clamp hits 0')
assert(clampScrollTop(90, 40, 100) === 100, 'wheel clamp hits max')
assert(wheelDeltaPx(2, 1, 200) === 32, 'line-mode wheel converts to px')

const drag = read('src/components/Draggable.tsx')
assert(drag.includes('paintRasterSnapshot'), 'overlay blits the off-DOM master, not the hidden thumb canvas')
assert(drag.includes('data-slide-drag-overlay'), 'drag overlay is queryable for e2e')
assert(drag.includes('useLayoutEffect'), 'overlay paints before the first drag frame')
assert(drag.includes('hideWhileDragging'), 'source row hides only after an overlay exists')
assert(!drag.includes('getRasterSnapshot'), 'overlay must not read the live display canvas')

const cache = read('src/previewRaster/rasterCache.ts')
assert(cache.includes('data-preview-raster-master'), 'master snapshot stays off-DOM')
assert(!/appendChild\(snap\.canvas\)/.test(cache), 'master canvas is never moved into a thumb')

const thumb = read('src/views/components/ThumbnailSlide/index.tsx')
assert(thumb.includes('data-thumbnail-slide'), 'overlay measures the thumb via a stable data attribute')

const layout = read('src/components/draggableLayout.ts')
assert(layout.includes('[data-thumbnail-slide]'), 'overlayFromNode does not depend on hashed CSS classes')

if (failures.length) {
  console.error(`check-slide-reorder: ${failures.length} failed`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('check-slide-reorder: ok')
