import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  fitUniformScale,
  readLiveBoxSize,
  isLiveAutoHeight,
} = await import(pathToFileURL(join(root, 'src/utils/liveElementSize.ts')).href)
const { latexPropsAfterEdit, latexPaintScale } = await import(pathToFileURL(join(root, 'src/utils/latex.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(fitUniformScale({ width: 200, height: 40 }, { width: 100, height: 80 }) === 0.5, 'uniform fit is the tighter axis')
assert(fitUniformScale({ width: 50, height: 50 }, { width: 200, height: 100 }) === 2, 'uniform fit can grow to fill the box')
assert(fitUniformScale({ width: 0, height: 40 }, { width: 100, height: 80 }) === 1, 'empty natural size does not scale')

const live = readLiveBoxSize({ style: { width: '160px', height: '48px' } }, { width: 10, height: 10 })
assert(live.width === 160 && live.height === 48, 'live box size prefers inline styles written by applyLiveSize')
const fallback = readLiveBoxSize({ style: { width: '', height: '' } }, { width: 80, height: 24 })
assert(fallback.width === 80 && fallback.height === 24, 'missing live styles fall back to authored size')

assert(
  isLiveAutoHeight({ hasAttribute: key => key === 'data-live-auto-height', style: { height: '80px' } }),
  'data-live-auto-height opts the box out of live height writes',
)
assert(
  isLiveAutoHeight({ hasAttribute: () => false, style: { height: 'auto' } }),
  'height:auto opts the box out of live height writes',
)
assert(
  !isLiveAutoHeight({ hasAttribute: () => false, style: { height: '80px' } }),
  'a pixel-height live box is resized on both axes',
)

const liveSrc = readFileSync(join(root, 'src/utils/liveElementSize.ts'), 'utf8')
assert(liveSrc.includes('stretchLiveSvg'), 'applyLiveSize stretches direct-child SVGs on both axes')
assert(liveSrc.includes('stretchLiveTable'), 'applyLiveSize updates table row heights during the gesture')
assert(liveSrc.includes('liveColOrigin'), 'table column widths are scaled from a captured origin during live resize')
assert(liveSrc.includes('tableLayout'), 'live table resize forces fixed layout so cells follow the box')
assert(liveSrc.includes('LIVE_SVG_SCALE_RE'), 'shape SVGs live-resize by updating the paint g scale')
assert(liveSrc.includes("svg.removeAttribute('viewBox')"), 'g-scaled shape SVGs must not keep a leftover viewBox')
assert(liveSrc.includes('tableCellMinHeight'), 'table commit uses the same row-height formula as the live preview')
assert(!liveSrc.includes('!box.style.height'), 'missing inline height is not treated as auto-height')
assert(
  liveSrc.includes('isLiveAutoHeight(content) || isLiveAutoHeight(box)'),
  'only explicit auto-height opts out of live height writes',
)

const scale = readFileSync(join(root, 'src/views/Editor/Canvas/hooks/useScaleElement.ts'), 'utf8')
assert(scale.includes("from '@/utils/liveElementSize'"), 'useScaleElement uses the shared live size writer')
assert(!scale.includes('const applyLiveSize'), 'applyLiveSize is not reimplemented in the resize hook')
assert(!scale.includes('return { ...el, left, width }'), 'table resize always commits height, not only width')
assert(scale.includes('tableCellMinHeight'), 'table commit row height matches the live preview formula')
assert(!scale.includes('cellMinHeight < 36'), 'table commit must not clamp row height away from the live preview')
assert(scale.includes('livePaint'), 'resize paints the live formula path instead of stretching the insert path')

const shapeEl = readFileSync(join(root, 'src/views/components/element/ShapeElement/index.tsx'), 'utf8')
assert(shapeEl.includes('syncShapePaint'), 'shape commit rewrites the paint g transform so React cannot bail out on scale(1,1)')
assert(liveSrc.includes('syncShapePaint'), 'live size helper exposes the authoritative shape paint transform')
assert(liveSrc.includes('shapeGroupTransform'), 'shape paint transform is shared between live resize and commit')
assert(liveSrc.includes('extras?.path'), 'path-formula shapes paint the regenerated path during the gesture')

const resizeHandler = readFileSync(join(root, 'src/views/Editor/Canvas/Operate/ResizeHandler.tsx'), 'utf8')
assert(resizeHandler.includes('data-resize-handle'), 'resize handles expose a stable test hook')

const editableTable = readFileSync(join(root, 'src/views/components/element/TableElement/EditableTable.tsx'), 'utf8')
assert(editableTable.includes('subscribeLiveBox'), 'editable table scales col widths from the live box during resize')
assert(editableTable.includes('liveRowHeight'), 'editable table row height follows the live box during resize')

const tableElement = readFileSync(join(root, 'src/views/components/element/TableElement/index.tsx'), 'utf8')
assert(!tableElement.includes('setRealHeightCache'), 'table resize must not re-render from ResizeObserver during the gesture')
assert(tableElement.includes('useMainStore.subscribe'), 'table scaling state is subscribed without resetting painted cells')

const latex = readFileSync(join(root, 'src/views/components/element/LatexElement/LatexContent.tsx'), 'utf8')
assert(latex.includes('useLiveBoxFit'), 'latex scales from the live box')
assert(!latex.includes('setScale'), 'latex scale is not React state')
assert(!latex.includes('widthRef.current / w'), 'latex no longer scales from store size / natural size on commit only')

const saved = latexPropsAfterEdit(
  { width: 240, height: 80 },
  { latex: 'x^2', path: '', w: 64, h: 36 },
)
assert(saved.latex === 'x^2', 'edit save writes the new formula')
assert(saved.viewBox[0] === 64 && saved.viewBox[1] === 36, 'edit save stores the new natural size on viewBox')
assert(!('width' in saved) && !('height' in saved), 'edit save must not replace the authored box with the natural measure')
assert(latexPaintScale({ width: 240, height: 80, viewBox: [120, 40] }) === 2, 'export/paint scale is authored box / natural viewBox')
assert(latexPaintScale({ width: 120, height: 40, viewBox: [120, 40] }) === 1, 'unscaled latex stays at paint scale 1')

const dialog = readFileSync(join(root, 'src/views/Editor/LatexEditorDialog.tsx'), 'utf8')
assert(dialog.includes('latexPropsAfterEdit'), 'latex editor save uses the persist-box helper')
assert(!dialog.includes('width: data.w'), 'latex editor save does not write measured width onto the element')
assert(!dialog.includes('height: data.h'), 'latex editor save does not write measured height onto the element')

if (failures.length) {
  console.error('liveElementSize checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('liveElementSize checks passed')
