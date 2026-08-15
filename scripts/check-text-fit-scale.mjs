import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  extractFitBlocksFromHtml,
  fitScaleFromContentHeight,
  fitClipPadding,
  fitSessionKey,
  innerBoxFromContentElement,
  innerBoxFromLiveStyles,
  MIN_FIT_SCALE,
  textFitScaleForHtml,
} = await import(pathToFileURL(join(root, 'src/utils/textFit.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const fallbackBox = { innerWidth: 120, innerHeight: 40 }
assert(
  innerBoxFromContentElement(null, fallbackBox) === fallbackBox,
  'missing content box falls back to store geometry',
)
const liveBox = innerBoxFromLiveStyles(
  { style: { width: '200px', height: '80px' } },
  { width: 120, height: 40, inset: [10, 8, 10, 8] },
)
assert(liveBox.innerWidth === 184 && liveBox.innerHeight === 60, 'live inner box uses inline size minus inset, not store size')
const storeBox = innerBoxFromLiveStyles(null, { width: 120, height: 40, inset: [10, 8, 10, 8] })
assert(storeBox.innerWidth === 104 && storeBox.innerHeight === 20, 'missing live styles fall back to store size minus inset')
assert(
  fitSessionKey('<p>a</p>', 'Inter', 1.2, 0, 'cs') !== fitSessionKey('<p>b</p>', 'Inter', 1.2, 0, 'cs'),
  'pretext session key changes when content changes',
)
assert(
  fitSessionKey('<p>a</p>', 'Inter', 1.2, 0, 'cs') === fitSessionKey('<p>a</p>', 'Inter', 1.2, 0, 'cs'),
  'pretext session key is stable for the same content/font',
)
assert(
  fitSessionKey('<ul><li>a</li></ul>', 'Inter', 1.2, 0, 'cs', 16)
    !== fitSessionKey('<ul><li>a</li></ul>', 'Inter', 1.2, 0, 'cs', 20),
  'pretext session key changes when the authored default size changes',
)

if (typeof DOMParser !== 'undefined') {
  const ptBlocks = extractFitBlocksFromHtml('<p><span style="font-size:36pt">Houby</span></p>', {
    defaultFontFamily: 'Arial',
    defaultSize: 16,
  })
  assert(ptBlocks.blocks[0]?.size > 40, `imported pt font-size must not collapse to 16, got ${ptBlocks.blocks[0]?.size}`)
}

assert(textFitScaleForHtml('', { innerWidth: 100, innerHeight: 40, lineHeight: 1.2 }) === 1, 'empty html does not shrink')
assert(textFitScaleForHtml('<p>a</p>', { innerWidth: 2, innerHeight: 40, lineHeight: 1.2 }) === 1, 'degenerate box does not shrink')

assert(fitScaleFromContentHeight(0, 100) === 1, 'empty content does not shrink')
assert(fitScaleFromContentHeight(100, 0) === 1, 'empty box does not shrink')
assert(fitScaleFromContentHeight(200, 400) === 1, 'short content in a tall box stays at 100% (Excel does not grow)')

// Content-slide body slot is 11 lines at 20×1.2 with no paragraph gaps.
// Live lists add --paragraphSpace (5px) between items. Measuring unmarked
// bullets at ProseMirror's 16px makes that overflow look like a fit.
const slotInner = 11 * 20 * 1.2
const listAtTypedSize = 11 * 20 * 1.2 + 10 * 5
const listAtPmDefault = 11 * 16 * 1.2 + 10 * 5
assert(fitScaleFromContentHeight(listAtTypedSize, slotInner) < 1, '11 unmarked bullets at the typed 20px must shrink in the 11-line slot')
assert(fitScaleFromContentHeight(listAtPmDefault, slotInner) === 1, 'the same list measured at 16px incorrectly fits — session defaultSize must be 20')
assert(fitScaleFromContentHeight(400, 400) === 1, 'exact fit stays at 100%')
assert(fitScaleFromContentHeight(399.4, 400) === 1, 'subpixel underfit stays at 100%')

const overflow = fitScaleFromContentHeight(500, 400)
assert(overflow === 0.8, `overflow 500→400 must be 0.8, got ${overflow}`)
assert(overflow < 1, 'overflowing content must shrink')
assert(500 * overflow <= 400 + 0.05, 'scaled height must fit the box')

const wrapping = fitScaleFromContentHeight(941, 457)
assert(wrapping < 1, 'Obsah-like overflow must shrink')
assert(941 * wrapping <= 457 + 0.05, 'Obsah-like scaled height must fit')
assert(wrapping >= MIN_FIT_SCALE, 'must not shrink below the floor')

const tiny = fitScaleFromContentHeight(10000, 100)
assert(tiny === MIN_FIT_SCALE, `extreme overflow clamps to min scale, got ${tiny}`)

const padTight = fitClipPadding(37, 0.86)
assert(padTight >= 3 && padTight <= 12, `tight line-height pad is small, got ${padTight}`)
const padNormal = fitClipPadding(16, 1.5)
assert(padNormal >= 3 && padNormal <= 8, `normal line-height pad is small, got ${padNormal}`)

const shape = readFileSync(join(root, 'src/views/components/element/ShapeElement/index.tsx'), 'utf8')
assert(shape.includes('useTextFit'), 'locked shape text uses the same live shrink-to-fit as text boxes')
assert(shape.includes('data-text-fit-host'), 'shape text paints fit zoom on a host')
const liveSize = readFileSync(join(root, 'src/utils/liveElementSize.ts'), 'utf8')
assert(liveSize.includes('subscribeLiveBox'), 'applyLiveSize notifies fit hosts during the gesture')
assert(liveSize.includes('notifyLiveBox'), 'live box writes broadcast to subscribers')

if (failures.length) {
  console.error('text-fit scale checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('text-fit scale checks passed')
