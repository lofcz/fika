import { existsSync, readFileSync } from 'node:fs'
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
  isPointOnVisualBorder,
  isPointOnResizeHandle,
  hitTestOperateTarget,
  resizeHandleDirectionsFor,
  RESIZE_HANDLE_DIRECTIONS,
  clicksToEditText,
  hasInteractiveSurface,
  hitRectClipPath,
  visualHitRectsOverlap,
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

assert(isPointOnVisualBorder(200, 100, visual), 'top edge is a drag border')
assert(isPointOnVisualBorder(200 + MAX_INNER_DRAG_PX, 180, visual), 'left edge is a drag border')
assert(!isPointOnVisualBorder(200 + MAX_INNER_DRAG_PX + 1, 180, visual), 'just inside the left ring is edit')
assert(!isPointOnVisualBorder(400, 180, visual), 'center is interior, not a drag border')
assert(!isPointOnVisualBorder(0, 0, visual), 'outside the box is not an inward drag border')

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
assert(!isPointOnVisualBorder(200, 0, thin), 'top edge of a short box is edit; drag is outside')
const tooThin = { ...thin, height: 5 }
assert(!isPointOnVisualBorder(200, 2, tooThin), 'a 5px-tall box has no inward drag ring')

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
const clip = hitRectClipPath(underText, [overVideo])
assert(typeof clip === 'string' && clip.startsWith('path(evenodd,'), 'selected media punches a hole in lower hit rects')
assert(clip.includes('M80 40'), 'hole starts at the video origin in local coordinates')
assert(typeof hitRectClipPath(underText, [{ ...overVideo, zIndex: 1 }]) === 'string', 'overlapping media clips even at the same stack level')
assert(hitRectClipPath(underText, [{ ...overVideo, left: 900, top: 900 }]) === undefined, 'non-overlapping media does not clip')

const hitLayerSrc = readFileSync(join(root, 'src/views/Editor/Canvas/HitLayer.tsx'), 'utf8')
const operateSrc = readFileSync(join(root, 'src/views/Editor/Canvas/Operate/index.tsx'), 'utf8')
const canvasSrc = readFileSync(join(root, 'src/views/Editor/Canvas/index.tsx'), 'utf8')
const multiSrc = readFileSync(join(root, 'src/views/Editor/Canvas/Operate/MultiSelectOperate.tsx'), 'utf8')
assert(hitLayerSrc.includes('selectElement(native, element, true)'), 'HitLayer border/body starts a move')
assert(hitLayerSrc.includes('selectElement(native, element, false)'), 'HitLayer interior selects without move')
assert(hitLayerSrc.includes('if (clicksToEditText(element)) props.beginEdit'), 'HitLayer interior begins text edit')
assert(hitLayerSrc.includes('selectedIdSet.has(element.id) && element.type !== \'line\''), 'HitLayer skips selected boxes so operate owns them')
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
assert(canvasSrc.includes('<MultiSelectOperate'), 'canvas mounts MultiSelectOperate')
assert(canvasSrc.includes('<Operate'), 'canvas mounts Operate')
assert(canvasSrc.includes('<HitLayer'), 'canvas mounts HitLayer')
assert(canvasSrc.includes('<EditableElement'), 'canvas mounts EditableElement')

if (failures.length) {
  console.error('canvasHitTest checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('canvasHitTest checks passed')
