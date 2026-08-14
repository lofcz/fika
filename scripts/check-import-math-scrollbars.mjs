import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}


const useImport = read('src/hooks/useImport.ts')

assert(
  useImport.includes(`import { ensureMathliveReady, renderMathToHtml } from '@/utils/math'`),
  'useImport must pull the shared MathLive helpers',
)
assert(
  useImport.includes('const convertOmmlMathSpans'),
  'useImport must convert span.omml-math into the canonical fika-math wrapper',
)
assert(
  /finalizeImportedHtml\(styleImportedHyperlinks\(linkifyPlainUrls\(processedHtml\)\)\)/.test(useImport),
  'convertTextContent must run the shared finalize pass (lists + math)',
)
assert(
  useImport.includes('elementsContainOmmlMath') && useImport.includes('await ensureMathliveReady()'),
  'import must await MathLive before converting decks that contain math',
)

const pkg = JSON.parse(read('package.json'))
assert(
  /^npm:@lofcz\/mathlive@/.test(pkg.dependencies.mathlive || ''),
  'mathlive dependency must alias the @lofcz/mathlive fork',
)
const mainTs = read('src/main.tsx')
const mountTs = read('src/embed/mount.ts')
const mathTs = read('src/utils/math.ts')
assert(!mainTs.includes('mathlive/static.css') && !mainTs.includes('mathlive/fonts.css'), 'mathlive CSS must not be eagerly imported from main.ts')
assert(!mountTs.includes('mathlive/static.css') && !mountTs.includes('mathlive/fonts.css'), 'mathlive CSS must not be eagerly imported from embed/mount.ts')
assert(mathTs.includes("import('mathlive/static.css')") && mathTs.includes("import('mathlive/fonts.css')"), 'ensureMathliveReady must lazy-import mathlive CSS')
assert(mathTs.includes("import('mathlive')"), 'ensureMathliveReady must lazy-import mathlive')
assert(
  /querySelectorAll\('span\.omml-math'\)[\s\S]{0,400}\$\{latex\}\$/.test(useImport),
  'table cells must fold omml-math spans into $latex$ source text',
)
assert(
  /convertOmmlMathSpans[\s\S]{0,900}getAttribute\('style'\)/.test(useImport),
  'imported math must keep the deck font-size/color as a wrapping styled span',
)

const pmNodes = read('src/utils/prosemirror/schema/nodes.ts')
assert(
  /atom: true,[\s\S]{0,300}marks: '_'/.test(pmNodes),
  'math node must allow marks so fontsize/color survive editing round-trips',
)


const globalScss = read('src/assets/styles/global.scss')
const mathRule = globalScss.match(/\.fika-math \{[\s\S]*?\n\}/)?.[0] || ''
assert(mathRule.includes('vertical-align: baseline'), 'fika-math must baseline-align with surrounding text')
assert(!mathRule.includes('vertical-align: middle'), 'fika-math must not use vertical-align: middle (floats equations off the text line)')


const elementOutline = read('src/utils/elementOutline.ts')
assert(
  elementOutline.includes('export const pptxBorderColorToString'),
  'elementOutline must export the border color normalizer',
)
assert(
  elementOutline.includes('color: pptxBorderColorToString(el.borderColor)'),
  'importOutlineFromPptx must normalize the structured border color',
)
assert(
  useImport.includes(`color: pptxBorderColorToString(el.borderColor) || '#000000'`),
  'parseLineElement must normalize the structured border color (invisible fraction bars regression)',
)

function pptxBorderColorToString(borderColor) {
  if (!borderColor) return undefined
  if (typeof borderColor === 'string') return borderColor
  if (borderColor.type === 'color') return borderColor.value
  return borderColor.value.colors[0]?.color
}

assert(pptxBorderColorToString(undefined) === undefined, 'normalizer: undefined passes through')
assert(pptxBorderColorToString('#123456') === '#123456', 'normalizer: legacy string passes through')
assert(pptxBorderColorToString({ type: 'color', value: '#0EA5E9' }) === '#0EA5E9', 'normalizer: solid color flattens to value')
assert(pptxBorderColorToString({ type: 'color', value: 'transparent' }) === 'transparent', 'normalizer: transparent preserved')
assert(
  pptxBorderColorToString({ type: 'gradient', value: { colors: [{ color: '#111111', pos: '0%' }, { color: '#222222', pos: '100%' }], path: 'line', rot: 0 } }) === '#111111',
  'normalizer: gradient falls back to first stop',
)
assert(
  !useImport.includes('promoteListTextStyle(processedHtml)'),
  'promoteListTextStyle must operate on the shared DOM pass, not raw html',
)


assert(
  /^npm:@lofcz\/pptxtojson@/.test(pkg.dependencies.pptxtojson || ''),
  'pptxtojson dependency must alias the @lofcz/pptxtojson fork',
)


