import { existsSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
    const without = specifier.slice(2)
    const candidates = [
      join(srcDir, without + '.ts'),
      join(srcDir, without + '.js'),
      join(srcDir, without, 'index.ts'),
      join(srcDir, without),
    ]
    const file = candidates.find(path => existsSync(path) && statSync(path).isFile())
    if (!file) return nextResolve(specifier, context)
    return { url: pathToFileURL(file).href, shortCircuit: true }
  },
})
const {
  MIN_HIT_PX,
  MAX_INNER_DRAG_PX,
  MAX_OUTER_DRAG_PX,
  MIN_INNER_DRAG_PX,
  MIN_OUTER_DRAG_PX,
  RING_SIZE_MIN,
  dragRingMetrics,
  hitRingLayout,
  elementVisualHitRect,
  pointInVisualHitRect,
  hitTestVisualRects,
  elementIdsIntersectingSelection,
  isPointOnVisualBorder,
  isPointOnResizeHandle,
  hitTestOperateTarget,
  resizeHandleDirectionsFor,
  RESIZE_HANDLE_DIRECTIONS,
  clicksToEditText,
  hasInteractiveSurface,
  hitRectClipPath,
  visualHitRectsOverlap,
  collectVisualHitPlan,
  pointInAnyVisualHitRect,
  occludersAboveRect,
} = await import(pathToFileURL(join(root, 'src/utils/canvasHitTest.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const box = {
  id: 'a',
  type: 'text',
  left: 100,
  top: 50,
  width: 200,
  height: 80,
  rotate: 0,
}
const visual = elementVisualHitRect(box, 2, 3)
assert(visual.left === 200 && visual.top === 100, 'scales left/top by canvasScale')
assert(visual.width === 400 && visual.height === 160, 'scales width/height by canvasScale')
assert(visual.zIndex === 3 && visual.rotate === 0, 'preserves zIndex and rotate')

assert(pointInVisualHitRect(200, 100, visual), 'top-left corner is inside')
assert(pointInVisualHitRect(400, 180, visual), 'center is inside')
assert(pointInVisualHitRect(600, 260, visual), 'bottom-right corner is inside')
assert(!pointInVisualHitRect(199, 180, visual), 'left of box is outside')
assert(!pointInVisualHitRect(400, 99, visual), 'above box is outside')

const overlapLow = { ...visual, id: 'low', zIndex: 1 }
const overlapHigh = { ...visual, id: 'high', left: 350, zIndex: 5 }
const topmost = hitTestVisualRects([overlapLow, overlapHigh], 400, 180)
assert(topmost && topmost.id === 'high', 'overlapping rects: highest zIndex wins')

const stackedHigh = { id: 'stacked-high', left: 0, top: 0, width: 100, height: 100, rotate: 0, zIndex: 8 }
const stackedLow = { id: 'stacked-low', left: 0, top: 0, width: 100, height: 100, rotate: 0, zIndex: 2 }
assert(
  hitTestVisualRects([stackedHigh, stackedLow], 50, 50)?.id === 'stacked-high',
  'index z-order: highest zIndex wins when the high rect is listed first',
)
assert(
  hitTestVisualRects([stackedLow, stackedHigh], 50, 50)?.id === 'stacked-high',
  'index z-order: highest zIndex wins when the high rect is listed last',
)
assert(
  hitTestVisualRects([{ ...stackedHigh }, { ...stackedLow }], 50, 50)?.id === 'stacked-high',
  'index z-order still wins after a geometry-identity sync (new array, same fields)',
)

const miss = hitTestVisualRects([visual], 0, 0)
assert(miss === null, 'empty space hits nothing')

const line = {
  id: 'line',
  type: 'line',
  left: 10,
  top: 10,
  width: 1,
  start: [0, 0],
  end: [2, 0],
}
const lineRect = elementVisualHitRect(line, 1, 1)
assert(lineRect.height >= MIN_HIT_PX, 'thin lines get a minimum hit size')

const rotated = elementVisualHitRect({ ...box, rotate: 90 }, 1, 1)
assert(pointInVisualHitRect(200, 90, rotated), 'rotated box still contains its visual center')
assert(!pointInVisualHitRect(100, 50, rotated), 'rotated box does not keep the unrotated top-left')
assert(hitTestVisualRects([rotated], 200, 90)?.id === rotated.id, 'rotated center hits via AABB search + refine')
assert(hitTestVisualRects([rotated], 100, 50) === null, 'unrotated corner misses after pointInVisualHitRect refine')

const diamond = { id: 'diamond', left: 0, top: 0, width: 100, height: 100, rotate: 45, zIndex: 1 }
assert(hitTestVisualRects([diamond], 50, 50)?.id === 'diamond', '45° rect center hits via rotated AABB')
assert(hitTestVisualRects([diamond], 50, -15)?.id === 'diamond', 'point outside the unrotated box still hits the rotated AABB')
assert(hitTestVisualRects([diamond], 0, 0) === null, 'AABB candidate outside the OBB is rejected by refine')

assert(isPointOnVisualBorder(200, 100, visual), 'top edge is a drag border')
assert(isPointOnVisualBorder(200 + MAX_INNER_DRAG_PX, 180, visual), 'left edge is a drag border')
assert(!isPointOnVisualBorder(200 + MAX_INNER_DRAG_PX + 1, 180, visual), 'just inside the left ring is edit')
assert(!isPointOnVisualBorder(400, 180, visual), 'center is interior, not a drag border')
assert(!isPointOnVisualBorder(0, 0, visual), 'far outside the box is not a drag border')
assert(
  isPointOnVisualBorder(400, 100 - MAX_OUTER_DRAG_PX, visual),
  'outer grab just above the box is a move ring (same as CSS)',
)
assert(
  !isPointOnVisualBorder(400, 100 - MAX_OUTER_DRAG_PX - 1, visual),
  'beyond the outer grab is not a move ring',
)
assert(
  hitTestOperateTarget(400, 100 - MAX_OUTER_DRAG_PX, visual, { interactive: true }) === 'move',
  'operate hit-test and the CSS ring agree on the outer grab',
)

const tall = dragRingMetrics(160)
assert(tall.innerPx === MAX_INNER_DRAG_PX, 'tall boxes clamp inner drag to max')
assert(tall.outerPx === MAX_OUTER_DRAG_PX, 'tall boxes clamp outer grab to max')

const atMin = dragRingMetrics(RING_SIZE_MIN)
assert(atMin.innerPx === MIN_INNER_DRAG_PX, 'inner is the min at RING_SIZE_MIN')
assert(atMin.outerPx === MIN_OUTER_DRAG_PX, 'outer is the min at RING_SIZE_MIN')

const short = dragRingMetrics(10)
assert(short.innerPx === 0, 'a 10px-tall box keeps the full interior for edit')
assert(short.outerPx === MIN_OUTER_DRAG_PX, 'short boxes still have an outside grab strip')

const mid = dragRingMetrics(38)
assert(mid.innerPx > atMin.innerPx, 'inner grows with height between min and max')
assert(mid.innerPx < MAX_INNER_DRAG_PX, 'mid height stays below max inner')
assert(mid.outerPx >= MIN_OUTER_DRAG_PX && mid.outerPx <= MAX_OUTER_DRAG_PX, 'outer stays in min-max')

const thinLayout = hitRingLayout(400, 10)
assert(thinLayout.vertical.innerPx === 0, 'short height does not eat the edit interior')
assert(thinLayout.inset.startsWith('0px '), 'edit inset is 0 on the short axis')

const thin = { id: 'thin', left: 0, top: 0, width: 400, height: 10, rotate: 0, zIndex: 1 }
assert(!isPointOnVisualBorder(200, 5, thin), 'center of a 10px-tall box is interior')
assert(isPointOnVisualBorder(200, 0, thin), 'top edge of a short box is the move ring (inner is 0, outer still grabs)')
assert(isPointOnVisualBorder(200, -MIN_OUTER_DRAG_PX, thin), 'outer grab above a short box is move')
assert(!isPointOnVisualBorder(200, 1, thin), 'just inside a short box stays edit')
const tooThin = { ...thin, height: 5 }
assert(!isPointOnVisualBorder(200, 2, tooThin), 'center of a 5px-tall box is still edit')
assert(isPointOnVisualBorder(200, -1, tooThin), 'a 5px-tall box still has an outside grab strip')

const tableEl = { id: 'table', type: 'table', left: 100, top: 50, width: 200, height: 80, rotate: 0 }
assert(resizeHandleDirectionsFor(tableEl).length === 8, 'tables expose all eight resize handles')
assert(isPointOnResizeHandle(200, 100, visual), 'top-left corner is a resize handle')
assert(isPointOnResizeHandle(400, 100, visual), 'top-mid edge is a resize handle')
assert(isPointOnResizeHandle(600, 260, visual), 'bottom-right corner is a resize handle')
assert(!isPointOnResizeHandle(300, 100, visual), 'between top-left and top-mid is not a handle')

const tableOpts = { interactive: true, handles: RESIZE_HANDLE_DIRECTIONS }
assert(hitTestOperateTarget(200, 100, visual, tableOpts) === 'resize', 'resize beats move at the corner')
assert(hitTestOperateTarget(400, 100, visual, tableOpts) === 'resize', 'resize beats move at the top handle')
assert(hitTestOperateTarget(200, 180, visual, tableOpts) === 'resize', 'resize beats move at the left handle')
assert(
  !isPointOnVisualBorder(200, 100, visual, { clearResizeHandles: RESIZE_HANDLE_DIRECTIONS }),
  'cleared move ring does not claim the corner handle',
)
assert(
  isPointOnVisualBorder(300, 100, visual, { clearResizeHandles: RESIZE_HANDLE_DIRECTIONS }),
  'move ring still owns the top edge between handles',
)
assert(hitTestOperateTarget(300, 100, visual, tableOpts) === 'move', 'top edge between handles is still move')
assert(hitTestOperateTarget(400, 180, visual, tableOpts) === 'edit', 'center stays edit')
assert(
  hitTestOperateTarget(200, 100, visual, { interactive: true }) === 'move',
  'without visible handles the corner is move (unselected ring)',
)

assert(resizeHandleDirectionsFor({ type: 'text' }).join() === 'left,right', 'text boxes only have left/right handles')
assert(
  resizeHandleDirectionsFor({ type: 'shape', text: { fixedHeight: false } }).join() === 'left,right',
  'auto-height shape text only has left/right handles',
)
assert(resizeHandleDirectionsFor({ type: 'shape', text: { content: 'Hi' } }).length === 8, 'fixed shape text keeps all eight handles')
assert(
  hitTestOperateTarget(200, 100, visual, { interactive: true, handles: ['left', 'right'] }) === 'move',
  'text corners stay move because those handles are not rendered',
)

const clearedRing = hitRingLayout(400, 160, { clearResizeHandles: RESIZE_HANDLE_DIRECTIONS })
assert(typeof clearedRing.sides.top.clipPath === 'string', 'selected move ring clips handle squares on the top strip')
assert(typeof clearedRing.sides.left.clipPath === 'string', 'selected move ring clips handle squares on the left strip')
assert(!hitRingLayout(400, 160).sides.top.clipPath, 'unselected move ring keeps full strips')

assert(clicksToEditText({ type: 'text', content: '<p>Hi</p>' }), 'text boxes click-to-edit')
assert(clicksToEditText({ type: 'shape', text: { content: '<p>Zlomky</p>' } }), 'shapes with text click-to-edit')
assert(!clicksToEditText({ type: 'shape' }), 'empty shapes do not click-to-edit')
assert(!clicksToEditText({ type: 'image' }), 'images do not click-to-edit')
assert(hasInteractiveSurface({ type: 'video' }), 'video interiors stay interactive')
assert(hasInteractiveSurface({ type: 'audio' }), 'audio interiors stay interactive')
assert(hasInteractiveSurface({ type: 'text', content: '<p>Hi</p>' }), 'text interiors stay interactive')
assert(!hasInteractiveSurface({ type: 'image' }), 'images do not keep an interactive interior')

const underText = { id: 'text', left: 0, top: 0, width: 400, height: 200, rotate: 0, zIndex: 1 }
const overVideo = { id: 'video', left: 80, top: 40, width: 200, height: 100, rotate: 0, zIndex: 4 }
assert(visualHitRectsOverlap(underText, overVideo), 'overlapping text and video are detected')
const marqueeHit = elementIdsIntersectingSelection(
  [box, { ...box, id: 'far', left: 800 }],
  { left: 200, top: 100, width: 50, height: 50 },
  2,
)
assert(marqueeHit.includes('a') && !marqueeHit.includes('far'), 'marquee search hits only overlapping elements')
const marqueeMiss = elementIdsIntersectingSelection([box], { left: 0, top: 0, width: 10, height: 10 }, 2)
assert(marqueeMiss.length === 0, 'marquee search misses a distant box')
const frame = { ...box, id: 'frame', type: 'shape', frame: { clipContent: true }, lock: true }
const framedChild = { ...box, id: 'framed-child', parentFrameId: 'frame', groupId: 'shared-group' }
const outsideSibling = { ...box, id: 'outside-sibling', left: 800, groupId: 'shared-group' }
for (const [parent, hidden] of [[frame, []], [{ ...frame, lock: false }, new Set(['frame'])]]) {
  const groupHit = elementIdsIntersectingSelection([parent, framedChild, outsideSibling], { left: 800, top: 50, width: 50, height: 50 }, 1, hidden)
  assert(groupHit.join() === 'outside-sibling', 'group expansion cannot reintroduce a child of a restricted frame')
  const allHit = elementIdsIntersectingSelection([parent, framedChild, outsideSibling], { left: 0, top: 0, width: 1200, height: 300 }, 1, hidden)
  assert(allHit.join() === 'outside-sibling', 'marquee excludes inherited frame restrictions for array and Set visibility inputs')
}
for (const rotate of [45, -45, 30, -30, 135, 225]) {
  const rotated = { ...box, id: 'rotated-box', left: 200, top: 200, width: 200, height: 200, rotate }
  for (const scale of [.5, 1, 2]) {
    const empty = elementIdsIntersectingSelection([rotated], { left: 150*scale, top: 150*scale, width: 50*scale, height: 50*scale }, scale)
    assert(empty.length === 0, 'rotated bounding-box corners are not selectable')
    const visible = elementIdsIntersectingSelection([rotated], { left: 150*scale, top: 150*scale, width: 160*scale, height: 160*scale }, scale)
    assert(visible.join() === 'rotated-box', 'selection crossing a rotated rectangle remains selectable at every zoom')
  }
}
const rotatedFrame = { ...box, id: 'rotated-frame', type: 'shape', left: 0, top: 0, width: 100, height: 100, rotate: 45, frame: { clipContent: true } }
const oversizedChild = { ...box, id: 'oversized-child', left: -50, top: -50, width: 200, height: 200, parentFrameId: rotatedFrame.id }
for (const scale of [1, 2]) {
  const clippedCorner = elementIdsIntersectingSelection([rotatedFrame, oversizedChild], { left: -20*scale, top: -20*scale, width: 10*scale, height: 10*scale }, scale)
  assert(!clippedCorner.includes(oversizedChild.id), 'rotated frame corners clip marquee hits at every zoom')
  const visibleCenter = elementIdsIntersectingSelection([rotatedFrame, oversizedChild], { left: 45*scale, top: 45*scale, width: 10*scale, height: 10*scale }, scale)
  assert(visibleCenter.includes(oversizedChild.id), 'visible child area remains selectable through a rotated clip')
}
const outerClip = { ...rotatedFrame, id: 'outer-clip', rotate: 0, width: 50, height: 50 }
const innerClip = { ...rotatedFrame, id: 'inner-clip', rotate: 0, left: 25, top: 25, parentFrameId: outerClip.id }
const nestedChild = { ...oversizedChild, left: 80, top: 80, width: 20, height: 20, parentFrameId: innerClip.id }
assert(!elementIdsIntersectingSelection([outerClip, innerClip, nestedChild], { left: 80, top: 80, width: 10, height: 10 }, 1).includes(nestedChild.id), 'outer clipping constrains children of nested frames')
assert(!elementIdsIntersectingSelection([outerClip, { ...innerClip, left: 100 }, nestedChild], { left: 80, top: 80, width: 10, height: 10 }, 1).includes(nestedChild.id), 'disjoint nested frame clips have no selectable child area')
const clip = hitRectClipPath(underText, [overVideo])
assert(typeof clip === 'string' && clip.startsWith('path(evenodd,'), 'selected media punches a hole in lower hit rects')
assert(clip.includes('M80 40'), 'hole starts at the video origin in local coordinates')
assert(typeof hitRectClipPath(underText, [{ ...overVideo, zIndex: 1 }]) === 'string', 'overlapping media clips even at the same stack level')
assert(hitRectClipPath(underText, [{ ...overVideo, left: 900, top: 900 }]) === undefined, 'non-overlapping media does not clip')

const selectedBody = { id: 'body', left: 20, top: 40, width: 200, height: 80, rotate: 0, zIndex: 4 }
const belowCard = { id: 'card', left: 0, top: 0, width: 280, height: 200, rotate: 0, zIndex: 1 }
const aboveTitle = { id: 'title', left: 20, top: 20, width: 200, height: 50, rotate: 0, zIndex: 6 }
assert(typeof hitRectClipPath(belowCard, [selectedBody]) === 'string', 'lower cards are punched by a higher selected text')
assert(hitRectClipPath(aboveTitle, [selectedBody]) === undefined, 'higher text stays solid over a lower selected occluder')
assert(occludersAboveRect(belowCard, [selectedBody, aboveTitle]).map(r => r.id).join() === 'body,title', 'occludersAboveRect keeps equal-or-higher stack')
assert(occludersAboveRect(aboveTitle, [selectedBody]).length === 0, 'a lower selected box is not an occluder for a higher hit rect')

const cardEl = { id: 'card', type: 'shape', left: 0, top: 0, width: 280, height: 200, rotate: 0 }
const bodyEl = { id: 'body', type: 'text', left: 20, top: 60, width: 200, height: 80, rotate: 0, content: '<p>Body</p>' }
const titleEl = { id: 'title', type: 'text', left: 20, top: 20, width: 200, height: 60, rotate: 0, content: '<p>Title</p>' }
const stacked = [cardEl, bodyEl, titleEl]
const editingPlan = collectVisualHitPlan({
  elementList: stacked,
  canvasScale: 1,
  hiddenElementIdList: [],
  activeElementIdList: ['body'],
  editingElementId: 'body',
  clipingImageElementId: '',
})
assert(editingPlan.occluderRects.map(r => r.id).join() === 'body', 'editing text is an occluder, not a hit target')
assert(editingPlan.hitRects.map(r => r.id).join() === 'card,title', 'unselected siblings stay hittable')
assert(typeof hitRectClipPath(editingPlan.hitRects[0], editingPlan.occluderRects) === 'string', 'the card under editing text is clipped')
assert(hitRectClipPath(editingPlan.hitRects[1], editingPlan.occluderRects) === undefined, 'the title above editing text is not clipped')
assert(pointInAnyVisualHitRect(120, 100, editingPlan.occluderRects), 'a point on the editing text is inside the occluder')
assert(!pointInAnyVisualHitRect(120, 40, editingPlan.occluderRects), 'a point on the higher title is not inside the body occluder')

const idlePlan = collectVisualHitPlan({
  elementList: stacked,
  canvasScale: 1,
  hiddenElementIdList: [],
  activeElementIdList: [],
  editingElementId: '',
  clipingImageElementId: '',
})
assert(idlePlan.occluderRects.length === 0, 'nothing is an occluder before selection')
assert(idlePlan.hitRects.map(r => r.id).join() === 'card,body,title', 'every box is hittable before selection')

for (const hidden of [[], ['frame']]) {
  const plan = collectVisualHitPlan({ elementList: [frame, framedChild], canvasScale: 1, hiddenElementIdList: hidden, activeElementIdList: ['framed-child'], editingElementId: 'framed-child', clipingImageElementId: '' })
  assert([...plan.hitRects, ...plan.occluderRects, ...plan.contentRects].every(rect => rect.id !== 'framed-child'), 'restricted descendants contribute no pointer targets or occlusion holes')
  assert(plan.hitRects.some(rect => rect.id === 'frame') === !hidden.length, 'locked frames stay available for unlocking while hidden frames have no target')
}

const canvasHitSrc = readFileSync(join(root, 'src/utils/canvasHitTest.ts'), 'utf8')
const hitFnStart = canvasHitSrc.indexOf('export function hitTestVisualRects')
const hitFnEnd = canvasHitSrc.indexOf('export const TEXT_EDITABLE_TYPES')
const hitFn = hitFnStart >= 0 && hitFnEnd > hitFnStart ? canvasHitSrc.slice(hitFnStart, hitFnEnd) : ''
assert(hitFn.includes('search'), 'hitTestVisualRects queries the spatial index')
assert(!hitFn.includes('.find('), 'hitTestVisualRects does not use .find in the candidate loop')
assert(canvasHitSrc.includes('searchIndexedVisualHitRects'), 'marquee and hit-test share an index search helper')
const marqueeFnStart = canvasHitSrc.indexOf('export function elementIdsIntersectingSelection')
const marqueeFnEnd = canvasHitSrc.indexOf('export function visualHitAabb')
const marqueeFn = marqueeFnStart >= 0 && marqueeFnEnd > marqueeFnStart ? canvasHitSrc.slice(marqueeFnStart, marqueeFnEnd) : ''
assert(marqueeFn.includes('searchIndexedVisualHitRects'), 'marquee intersection uses the spatial index')
assert(!marqueeFn.includes('.find('), 'marquee intersection does not use .find in the candidate loop')

const hitLayerSrc = readFileSync(join(root, 'src/views/Editor/Canvas/HitLayer.tsx'), 'utf8')
const operateSrc = readFileSync(join(root, 'src/views/Editor/Canvas/Operate/index.tsx'), 'utf8')
const canvasSrc = readFileSync(join(root, 'src/views/Editor/Canvas/index.tsx'), 'utf8')
const multiSrc = readFileSync(join(root, 'src/views/Editor/Canvas/Operate/MultiSelectOperate.tsx'), 'utf8')
assert(hitLayerSrc.includes('selectElement(e.nativeEvent, element, true)'), 'HitLayer border/body starts a move')
assert(hitLayerSrc.includes('selectElement(e.nativeEvent, element, toggleModifier, edit)'), 'HitLayer interior selects without move on plain click, toggles on shift/ctrl')
assert(hitLayerSrc.includes('!toggleModifier && clicksToEditText(element)'), 'HitLayer interior never enters text edit on a shift/ctrl toggle click')
assert(hitLayerSrc.includes('clicksToEditText(element)') && hitLayerSrc.includes('props.beginEdit'), 'HitLayer interior begins text edit')
assert(hitLayerSrc.includes('collectVisualHitPlan'), 'HitLayer builds rects from collectVisualHitPlan')
assert(hitLayerSrc.includes('occludersAboveRect'), 'HitLayer only absorbs hits under a higher selected box')
assert(hitLayerSrc.includes('hasInteractiveSurface(element)'), 'HitLayer ring vs body follows hasInteractiveSurface')
assert(operateSrc.includes('hasInteractiveSurface(props.elementInfo)'), 'Operate border drag is the interactive ring')
assert(operateSrc.includes('clicksToEditText(props.elementInfo)'), 'Operate edit surface follows clicksToEditText')
assert(operateSrc.includes('hasInteractiveSurface(props.elementInfo) && !props.isMultiSelect'), 'Operate hides body drag on single interactive select')
assert(operateSrc.includes('props.beginEdit(props.elementInfo.id'), 'Operate edit surface / dblclick begins edit')
assert(operateSrc.includes('handlerVisible: props.isSelected && !props.elementInfo.lock && (props.isActiveGroupElement || !props.isMultiSelect)'), 'Operate handlers match selected/unlocked visibility')
assert(multiSrc.includes('scaleMultiElement'), 'MultiSelectOperate wires group resize')
assert(multiSrc.includes('rotateGroupElement'), 'MultiSelectOperate wires group rotate')
assert(multiSrc.includes('dragElement'), 'MultiSelectOperate wires group move')
assert(canvasSrc.includes('.hit-rect, .hit-border, .hit-edit'), 'canvas capture defers to HitLayer edit-vs-move')
assert(canvasSrc.includes('collectVisualHitPlan'), 'canvas capture uses the same hit plan as HitLayer')
assert(canvasSrc.includes('pointInAnyVisualHitRect'), 'canvas capture ignores points on selected/editing occluders')
assert(canvasSrc.includes("target === 'move'"), 'canvas capture starts a drag when the selected occluder hit is the move ring')
assert(canvasHitSrc.includes('export function collectVisualHitPlan'), 'hit plan helper is exported')
assert(canvasSrc.includes('<MultiSelectOperate'), 'canvas mounts MultiSelectOperate')
assert(canvasSrc.includes('<Operate'), 'canvas mounts Operate')
assert(canvasSrc.includes('<HitLayer'), 'canvas mounts HitLayer')
assert(canvasSrc.includes('<EditableElement'), 'canvas mounts EditableElement')

if (failures.length) {
  console.error('canvasHitTest checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('canvasHitTest checks passed')
