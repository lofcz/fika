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

function extractFn(src, name) {
  const markers = [`export const ${name}`, `const ${name}`]
  let start = -1
  for (const marker of markers) {
    start = src.indexOf(marker)
    if (start >= 0) break
  }
  if (start < 0) return ''
  const brace = src.indexOf('{', start)
  if (brace < 0) return src.slice(start)
  let depth = 0
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return src.slice(start)
}

function countCall(src, method) {
  return (src.match(new RegExp(`\\.${method}\\s*\\(`, 'g')) || []).length
}

const pool = read('src/previewRaster/stagePool.ts')
const scheduler = read('src/previewRaster/scheduler.ts')
const types = read('src/previewRaster/types.ts')
const barrel = read('src/previewRaster/index.ts')
const owned = [pool, scheduler, types, barrel].join('\n')

const textPainter = read('src/previewRaster/painters/text.ts')
const booth = read('src/previewRaster/painters/booth.ts')
assert(textPainter.includes('isUnfilledPlaceholder'), 'text painter detects unfilled placeholders')
assert(/isUnfilledPlaceholder\(element\)\) return null/.test(textPainter), 'empty placeholders are filtered out of slide previews')
assert(!textPainter.includes('paintPlaceholderSlot'), 'empty placeholder prompts are never painted into the preview raster')
assert(!textPainter.includes('paintUnfilledPlaceholder'), 'empty placeholders must not have a dedicated Konva painter')
assert(!/dash:\s*\[6,\s*4\]/.test(textPainter), 'placeholder dashed boxes are never stroked into the preview raster')
assert(read('src/previewRaster/painters/index.ts').includes('isUnfilledPlaceholder'), 'paintElement filters unfilled placeholders before any painter runs')
assert(read('src/utils/placeholderPaint.ts').includes('shouldRasterPreviewText'), 'preview paint gate is a shared predicate')
const commit = read('src/utils/commitSlideElements.ts')
const layout = read('src/utils/liveLayoutCommit.ts')
assert(commit.includes('applyLiveLayoutOntoStore'), 'gesture commits overlay live layout onto store elements')
assert(layout.includes('...store'), 'store remains the authored source of truth on commit')
assert(!layout.includes('content: store.content'), 'commits do not copy content from the live fork')
assert(textPainter.includes('repairFilledPlaceholderHtml'), 'text painter repairs leaked prompt-size marks before raster')
assert(textPainter.includes('placeholderTypedSizeOf'), 'text painter prefers the typed size over a leaked prompt size')
assert(textPainter.includes('textFitScaleForHtml'), 'preview text uses the same locked-box fit as the editor')
assert(textPainter.includes('textElementLocksSize'), 'preview fit enables for placeholder/title slots, not only el.fixedHeight')
assert(textPainter.includes('lockedFitScale'), 'Konva and SnapDOM text share one fit scale')
assert(!/escapeBoothText\(element\.placeholder\)/.test(textPainter), 'empty placeholder prompt is never SnapDOM-rasterized')
assert(textPainter.includes('Konva.Text'), 'simple text paints with Konva.Text instead of a second bitmap pass')
const codePainter = read('src/previewRaster/painters/code.ts')
assert(codePainter.includes('codeElementToBoothHtml'), 'code preview uses Shiki booth HTML')
assert(codePainter.includes('rasterHtml'), 'code preview SnapDOM-rasterizes highlighted HTML')
assert(!booth.includes('codeToBoothHtml'), 'naive plaintext code booth is gone')
assert(read('src/previewRaster/painters/index.ts').includes('paintCode'), 'paintElement delegates code to paintCode')
assert(read('src/utils/codeHighlight.ts').includes('injectBoothLineNumbers'), 'code booth injects real gutter spans')
assert(booth.includes('embedFonts: true'), 'SnapDOM booth embeds fonts')
assert(booth.includes('waitForFonts'), 'booth waits for the slide font families, not only document.fonts.ready')
assert(/dpr:\s*1/.test(booth) && /scale:\s*1/.test(booth), 'SnapDOM captures at dest working pixels (dpr 1, scale 1)')
assert(booth.includes('perfectDrawEnabled: false'), 'booth images skip Konva perfect-draw buffering')
assert(pool.includes('shouldCacheNode'), 'bitmap/text nodes are not cache()-resampled')

