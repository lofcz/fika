import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Flatbush from 'flatbush'

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

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walk(abs, acc)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) acc.push(abs)
  }
  return acc
}

const spatialDir = join(root, 'src/utils/spatial')
assert(existsSync(spatialDir), 'src/utils/spatial exists')
const files = walk(spatialDir)
assert(files.length > 0, 'src/utils/spatial/* exists')

const joined = files.map(abs => readFileSync(abs, 'utf8')).join('\n')
assert(/\bfrom\s+['"]flatbush['"]/.test(joined), 'src/utils/spatial/* must import flatbush')
assert(/\bfrom\s+['"]rbush['"]/.test(joined), 'src/utils/spatial/* must import rbush')
assert(!/\bclass\s+\w*RTree\b/.test(joined), 'src/utils/spatial/* must not ship a custom R-tree class')
assert(!/\bfunction\s+(?:build|create|make)\w*RTree\b/.test(joined), 'src/utils/spatial/* must not build a custom R-tree')
assert(
  !/\b(?:insertQuad|splitNode|chooseLeaf|adjustTree)\b/.test(joined),
  'src/utils/spatial/* must not implement a custom tree',
)

for (const abs of files) {
  const rel = relative(root, abs).replace(/\\/g, '/')
  const src = readFileSync(abs, 'utf8')
  assert(!/\bclass\s+\w*RTree\b/.test(src), `${rel} must not define a custom R-tree`)
}

const snapSrc = readFileSync(join(spatialDir, 'snapIndex.ts'), 'utf8')
const hitSrc = readFileSync(join(spatialDir, 'hitIndex.ts'), 'utf8')
const barrelSrc = readFileSync(join(spatialDir, 'index.ts'), 'utf8')

assert(/export const buildSnapIndex/.test(snapSrc), 'snapIndex.ts exports buildSnapIndex')
assert(/export const querySnap/.test(snapSrc), 'snapIndex.ts exports querySnap')
assert(/export const boxesNear/.test(snapSrc), 'snapIndex.ts exports boxesNear')
assert(/new Flatbush\s*\(/.test(snapSrc), 'buildSnapIndex constructs Flatbush')
assert(/tree\.search\(/.test(snapSrc), 'querySnap uses Flatbush search()')
assert(/tree\.neighbors\(/.test(snapSrc), 'querySnap uses Flatbush neighbors() to cap K')

assert(/export class HitIndex/.test(hitSrc), 'hitIndex.ts exports HitIndex')
assert(/new RBush\s*[<(]/.test(hitSrc), 'HitIndex constructs RBush')
for (const method of ['insert', 'remove', 'search', 'load', 'clear', 'hitPoint']) {
  assert(new RegExp(String.raw`\b${method}\s*\(`).test(hitSrc), `HitIndex exposes ${method}()`)
}

assert(barrelSrc.includes('buildSnapIndex'), 'spatial barrel exports buildSnapIndex')
assert(barrelSrc.includes('querySnap'), 'spatial barrel exports querySnap')
assert(barrelSrc.includes('boxesNear'), 'spatial barrel exports boxesNear')
assert(barrelSrc.includes('queryLinesX'), 'spatial barrel exports queryLinesX')
assert(barrelSrc.includes('segmentSnapBoxes'), 'spatial barrel exports segmentSnapBoxes')
assert(barrelSrc.includes('HitIndex'), 'spatial barrel exports HitIndex')

const { buildSnapIndex, querySnap, boxesNear, queryLinesX, queryLinesY, SNAP_NEIGHBOR_K } = await import(
  pathToFileURL(join(spatialDir, 'snapIndex.ts')).href
)
const { HitIndex } = await import(pathToFileURL(join(spatialDir, 'hitIndex.ts')).href)
const { segmentSnapBoxes } = await import(pathToFileURL(join(spatialDir, 'segment.ts')).href)

const box = (minX, minY, width, height) => ({
  minX,
  maxX: minX + width,
  minY,
  maxY: minY + height,
})

const empty = buildSnapIndex([])
assert(empty.tree instanceof Flatbush, 'buildSnapIndex returns a Flatbush tree')
assert(empty.boxes.length === 0, 'empty snap index keeps no boxes')
assert(querySnap(empty, box(0, 0, 10, 10), 8).length === 0, 'querySnap on empty index is []')
assert(boxesNear(empty, box(0, 0, 10, 10), 8).length === 0, 'boxesNear on empty index is []')

const a = box(0, 0, 40, 20)
const b = box(200, 0, 40, 20)
const c = box(48, 0, 40, 20)
const index = buildSnapIndex([a, b, c])
assert(index.tree instanceof Flatbush, 'non-empty snap index wraps Flatbush')

const nearIds = querySnap(index, box(42, 0, 40, 20), 8)
assert(nearIds.includes(0) && nearIds.includes(2), 'querySnap returns nearby candidate ids')
assert(!nearIds.includes(1), 'querySnap excludes a far box')

const nearby = boxesNear(index, box(42, 0, 40, 20), 8)
assert(nearby.includes(a) && nearby.includes(c), 'boxesNear returns nearby SnapBox refs')
assert(!nearby.includes(b), 'boxesNear excludes a far SnapBox')
assert(boxesNear(index, box(80, 0, 40, 20), 80).includes(b), 'boxesNear pad expands the Flatbush search')

const hits = new HitIndex()
assert(hits.search(0, 0, 1, 1).length === 0, 'empty HitIndex search is []')
assert(hits.hitPoint(0, 0) === null, 'empty HitIndex hitPoint is null')

const low = { minX: 0, minY: 0, maxX: 100, maxY: 80, id: 'low', zIndex: 1 }
const high = { minX: 40, minY: 20, maxX: 140, maxY: 100, id: 'high', zIndex: 5 }
const far = { minX: 400, minY: 400, maxX: 440, maxY: 440, id: 'far', zIndex: 9 }
hits.insert(low)
hits.insert(high)
hits.insert(far)
assert(hits.search(50, 30, 50, 30).some(item => item.id === 'low'), 'search finds the lower box')
assert(hits.search(50, 30, 50, 30).some(item => item.id === 'high'), 'search finds the overlapping box')
assert(!hits.search(50, 30, 50, 30).some(item => item.id === 'far'), 'search misses a far box')
assert(hits.hitPoint(50, 30)?.id === 'high', 'hitPoint returns the highest zIndex')
assert(hits.hitPoint(420, 420)?.id === 'far', 'hitPoint finds an isolated box')
assert(hits.hitPoint(300, 300) === null, 'hitPoint misses empty space')

hits.remove({ minX: 0, minY: 0, maxX: 100, maxY: 80, id: 'low', zIndex: 1 })
assert(!hits.search(10, 10, 10, 10).some(item => item.id === 'low'), 'remove drops by id, not only reference')

hits.clear()
assert(hits.search(50, 30, 50, 30).length === 0, 'clear empties the RBush')

hits.load([low, high, far])
assert(hits.hitPoint(50, 30)?.id === 'high', 'load bulk-inserts into RBush')
hits.load([far])
assert(hits.hitPoint(50, 30) === null, 'load replaces the previous set')
assert(hits.hitPoint(420, 420)?.id === 'far', 'load keeps the replacement items')

const mapShards = []
for (let i = 0; i < 80; i++) {
  mapShards.push(box(20 + (i % 10) * 18, 20 + Math.floor(i / 10) * 14, 20, 16))
}
const segmented = segmentSnapBoxes(mapShards)
assert(segmented.length < 8, `RBush segmentation collapses 80 map shards to ${segmented.length} cluster(s)`)
const mapIndex = buildSnapIndex(mapShards)
assert(mapIndex.boxes.length === segmented.length, 'buildSnapIndex stores segmented boxes, not raw shards')
assert(mapIndex.metaX.length === mapIndex.boxes.length * 3, 'each snap box contributes 3 X lines')
assert(queryLinesX(mapIndex, segmented[0].minX, 1, -1e6, 1e6).length > 0, 'queryLinesX hits a clustered left edge')
assert(queryLinesY(mapIndex, segmented[0].minY, 1, -1e6, 1e6).length > 0, 'queryLinesY hits a clustered top edge')

const flood = []
for (let i = 0; i < 60; i++) flood.push(box(400 + i * 2, 80, 120, 80))
const floodIndex = buildSnapIndex(flood)
const floodIds = querySnap(floodIndex, box(420, 70, 40, 20), 240)
assert(floodIds.length <= SNAP_NEIGHBOR_K, `neighbors() caps a flood of overlaps at K=${SNAP_NEIGHBOR_K}`)

if (failures.length) {
  console.error('spatial checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('spatial checks passed')
