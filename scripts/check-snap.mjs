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

const {
  FINE_GRID_SIZE,
  GUIDE_PAD,
  RELATED_GAP,
  SNAP_THRESHOLD,
  boxCenterX,
  boxCenterY,
  formatMeasureLabel,
  formatSnapLabel,
  collectCtrlMeasures,
  projectMeasureCross,
  RELATION_WEIGHT,
  resolveGridSize,
  snapMovingBox,
  snapQueryPad,
  snapResizePoint,
  snapToGrid,
  translateBox,
  unionBoxes,
} = await import(pathToFileURL(join(root, 'src/utils/snap.ts')).href)
const { boxesNear, buildSnapIndex, querySnap } = await import(pathToFileURL(join(root, 'src/utils/spatial/index.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const canvas = { width: 1000, height: 562.5 }
const box = (minX, minY, width, height) => ({
  minX,
  maxX: minX + width,
  minY,
  maxY: minY + height,
})

assert(snapToGrid(13, 8) === 16, 'snapToGrid rounds 13 to 16 on an 8px grid')
assert(snapToGrid(10, 8) === 8, 'snapToGrid rounds 10 to 8 on an 8px grid')
assert(snapToGrid(24, 0) === 24, 'snapToGrid is a no-op when grid size is 0')
assert(resolveGridSize(0, true) === FINE_GRID_SIZE, 'Alt with no visible grid uses the fine 8px grid')
assert(resolveGridSize(50, true) === 50, 'Alt with a visible grid uses that size')
assert(resolveGridSize(50, false) === 50, 'smart mode keeps a visible layout grid')
assert(resolveGridSize(0, false) === 0, 'smart mode does not invent a grid')
assert(formatSnapLabel(24.4) === '24', 'spacing labels round to whole pixels')
assert(boxCenterX(box(10, 0, 40, 10)) === 30 && boxCenterY(box(0, 10, 10, 40)) === 30, 'box centers')

const translated = translateBox(box(10, 20, 30, 40), 5, -2)
assert(translated.minX === 15 && translated.minY === 18 && translated.maxX === 45 && translated.maxY === 58, 'translateBox')

const nearLeft = snapMovingBox(box(102, 40, 80, 40), [box(100, 200, 60, 30)], {
  mode: 'smart',
  canvas,
  gridSize: 0,
})
assert(nearLeft.offsetX === -2, 'closest left-edge snap wins over a farther miss')
assert(nearLeft.guides.some(guide => guide.type === 'vertical' && guide.kind === 'edge'), 'edge snap emits an ink edge guide')

const closerCenter = snapMovingBox(box(148, 10, 80, 20), [box(100, 200, 100, 40)], {
  mode: 'smart',
  canvas,
  gridSize: 0,
})
assert(Math.abs(closerCenter.offsetX - 2) < 0.01, 'center snap is used when it is the closest match')
assert(closerCenter.guides.some(guide => guide.kind === 'center'), 'center snap emits a center guide')

const firstLineWouldWin = snapMovingBox(box(52, 10, 40, 20), [box(50, 80, 40, 20), box(53, 90, 40, 20)], {
  mode: 'smart',
  canvas,
  gridSize: 0,
})
assert(firstLineWouldWin.offsetX === 1, 'closest match wins even when an earlier line is also in range')

const canvasCenter = snapMovingBox(box(496, 40, 80, 40), [], {
  mode: 'smart',
  canvas,
  gridSize: 0,
})
assert(Math.abs(canvasCenter.offsetX - 4) < 0.01, 'snaps to the slide center when it is closest')
assert(canvasCenter.guides.some(guide => guide.kind === 'center'), 'canvas center emits a center guide')

const a = box(40, 40, 80, 40)
const b = box(140, 40, 80, 40)
const moving = box(242, 40, 80, 40)
const spacing = snapMovingBox(moving, [a, b], {
  mode: 'smart',
  canvas,
  gridSize: 0,
})
assert(Math.abs(spacing.offsetX + 2) < 0.01, 'matches an existing 20px gap to the right of a neighbor')
assert(spacing.guides.some(guide => guide.kind === 'spacing' && guide.label === '20'), 'spacing snap shows the measured gap')

const between = snapMovingBox(box(138, 40, 80, 40), [box(40, 40, 80, 40), box(240, 40, 80, 40)], {
  mode: 'smart',
  canvas,
  gridSize: 0,
})
assert(Math.abs(between.offsetX - 2) < 0.01, 'centers a box in the gap between two neighbors')
assert(between.guides.filter(guide => guide.kind === 'spacing').length === 2, 'equal-gap snap draws both sides')

const gridForced = snapMovingBox(box(13, 21, 40, 20), [], {
  mode: 'grid',
  canvas,
  gridSize: 0,
})
assert(gridForced.offsetX === 3 && gridForced.offsetY === 3, 'grid mode always snaps to the fine grid')
assert(gridForced.guides.some(guide => guide.kind === 'grid'), 'grid mode still draws grid guides')

const gridWithAlign = snapMovingBox(box(102, 40, 40, 20), [box(100, 200, 40, 20)], {
  mode: 'grid',
  canvas,
  gridSize: 25,
})
assert(gridWithAlign.offsetX === -2, 'alt/grid still snaps onto the grid')
assert(gridWithAlign.guides.some(guide => guide.type === 'vertical' && guide.kind === 'edge'), 'alt/grid still shows object alignment guides')

const visibleGrid = snapMovingBox(box(46, 10, 20, 20), [], {
  mode: 'smart',
  canvas,
  gridSize: 50,
  threshold: 6,
})
assert(visibleGrid.offsetX === 4, 'a visible layout grid is a low-priority smart target')

const farAway = snapMovingBox(box(333, 222, 40, 20), [box(0, 0, 20, 20)], {
  mode: 'smart',
  canvas,
  gridSize: 0,
  threshold: 6,
})
assert(farAway.offsetX === 0 && farAway.offsetY === 0, 'nothing snaps outside the threshold')

const resize = snapResizePoint(123, null, [box(40, 80, 80, 30)], {
  mode: 'smart',
  canvas,
  gridSize: 0,
  moving: box(40, 40, 83, 40),
  resizeWidth: true,
})
assert(resize.offsetX === 3, 'resize snaps a moving edge to a neighbor edge')

const sizeMatch = snapResizePoint(203, null, [box(10, 200, 80, 30)], {
  mode: 'smart',
  canvas,
  gridSize: 0,
  moving: box(120, 40, 83, 40),
  resizeWidth: true,
})
assert(sizeMatch.offsetX === 3, 'resize snaps width to a matching neighbor')
assert(sizeMatch.guides.some(guide => guide.kind === 'size' && guide.label === '80'), 'size snap labels the matched width')

const resizeGrid = snapResizePoint(13, 21, [], {
  mode: 'grid',
  canvas,
  gridSize: 8,
})
assert(resizeGrid.offsetX === -3 && resizeGrid.offsetY === -3, 'resize grid mode snaps the moving point')

assert(GUIDE_PAD === 14, 'guides keep a short ink overshoot')
assert(formatMeasureLabel(24.4) === '24px', 'ctrl measure labels include px')
assert(unionBoxes([box(10, 20, 30, 40), box(50, 10, 20, 80)]).minX === 10
  && unionBoxes([box(10, 20, 30, 40), box(50, 10, 20, 80)]).maxX === 70
  && unionBoxes([box(10, 20, 30, 40), box(50, 10, 20, 80)]).minY === 10
  && unionBoxes([box(10, 20, 30, 40), box(50, 10, 20, 80)]).maxY === 90, 'unionBoxes wraps a selection')
assert(unionBoxes([]) === null, 'unionBoxes is null for an empty selection')

const stacked = collectCtrlMeasures(
  box(40, 40, 80, 40),
  [box(40, 120, 80, 40)],
  canvas,
  [{ type: 'vertical', kind: 'edge', axis: { x: 40, y: 26 }, length: 148, marks: [40, 120, 160] }],
)
assert(stacked.some(guide => guide.kind === 'measure' && guide.type === 'vertical' && guide.label === '40px'), 'ctrl + vertical guide measures the Y gap')

const sideBySide = collectCtrlMeasures(
  box(40, 40, 80, 40),
  [box(160, 40, 80, 40)],
  canvas,
  [{ type: 'horizontal', kind: 'edge', axis: { x: 26, y: 40 }, length: 228, marks: [40, 120, 160, 240] }],
)
assert(sideBySide.some(guide => guide.type === 'horizontal' && guide.label === '40px'), 'ctrl + horizontal guide measures the X gap')

const idleNearest = collectCtrlMeasures(box(200, 200, 80, 40), [box(40, 200, 80, 40), box(200, 40, 80, 40)], canvas, [])
assert(idleNearest.some(guide => guide.type === 'horizontal' && guide.label === '80px'), 'idle ctrl measures the nearest neighbor on X')
assert(idleNearest.some(guide => guide.type === 'vertical' && guide.label === '120px'), 'idle ctrl measures the nearest neighbor on Y')

const skipLabeled = collectCtrlMeasures(
  box(40, 40, 80, 40),
  [box(140, 40, 80, 40)],
  canvas,
  [{ type: 'horizontal', kind: 'spacing', axis: { x: 120, y: 60 }, length: 20, label: '20' }],
)
assert(!skipLabeled.some(guide => guide.kind === 'measure' && guide.length === 20), 'ctrl does not duplicate an existing spacing label')

const preferNearby = snapMovingBox(box(53, 40, 40, 20), [box(50, 80, 40, 20), box(56, 400, 40, 20)], {
  mode: 'smart',
  canvas,
  gridSize: 0,
})
assert(preferNearby.offsetX === -3, 'a nearby object wins over a slightly closer distant one')

const chain = collectCtrlMeasures(
  box(40, 40, 80, 40),
  [box(40, 100, 80, 40), box(40, 180, 80, 40)],
  canvas,
  [{ type: 'vertical', kind: 'edge', axis: { x: 40, y: 26 }, length: 208 }],
)
assert(chain.filter(guide => guide.type === 'vertical' && (guide.label === '20px' || guide.label === '40px')).length >= 2, 'ctrl walks the gap chain on a shared edge')

const margins = collectCtrlMeasures(box(80, 60, 40, 20), [], canvas, [])
assert(margins.some(guide => guide.type === 'horizontal' && guide.label === '80px'), 'ctrl shows the slide left margin when no neighbor is closer')
assert(margins.some(guide => guide.type === 'vertical' && guide.label === '60px'), 'ctrl shows the slide top margin when no neighbor is closer')
assert(!margins.some(guide => guide.length > 200), 'ctrl hides far slide-edge distances when they are not useful')

const farChain = collectCtrlMeasures(
  box(40, 40, 80, 40),
  [box(40, 400, 80, 40)],
  canvas,
  [{ type: 'vertical', kind: 'edge', axis: { x: 40, y: 26 }, length: 428 }],
)
assert(!farChain.some(guide => guide.label === '320px'), 'ctrl does not measure a distant object that only shares an X')

// Screenshot repro: title (top-left) + bullet (left) + selected code (right).
// Vertical measures must sit on the selected box, not in the empty gutter.
const titleBox = box(80, 36, 320, 48)
const bulletBox = box(80, 220, 200, 36)
const codeBox = box(450, 200, 280, 140)
const screenshotCtrl = collectCtrlMeasures(codeBox, [titleBox, bulletBox], canvas, [])
const screenshotVertical = screenshotCtrl.filter(guide => guide.type === 'vertical')
assert(screenshotVertical.length > 0, 'ctrl on a fika-like slide emits vertical measures')
for (const guide of screenshotVertical) {
  assert(
    guide.axis.x >= codeBox.minX - 0.51 && guide.axis.x <= codeBox.maxX + 0.51,
    `ctrl vertical measure x=${guide.axis.x} must stay on the selected code box [${codeBox.minX}, ${codeBox.maxX}] (got detached gutter line)`,
  )
}
const screenshotHorizontal = screenshotCtrl.filter(guide => guide.type === 'horizontal')
for (const guide of screenshotHorizontal) {
  assert(
    guide.axis.y >= codeBox.minY - 0.51 && guide.axis.y <= codeBox.maxY + 0.51,
    `ctrl horizontal measure y=${guide.axis.y} must stay on the selected code box [${codeBox.minY}, ${codeBox.maxY}]`,
  )
}
const titleGap = screenshotVertical.find(guide => guide.label === '116px' || guide.length > 100 && guide.length < 130)
assert(titleGap, 'ctrl measures the title-to-code gap')
assert(
  !screenshotVertical.some(guide => guide.axis.x > bulletBox.maxX && guide.axis.x < codeBox.minX),
  'ctrl must not park a vertical measure in the gutter between the bullet and the code',
)
assert(RELATION_WEIGHT >= 4, 'relation weight prefers same-row/column objects')
assert(projectMeasureCross(450, 730, 80, 400) === 590, 'non-overlapping vertical measure projects onto the moving center')
assert(projectMeasureCross(200, 340, 36, 84) === 270, 'non-overlapping horizontal measure projects onto the moving center')
assert(projectMeasureCross(200, 340, 220, 256) === 238, 'overlapping row uses the shared span center')

const liveCtrl = snapMovingBox(codeBox, [titleBox, bulletBox], {
  mode: 'smart',
  canvas,
  gridSize: 0,
  ctrlMeasures: true,
})
assert(liveCtrl.guides.some(guide => guide.kind === 'measure'), 'snapMovingBox can emit ctrl measures from the live box')
assert(
  liveCtrl.guides.filter(guide => guide.kind === 'measure' && guide.type === 'vertical')
    .every(guide => guide.axis.x >= codeBox.minX && guide.axis.x <= codeBox.maxX),
  'live ctrl measures stay on the moving box',
)
assert(
  !snapMovingBox(codeBox, [titleBox, bulletBox], { mode: 'smart', canvas, gridSize: 0 }).guides
    .some(guide => guide.kind === 'measure'),
  'ctrl measures stay off the regular drag path',
)

const snapSrc = readFileSync(join(root, 'src/utils/snap.ts'), 'utf8')
assert(/collectGaps\(nearby/.test(snapSrc), 'collectGaps is invoked on the nearby k-set')
assert(!/collectGaps\(\s*others/.test(snapSrc), 'collectGaps is not called on the full others list')
assert(/boxesNear\(/.test(snapSrc), 'per-move snap queries boxesNear on the spatial index')
assert(/queryLinesX\(/.test(snapSrc) && /queryLinesY\(/.test(snapSrc), 'alignment queries 1D Flatbush line indexes')
assert(/snapQueryPad\(/.test(snapSrc), 'per-move search pad is threshold / RELATED_GAP')
assert(snapQueryPad(SNAP_THRESHOLD) === Math.max(SNAP_THRESHOLD, RELATED_GAP), 'snapQueryPad is max(threshold, RELATED_GAP)')
assert(snapQueryPad(400) === 400, 'snapQueryPad grows when the threshold exceeds RELATED_GAP')

const indexedSpacing = snapMovingBox(moving, [a, b], {
  mode: 'smart',
  canvas,
  gridSize: 0,
  index: buildSnapIndex([a, b]),
})
assert(Math.abs(indexedSpacing.offsetX - spacing.offsetX) < 0.01, 'prebuilt index matches a rebuilt index for spacing')
assert(indexedSpacing.guides.some(guide => guide.kind === 'spacing' && guide.label === '20'), 'prebuilt index still emits spacing guides')

const densityN = 120
const cell = RELATED_GAP + 160
const densityOthers = []
for (let i = 0; i < densityN; i++) {
  const col = i % 12
  const row = Math.floor(i / 12)
  densityOthers.push(box(col * cell, row * cell, 48, 24))
}
const densityMoving = box(6, 6, 48, 24)
const densityIndex = buildSnapIndex(densityOthers)
const densityPad = snapQueryPad(SNAP_THRESHOLD)
const densityIds = querySnap(densityIndex, densityMoving, densityPad)
const densityNearby = boxesNear(densityIndex, densityMoving, densityPad)
assert(densityOthers.length === 120, 'density fixture uses 120 boxes')
assert(densityNearby.length === densityIds.length, 'boxesNear matches querySnap ids')
assert(densityNearby.length < densityN / 8, `nearby count ${densityNearby.length} is far below n=${densityN}`)
assert(densityNearby.length * densityNearby.length < (densityN * densityN) / 16, 'k² is far below n²')
assert(densityNearby.some(item => item.minX === 0 && item.minY === 0), 'the one nearby cell is in the k-set')

const densitySnap = snapMovingBox(densityMoving, densityOthers, {
  mode: 'smart',
  canvas: { width: 12 * cell, height: 10 * cell },
  gridSize: 0,
  index: densityIndex,
})
assert(densitySnap.offsetX === -6, 'dense deck still snaps to the nearby box, not all pairs')
assert(densitySnap.guides.some(guide => guide.type === 'vertical' && guide.kind === 'edge'), 'dense deck still emits an edge guide')

const clustered = []
for (let i = 0; i < 80; i++) {
  clustered.push(box(20 + (i % 8) * 28, 20 + Math.floor(i / 8) * 22, 20, 16))
}
const clusteredMoving = box(700, 400, 20, 16)
const clusteredNearby = boxesNear(buildSnapIndex(clustered), clusteredMoving, densityPad)
assert(clustered.length === 80, 'clustered fixture uses 80 boxes')
assert(clusteredNearby.length === 0, 'a far mover sees none of an 80-box cluster outside the pad')

const t0 = performance.now()
for (let i = 0; i < 80; i++) {
  snapMovingBox(densityMoving, densityOthers, {
    mode: 'smart',
    canvas: { width: 12 * cell, height: 10 * cell },
    gridSize: 0,
    index: densityIndex,
  })
}
const elapsed = performance.now() - t0
assert(elapsed < 250, `80 indexed snaps over 120 boxes stay cheap (${elapsed.toFixed(1)}ms)`)

const mapOthers = []
for (let i = 0; i < 200; i++) {
  mapOthers.push(box(40 + (i % 20) * 16, 40 + Math.floor(i / 20) * 12, 20, 14))
}
const mapMoving = box(80, 48, 48, 24)
const mapIndex = buildSnapIndex(mapOthers)
assert(mapIndex.boxes.length < 8, `200 touching map shards segment to ${mapIndex.boxes.length} cluster(s)`)
const mapT0 = performance.now()
for (let i = 0; i < 80; i++) {
  snapMovingBox(mapMoving, mapOthers, {
    mode: 'smart',
    canvas,
    gridSize: 0,
    index: mapIndex,
  })
}
const mapElapsed = performance.now() - mapT0
assert(mapElapsed < 80, `80 snaps over a 200-shard map stay cheap (${mapElapsed.toFixed(1)}ms)`)

if (failures.length) {
  console.error('snap checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('snap checks passed')
