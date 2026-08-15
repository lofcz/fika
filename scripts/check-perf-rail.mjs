import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
    const without = specifier.slice(2)
    const candidates = [
      join(srcDir, without),
      join(srcDir, without + '.ts'),
      join(srcDir, without + '.js'),
      join(srcDir, without, 'index.ts'),
    ]
    const file = candidates.find(path => existsSync(path))
    if (!file) return nextResolve(specifier, context)
    return { url: pathToFileURL(file).href, shortCircuit: true }
  },
})
const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, acc)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) acc.push(abs)
  }
  return acc
}

function relOf(abs) {
  return relative(root, abs).replace(/\\/g, '/')
}

function importsBanned(src, name) {
  return new RegExp(
    String.raw`(?:import\s+(?:[\s\S]*?\b${name}\b[\s\S]*?\sfrom\s|['"][^'"]*${name})|from\s+['"][^'"]*${name}['"]|require\(\s*['"][^'"]*${name})`,
  ).test(src)
}

const railFiles = [
  'src/views/Editor/Thumbnails/index.tsx',
  'src/views/components/ThumbnailSlide/index.tsx',
  'src/components/Draggable.tsx',
  ...walk(join(root, 'src/previewRaster')).map(relOf),
]

assert(railFiles.some(rel => rel.startsWith('src/previewRaster/')), 'previewRaster render path is scanned')

for (const rel of railFiles) {
  const src = read(rel)
  assert(!importsBanned(src, 'ThumbnailElement'), `${rel} must not import ThumbnailElement`)
  assert(!importsBanned(src, 'BaseChartElement'), `${rel} must not import BaseChartElement`)
  assert(!/echarts\.init\s*\(/.test(src), `${rel} must not call echarts.init`)
  assert(!/\bfrom\s+['"]echarts['"]/.test(src), `${rel} must not import echarts`)
}

const thumb = read('src/views/components/ThumbnailSlide/index.tsx')
assert(!/\bThumbnailElement\b/.test(thumb), 'ThumbnailSlide must not reference ThumbnailElement')
assert(!/\bensureStage\b/.test(thumb), 'ThumbnailSlide must not create empty stages on virtualized remount')
assert(thumb.includes('[slide.id, visible]'), 'host attach is keyed by slide identity, not dest size')
assert(!/slide\.elements/.test(thumb), 'ThumbnailSlide must not read slide.elements')
assert(
  !/\.elements\s*\.map\s*\(/.test(thumb) && !/elements\s*\.map\s*\(/.test(thumb),
  'ThumbnailSlide must not map slide.elements',
)

const load = read('src/hooks/useLoadSlides.ts')
assert(!/\bsetInterval\b/.test(load), 'useLoadSlides must not use a slidesLoadLimit setInterval')
assert(!/\+\s*20\b/.test(load), 'useLoadSlides must not ramp slidesLoadLimit by +20')
assert(!/\b600\b/.test(load), 'useLoadSlides must not use the 600ms load-limit timer')

const draggable = read('src/components/Draggable.tsx')
assert(draggable.includes('virtualRowBox'), 'rail drag uses layout top for virtual rows')
assert(!draggable.includes('composeRowTransform'), 'rail drag must not fold virtual Y into the dnd transform')
assert(!draggable.includes('toDataURL'), 'rail drag overlay must not PNG-encode on pointer down')
assert(draggable.includes('restrictDragToVertical'), 'rail drag stays on the vertical axis')
assert(draggable.includes('mergeActiveVirtualRow'), 'the dragged row stays mounted when it leaves the window')
assert(draggable.includes("addEventListener('wheel'"), 'rail drag forwards wheel to the scroller')
assert(draggable.includes('pointerEvents: \'none\'') || draggable.includes('pointerEvents: "none"'), 'drag overlay does not eat wheel')
assert(read('src/views/Editor/Thumbnails/index.tsx').includes('virtualizer={virtualizer}'), 'Thumbnails passes the virtualizer into Draggable')

const { virtualRowBox, restrictDragToVertical, mergeActiveVirtualRow, wheelDeltaPx, clampScrollTop } = await import(
  pathToFileURL(join(root, 'src/components/draggableLayout.ts')).href
)
const box = virtualRowBox({ start: 480, size: 120 }, { x: 12, y: 8 })
assert(box.top === 480, 'virtual row Y is layout top, not a translate')
assert(box.y === 8 && box.x === 12, 'dnd delta is applied separately from row.start')
assert(restrictDragToVertical({ transform: { x: 40, y: 9, scaleX: 1, scaleY: 1 } }).x === 0, 'vertical modifier zeros X')
const kept = mergeActiveVirtualRow([{ index: 2 }, { index: 3 }], 7, { index: 7, start: 900 })
assert(kept.some(row => row.index === 7), 'active row is spliced into the virtual window')
assert(mergeActiveVirtualRow([{ index: 4 }], 4, { index: 4 }).length === 1, 'already-visible active row is not duplicated')
assert(wheelDeltaPx(80, 0, 400) === 80, 'pixel wheel deltas stay pixels')
assert(wheelDeltaPx(3, 1, 400) === 48, 'line wheel deltas convert to pixels')
assert(clampScrollTop(10, -40, 200) === 0, 'wheel scroll clamps to the top')
assert(clampScrollTop(180, 40, 200) === 200, 'wheel scroll clamps to the bottom')

const handler = read('src/hooks/useSlideHandler.ts')
assert(!/JSON\.parse\(JSON\.stringify\(useSlidesStore\.getState\(\)\.slides\)\)/.test(handler), 'sortSlides must not deep-clone the deck')
assert(handler.includes('reorderSlides'), 'sortSlides uses the identity-preserving store action')
assert(read('src/store/slides.ts').includes('reorderSlidesPreservingIdentity'), 'store reorder keeps unchanged slide refs')

const { reorderSlidesPreservingIdentity } = await import(
  pathToFileURL(join(root, 'src/utils/slideOrder.ts')).href
)
const a = { id: 'a', elements: [{ id: 'ae' }], background: { type: 'solid' } }
const b = { id: 'b', elements: [{ id: 'be' }], background: { type: 'solid' } }
const c = { id: 'c', elements: [{ id: 'ce' }], background: { type: 'solid' } }
const reordered = reorderSlidesPreservingIdentity([a, b, c], 2, 0)
assert(reordered.map(slide => slide.id).join(',') === 'c,a,b', 'reorder moves the slide')
assert(reordered[0] === c && reordered[1] === a && reordered[2] === b, 'unchanged slides keep the same object identity')
assert(reordered[0].elements === c.elements && reordered[1].background === a.background, 'elements and background are not cloned')
const headed = { id: 'h', elements: [], sectionTag: { id: 's', title: 'Intro' } }
const body = { id: 'd', elements: [] }
const shifted = reorderSlidesPreservingIdentity([headed, body], 0, 1)
assert(shifted[0] !== headed && shifted[1] !== body, 'section handoff clones only the two touched slides')
assert(!shifted[1].sectionTag && shifted[0].sectionTag?.id === 's', 'section tag moves to the slide that stays at the start')

if (failures.length) {
  console.error('perf rail checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('perf rail checks passed')