const canvasIndex = read('src/views/Editor/Canvas/index.tsx')
assert(
  canvasIndex.includes('onMousedownCapture') || canvasIndex.includes('onMouseDownCapture'),
  'canvas must intercept mousedown in capture phase for middle-button pan',
)
assert(
  /e\.button !== 1[\s\S]{0,200}dragViewport\(e\)/.test(canvasIndex),
  'middle-button mousedown must pan the viewport via dragViewport',
)
assert(
  canvasIndex.includes('<CanvasScrollbars') && (canvasIndex.includes('pan={panViewport}') || canvasIndex.includes('pan={panViewport')),
  'canvas must render CanvasScrollbars bound to panViewport',
)

const useViewportSize = read('src/views/Editor/Canvas/hooks/useViewportSize.ts')
assert(
  useViewportSize.includes('const panViewport') && useViewportSize.includes('panViewport,'),
  'useViewportSize must expose panViewport for the scrollbars',
)


const TRACK_MARGIN = 4
const MIN_THUMB_LENGTH = 24

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function getAxisMetrics(canvasSize, contentStart, contentSize) {
  const scrollMax = contentSize - canvasSize
  const visible = canvasSize > 0 && scrollMax > 0.5
  if (!visible) {
    return { visible: false, thumbStart: 0, thumbLength: 0, scrollMax: 0, scrollOffset: 0, trackLength: 0 }
  }

  const scrollOffset = clamp(-contentStart, 0, scrollMax)
  const trackLength = canvasSize - TRACK_MARGIN * 2
  const thumbLength = Math.max(MIN_THUMB_LENGTH, canvasSize / contentSize * trackLength)
  const thumbStart = TRACK_MARGIN + (scrollOffset / scrollMax) * (trackLength - thumbLength)

  return { visible, thumbStart, thumbLength, scrollMax, scrollOffset, trackLength }
}

assert(!getAxisMetrics(1000, 100, 500).visible, 'scrollbar hidden when content fits the canvas')
assert(!getAxisMetrics(1000, -400, 500).visible, 'scrollbar hidden when small content is panned around')

for (const start of [0, -500, -1000, 300, -5000]) {
  assert(getAxisMetrics(1000, start, 2000).visible, `scrollbar stays visible while panning (contentStart=${start})`)
}

{
  const m = getAxisMetrics(1000, 0, 2000)
  assert(Math.abs(m.thumbStart - TRACK_MARGIN) < 0.001, 'thumb at track start when scrolled to origin')
  assert(m.thumbLength < m.trackLength, 'thumb shorter than track when overflowing')
}

{
  const m = getAxisMetrics(1000, -1000, 2000)
  assert(
    Math.abs(m.thumbStart + m.thumbLength - (TRACK_MARGIN + m.trackLength)) < 0.001,
    'thumb at track end when scrolled to the far edge',
  )
}

{
  const m = getAxisMetrics(1000, -500, 2000)
  const expected = TRACK_MARGIN + 0.5 * (m.trackLength - m.thumbLength)
  assert(Math.abs(m.thumbStart - expected) < 0.001, 'thumb midway when half scrolled')
}

{
  const past = getAxisMetrics(1000, -3000, 2000)
  assert(past.scrollOffset === past.scrollMax, 'scroll offset clamps at the far edge')
  assert(
    Math.abs(past.thumbStart + past.thumbLength - (TRACK_MARGIN + past.trackLength)) < 0.001,
    'thumb parks at track end when panned past the edge',
  )
  const before = getAxisMetrics(1000, 500, 2000)
  assert(before.scrollOffset === 0, 'scroll offset clamps at the origin edge')
  assert(Math.abs(before.thumbStart - TRACK_MARGIN) < 0.001, 'thumb parks at track start when panned before the origin')
}

{
  const m = getAxisMetrics(200, -5000, 10000)
  assert(m.thumbLength >= MIN_THUMB_LENGTH, 'thumb never smaller than the minimum grab size')
}

assert(!getAxisMetrics(0, -100, 500).visible, 'no scrollbar before the canvas has a size')

const scrollbars = read('src/views/Editor/Canvas/CanvasScrollbars.tsx')
assert(scrollbars.includes('const TRACK_MARGIN = 4'), 'TRACK_MARGIN mirror out of sync')
assert(scrollbars.includes('const MIN_THUMB_LENGTH = 24'), 'MIN_THUMB_LENGTH mirror out of sync')
assert(
  scrollbars.includes('const scrollMax = contentSize - canvasSize'),
  'scrollMax mirror out of sync',
)
assert(
  scrollbars.includes('const scrollOffset = clamp(-contentStart, 0, scrollMax)'),
  'scrollOffset mirror out of sync',
)
assert(
  scrollbars.includes('clamp(startOffset + delta * contentPerTrackPixel, 0, scrollMax)'),
  'thumb drag must map the pointer to an absolute clamped offset',
)
assert(
  /e\.button !== 0/.test(scrollbars),
  'thumb drag must only react to the left mouse button',
)

if (failures.length) {
  console.error('check-import-math-scrollbars failed:')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}
console.log('check-import-math-scrollbars passed')