assert(/from ['"]\.\/painters\/index['"]/.test(pool) && pool.includes('paintElement'), 'stagePool imports paintElement from painters/index')
assert(!/from ['"][^'"]*views\/components\/element/.test(owned), 'owned files never import React element components')
assert(!/ThumbnailElement|BaseImageElement|BaseShapeElement|BaseLineElement/.test(owned), 'owned files do not mount editor element components')
assert(!/createImageBitmap|ImageBitmap/.test(pool), 'stagePool does not invent an ImageBitmap LRU')
assert(!/new Map<\s*string\s*,\s*ImageBitmap/.test(pool), 'stagePool LRU is stages, not raw bitmaps')

assert(/listening:\s*false/.test(pool), 'Stage and Layer are created with listening(false)')
assert(countCall(pool, 'listening') >= 1, 'nodes are set listening(false)')
assert(/nodes:\s*new Map\(\)/.test(pool) || /nodes:\s*Map<string,\s*Konva\.Node>/.test(pool), 'nodes are keyed by element id')

const move = extractFn(pool, 'moveElement')
assert(move.length > 0, 'moveElement is exported')
assert(countCall(move, 'cache') === 0, 'move-only path does not call cache()')
assert(countCall(move, 'clearCache') === 0, 'move-only path does not call clearCache()')
assert(countCall(move, 'x') >= 1 && countCall(move, 'y') >= 1, 'moveElement sets x/y')
assert(countCall(move, 'batchDraw') === 1, 'moveElement batchDraws once')

const invalidate = extractFn(pool, 'invalidateElement')
assert(invalidate.length > 0, 'invalidateElement is exported')
assert(countCall(invalidate, 'clearCache') === 1, 'content change clearCache once')
assert(countCall(invalidate, 'cache') === 1, 'content change cache once')
assert(invalidate.includes('shouldCacheNode'), 'content change cache is skipped for already-raster text')
assert(invalidate.includes('paintElement'), 'content change repaints via paintElement')

const drop = extractFn(pool, 'dropSlide')
assert(drop.includes('stage.destroy()') || countCall(drop, 'destroy') >= 1, 'dropSlide destroys the Konva stage')

const ensure = extractFn(pool, 'ensureStage')
const setDest = extractFn(pool, 'setDestSize')
const applySize = extractFn(pool, 'applyStageSize')
const sizePath = `${ensure}\n${setDest}\n${applySize}`
assert(ensure.length > 0 && setDest.length > 0, 'setDestSize and ensureStage are exported')
assert(/destWidth\s*\*\s*pixelRatio/.test(pool), 'dest×DPR is destWidth * pixelRatio')
assert(/destDpr\s*>\s*entry\.cachedDestDpr/.test(sizePath) || /destDpr\s*>\s*\w+\.cachedDestDpr/.test(pool), 'recache only if new dest×DPR exceeds cached pixelRatio')
assert(!/destDpr\s*[<!]=/.test(sizePath), 'dest shrink does not recache')
assert(!/cachedDestDpr\s*[><]=?\s*destDpr/.test(sizePath.replace(/destDpr\s*>\s*entry\.cachedDestDpr/, '')), 'shrink/equal dest×DPR skips recache')

const recacheHelper = extractFn(pool, 'recacheLayer')
assert(recacheHelper.length > 0, 'layer recache is isolated from the move path')
assert(!move.includes('recacheLayer'), 'moveElement does not recache the layer')
assert(!setDest.includes('recacheLayer') || /destDpr\s*>/.test(pool), 'setDestSize recache is dest×DPR-gated')

const zOrder = extractFn(pool, 'setZOrder')
assert(zOrder.includes('moveToTop') && zOrder.includes('moveToBottom'), 'setZOrder restacks painted nodes without inventing zIndex slots')
assert(!zOrder.includes('index + 1'), 'setZOrder does not assume a background child at index 0')

assert(extractFn(pool, 'attachStage').length > 0, 'attachStage is exported')
assert(extractFn(pool, 'detachStage').length > 0, 'detachStage is exported')
assert(extractFn(pool, 'compositeCanvas').length > 0, 'compositeCanvas is exported')
assert(pool.includes('getNativeCanvasElement') || pool.includes('getRasterSnapshot'), 'compositeCanvas prefers the dest snapshot')
assert(pool.includes('prepareScratch') || pool.includes('clearScratch'), 'one scratch compositor paints dest snapshots')
assert(/MAX_PREVIEW_STAGES/.test(pool), 'live Konva stages are capped to the scratch compositor')
assert(drop.includes('dropRasterSnapshot') || drop.includes('keepSnapshot'), 'dropSlide drops dest snapshots for deleted slides')
assert(!setDest.includes('ensureStage'), 'setDestSize must not create empty stages')
assert(extractFn(pool, 'mountPreview').includes('attachRasterSnapshot'), 'thumbs mount dest snapshots, not live stages')

const cache = read('src/previewRaster/rasterCache.ts')
assert(cache.includes('captureRasterSnapshot'), 'dest-sized raster snapshots live outside the stage LRU')
assert(!/createImageBitmap|ImageBitmap/.test(cache), 'raster cache stores canvases, not an ImageBitmap LRU')
assert(!extractFn(cache, 'attachRasterSnapshot').includes('canvas.width'), 'attaching a snapshot must not reset the backing store')
assert(!extractFn(cache, 'attachRasterSnapshot').includes('appendChild(snap.canvas)'), 'thumbs blit a view canvas; the master snapshot stays off-DOM')
assert(cache.includes('paintRasterSnapshot'), 'drag overlay paints from the off-DOM master snapshot')
assert(cache.includes('data-preview-raster-master'), 'master snapshot is marked and never mounted in a thumb')
assert(!extractFn(cache, 'resizeRasterSnapshot').includes('canvas.width'), 'pane resize must CSS-scale snapshots, not realloc the bitmap')

const thumb = read('src/views/components/ThumbnailSlide/index.tsx')
assert(!/\bensureStage\b/.test(thumb), 'ThumbnailSlide must not create empty stages on remount')
assert(thumb.includes('attachStage'), 'ThumbnailSlide attaches an existing stage or snapshot')
assert(thumb.includes('data-thumbnail-slide'), 'thumb host is addressable without CSS-module class names')

const subscribe = read('src/previewRaster/subscribeSlides.ts')
assert(!/let destOverride/.test(subscribe), 'detached dest size is an argument to the paint job, not a process-wide override')
assert(subscribe.includes('paintSlide(slide, override)'), 'async raster paint keeps the caller dest size')
assert(subscribe.includes('planSlideRaster'), 'element writes are classified as skip / patch / full')
assert(subscribe.includes('patchSlide'), 'a single-element write patches the scratch compositor')
assert(subscribe.includes('snapshotCoversDest'), 'scroll reuse keeps dest snapshots until the slide is invalidated')
assert(subscribe.includes('prepareScratch'), 'full dest paints go through the scratch compositor')
assert(subscribe.includes('finishPaint'), 'paintedById is committed after a successful paint, not before')
assert(subscribe.includes('isScreening'), 'preview raster pauses while presenting')
assert(subscribe.includes('useScreenStore.subscribe'), 'preview raster resumes when screening ends')

assert(scheduler.includes('export const enqueueRaster'), 'scheduler exports enqueueRaster')
assert(types.includes('export type PreviewPainter'), 'types export PreviewPainter')

for (const name of [
  'attachStage',
  'detachStage',
  'dropSlide',
  'compositeCanvas',
  'ensureStage',
  'setDestSize',
  'invalidateElement',
  'moveElement',
]) {
  assert(barrel.includes(name), `index.ts re-exports ${name}`)
}
assert(!/from ['"]\.\/painters/.test(barrel), 'index.ts does not re-export painters')

assert(/\bclearCache\s*\(/.test(pool), 'stagePool.ts must have a clearCache path')
assert(/\.cache\s*\(/.test(pool), 'stagePool.ts must have a cache path')
assert(/\bbatchDraw\s*\(/.test(pool), 'stagePool.ts must have a batchDraw path')
assert(
  /(?:pixelRatio|destDpr)\s*>\s*\w+\.cached(?:Ratio|DestDpr)/.test(pool),
  'dest shrink / setDestSize must not recache when dest ≤ cached pixelRatio',
)

const chartPainter = read('src/previewRaster/painters/chart.ts')
const chartBooth = read('src/views/components/element/ChartElement/chartBooth.ts')
assert(!/echarts/.test(chartPainter), 'chart painter never imports echarts')
assert(!chartPainter.includes('#f8fafc'), 'chart painter does not fill a stub white square')
assert(chartPainter.includes('chartElementToBoothHtml'), 'thumbs rasterize the live echarts SVG booth')
assert(chartPainter.includes('rasterHtml'), 'chart SVG is SnapDOM-rasterized like other booths')
assert(chartBooth.includes('getChartOption'), 'chart booth uses the same option builder as the live chart')
assert(chartBooth.includes('resolveChartElementSeriesColors'), 'chart booth lifts series colors that vanish into the slide')
assert(chartBooth.includes('expandChartThemeColors'), 'chart booth expands theme colors the same way as the live chart')
assert(chartBooth.includes('animation: false'), 'chart booth disables animation so the raster is the settled chart')
assert(chartBooth.includes("renderer: 'svg'"), 'chart booth uses the SVG renderer')
assert(read('src/views/components/ThumbnailSlide/paintedSlide.ts').includes('chartType'), 'thumb cache fingerprints chart type and data')

if (failures.length) {
  console.error(`check-preview-raster: ${failures.length} failed`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('check-preview-raster: ok')
