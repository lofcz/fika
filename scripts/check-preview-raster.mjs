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
assert(textPainter.includes('authoredTextFitSize'), 'preview fit uses the authored typed size, not a leaked prompt size')
assert(textPainter.includes('textFitScaleForHtml'), 'preview text uses the same locked-box fit as the editor')
assert(textPainter.includes('textElementLocksSize'), 'preview fit enables for placeholder/title slots, not only el.fixedHeight')
assert(textPainter.includes('lockedFitScale'), 'preview text uses one fit scale for the shared HTML paint')
assert(!/escapeBoothText\(element\.placeholder\)/.test(textPainter), 'empty placeholder prompt is never SnapDOM-rasterized')
assert(textPainter.includes('textPaintHtml'), 'rich text still SnapDOM-rasterizes the live HTML')
assert(textPainter.includes('rasterHtml'), 'text painter SnapDOM-rasterizes lists and mixed type')
assert(textPainter.includes('Konva.Text'), 'simple single-size boxes paint with Konva.Text')
assert(textPainter.includes('readTextPaintLayout'), 'Konva text uses the shared HTML layout reader')
assert(!textPainter.includes('flattenLists'), 'lists stay as live HTML, not flattened bullets')
assert(textPainter.includes('needsHtmlBooth'), 'rich text Konva cannot paint takes the HTML booth')
assert(textPainter.includes('paintKonvaHtmlBox'), 'simple boxes share one Konva HTML painter')
const textPaintHtmlSrc = read('src/previewRaster/textPaintHtml.ts')
assert(textPaintHtmlSrc.includes('DOMParser'), 'browser walks authored HTML with DOMParser + CSSOM')
assert(textPaintHtmlSrc.includes("from 'parse5'"), 'node walks authored HTML with parse5')
assert(textPaintHtmlSrc.includes('style-to-object'), 'node reads inline styles via style-to-object')
assert(textPaintHtmlSrc.includes('walkTextLeaves'), 'booth decision walks text leaves, not a tag denylist')
assert(textPaintHtmlSrc.includes('paintSignature'), 'Konva is only used when every text leaf shares one paint')
assert(!textPaintHtmlSrc.includes('FONT_SIZE_RE'), 'font sizes are not regex-scraped from HTML')
assert(read('src/utils/cssLength.ts').includes('convertUnits'), 'CSS lengths convert through pixel-units')
assert(!read('src/utils/textFit.ts').includes('FONT_SIZE_RE'), 'text-fit uses the shared CSS length converter')
const codePainter = read('src/previewRaster/painters/code.ts')
assert(codePainter.includes('codeElementToBoothHtml'), 'code preview uses Shiki booth HTML')
assert(codePainter.includes('rasterHtml'), 'code preview SnapDOM-rasterizes highlighted HTML')
assert(!booth.includes('codeToBoothHtml'), 'naive plaintext code booth is gone')
assert(read('src/previewRaster/painters/index.ts').includes('paintCode'), 'paintElement delegates code to paintCode')
assert(read('src/utils/codeHighlight.ts').includes('injectBoothLineNumbers'), 'code booth injects real gutter spans')
assert(booth.includes('embedFonts: true'), 'SnapDOM booth embeds fonts')
assert(booth.includes('BOOTH_SLOTS = 2'), 'two SnapDOM hosts can capture at once')
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

const invalidate = extractFn(pool, 'invalidateElement') + extractFn(pool, 'attachPaintedNode')
assert(invalidate.length > 0, 'invalidateElement is exported')
assert(countCall(invalidate, 'clearCache') === 1, 'content change clearCache once')
assert(countCall(invalidate, 'cache') === 1, 'content change cache once')
assert(invalidate.includes('shouldCacheNode'), 'content change cache is skipped for already-raster text')
assert(invalidate.includes('paintElement'), 'content change repaints via paintElement')
assert(invalidate.includes('entry.busy'), 'full scratch paints skip per-element cache and draw')

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

assert(pool.includes('elementStackIds(elements)'), 'applyElementStack reads painter order from slide.elements')
assert(pool.includes('applyStoredStack') && pool.includes('moveToTop') && pool.includes('moveToBottom'), 'applyElementStack restacks painted nodes without inventing zIndex slots')
assert(!extractFn(pool, 'applyElementStack').includes('index + 1'), 'applyElementStack does not assume a background child at index 0')
assert(pool.includes('applyStoredStack(entry)'), 'repainting a node restacks from the stored element list')
assert(!pool.includes('export const setZOrder'), 'raw id lists are not a second z-order API')
assert(read('src/previewRaster/elementStack.ts').includes('export const elementStackIds'), 'element list order is the single stack reader')

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
assert(!subscribe.includes('zOrderChanged ||'), 'a resize patch restacks even when authored order is unchanged')
assert(subscribe.includes('applyElementStack(current.id, current.elements)'), 'paints restack from slide.elements, not a rebuilt id list')
assert(!subscribe.includes('.map(el => el.id)'), 'subscribe does not rebuild a second id stack')
assert(!/let destOverride/.test(subscribe), 'detached dest size is an argument to the paint job, not a process-wide override')
assert(subscribe.includes('paintSlide(slide,'), 'async raster paint keeps the caller dest size')
assert(subscribe.includes('planSlideRaster'), 'element writes are classified as skip / patch / full')
assert(subscribe.includes('patchSlide'), 'a single-element write patches the scratch compositor')
assert(subscribe.includes('snapshotCoversDest'), 'scroll reuse keeps dest snapshots until the slide is invalidated')
assert(subscribe.includes('prepareScratch'), 'full dest paints go through the scratch compositor')
assert(subscribe.includes('finishPaint'), 'paintedById is committed after a successful paint, not before')
assert(subscribe.includes('isScreening'), 'preview raster pauses while presenting')
assert(subscribe.includes('useScreenStore.subscribe'), 'preview raster resumes when screening ends')
assert(subscribe.includes('if (current) applySlide(current)'), 'current slide is enqueued before visible rail thumbs')
assert(subscribe.includes('scalePreviewDisplays'), 'pane drag CSS-scales mounted thumbs')
assert(subscribe.includes('setPreviewDestLiveHandler'), 'pane drag uses a live dest handler')
assert(subscribe.includes('paneResizing'), 'pane drag does not rebuild rasters on every pointer move')
assert(subscribe.includes('rasterPaintContextOf') || subscribe.includes('paintContextOf'), 'slide paints pass contrast context into element painters')
assert(read('src/previewRaster/painters/contrast.ts').includes('resolveLiveTextPaint'), 'raster contrast is the same live paint pass')
assert(read('src/previewRaster/painters/contrast.ts').includes('elements: slide.elements'), 'raster contrast sees sibling paints under overlay labels')
assert(read('src/utils/textContrast.ts').includes('resolveTextPaintSurfaces'), 'paint-time contrast queries the same surfaces as import')
assert(read('src/utils/textContrast.ts').includes('queryBackgroundsUnder'), 'overlay labels contrast against the chip underneath, not the slide paper')
assert(read('src/views/components/element/TextElement/BaseTextElement.tsx').includes('resolveLiveTextPaint'), 'live text uses the shared paint resolver')
assert(read('src/views/components/element/ShapeElement/BaseShapeElement.tsx').includes('resolveLiveTextPaint'), 'live shape labels use the shared paint resolver')
assert(read('src/views/components/element/TextElement/index.tsx').includes('resolveLiveTextPaint'), 'editable text uses the shared paint resolver')
assert(read('src/views/components/element/ShapeElement/index.tsx').includes('resolveLiveTextPaint'), 'editable shape labels use the shared paint resolver')
assert(textPainter.includes('resolveRasterTextPaint'), 'text painter applies automatic contrast before SnapDOM')
assert(read('src/previewRaster/painters/shape.ts').includes('resolveRasterTextPaint'), 'shape labels apply automatic contrast before SnapDOM')
const shapePainter = read('src/previewRaster/painters/shape.ts')
const simpleShape = read('src/previewRaster/simpleShape.ts')
assert(simpleShape.includes('shapeTextIsEmpty'), 'empty imported shape HTML is not treated as labels')
assert(shapePainter.includes('isAxisAlignedRectPath'), 'full-slide PPTX rects paint as Konva.Rect, not a scaled Path')
assert(shapePainter.includes('shapeTextIsEmpty'), 'shape painter skips SnapDOM for empty shape text')
assert(shapePainter.includes('textPaintHtml'), 'rich shape labels use the same ProseMirror HTML builder as text boxes')
assert(shapePainter.includes('paintKonvaHtmlBox'), 'simple shape labels use the shared Konva painter')
assert(shapePainter.includes('shapePaintHtml'), 'non-rect shapes SnapDOM the same SVG the editor paints')
assert(shapePainter.includes('needsHtmlBooth'), 'shape labels booth only when Konva cannot match the HTML')
assert(shapePainter.includes('readTextPaintLayout'), 'shape labels read align and pt sizes from the HTML')
assert(!shapePainter.includes("align: 'center'"), 'shape labels keep authored horizontal alignment')
assert(read('src/previewRaster/textPaintHtml.ts').includes('data-fika-text-paint="prosemirror"'), 'shared text HTML is marked as the live ProseMirror paint')
assert(read('src/previewRaster/textPaintHtml.ts').includes('--paragraphSpace'), 'shared text HTML uses the live paragraph-space variable')
assert(booth.includes('EMBED_ROOT_CLASS'), 'SnapDOM booths sit in the live ProseMirror CSS scope')
assert(!booth.includes("fill: '#f4f4f5'"), 'failed booths must not cover the slide with a gray rectangle')
assert(read('src/views/Editor/Thumbnails/paneSize.ts').includes('PREVIEW_PANE_RESIZE_COMMIT_MS'), 'pane dest commits are debounced after gutter drag')
assert(!extractFn(cache, 'scaleRasterSnapshotView').includes('canvas.width'), 'live pane scale must not realloc the snapshot bitmap')
assert(thumb.includes('getPreviewDestSize'), 'ThumbnailSlide reads dest at paint time instead of re-rastering on every pane pixel')

assert(scheduler.includes('export const enqueueRaster'), 'scheduler exports enqueueRaster')
assert(scheduler.includes('yieldToMain') && scheduler.includes('isInputPending'), 'scheduler time-slices with scheduler.yield / isInputPending')
assert(scheduler.includes('MAX_CONCURRENT_RASTERS'), 'onscreen slide paints can overlap')
assert(scheduler.includes('runningKeys'), 'the same slide never paints twice at once')
assert(scheduler.includes('RASTER_PRIORITY_CURRENT'), 'current-slide jobs have a reserved priority')
assert(scheduler.includes('lqWaiting') && scheduler.includes('currentHqWaiting'), 'visible HQ jobs wait while LQ or current HQ is queued')
assert(scheduler.includes('findIndex'), 'a second enqueue for the same slide replaces the queued job')
assert(booth.includes('clearBoothCache') && booth.includes('boothCacheKey'), 'SnapDOM booths are cached by content hash')
assert(read('src/views/Editor/Thumbnails/paneSize.ts').includes('PREVIEW_RAIL_SUPER_SAMPLE'), 'non-current thumbs use a cheaper working size')
assert(read('src/views/Editor/Thumbnails/paneSize.ts').includes('PREVIEW_LQ_MAX_WORKING'), 'first blit uses a tiny working size')
assert(read('src/previewRaster/lqElements.ts').includes('LQ_SHAPE_CAP'), 'LQ paints a capped set of large shapes')
assert(read('src/previewRaster/planSlideRaster.ts').includes('qualityCovers'), 'a higher-quality blit covers a cheaper rail target')
assert(read('src/previewRaster/subscribeSlides.ts').includes('qualityCovers(have, target)'), 'applySlide does not rebuild a covering sibling')
assert(read('src/previewRaster/stagePool.ts').includes('pinnedCurrentId'), 'the current slide scratch is last to evict')
assert(!extractFn(subscribe, 'watchFontLoads').includes('paintedById.clear()'), 'a font load does not wipe every painted thumb')
assert(read('src/previewRaster/painters/booth.ts').includes('takePendingFontSlides'), 'only slides that waited on a font are rebuilt')
assert(read('src/previewRaster/painters/lq.ts').includes('getCachedPreviewImageBitmap'), 'LQ images use the cache or a placeholder, never fetch')
assert(read('src/utils/imageBitmapCache.ts').includes('resizeWidth'), 'preview decode resizes at createImageBitmap time')
assert(read('src/utils/imageBitmapCache.ts').includes('PREVIEW_BITMAP_MAX_EDGE'), 'preview bitmaps are a separate cache tier')
assert(read('src/utils/imageBitmapCache.ts').includes('subscribePreviewBitmaps'), 'decode completion notifies the raster')
assert(!read('src/utils/imageBitmapCache.ts').includes('if (!jobs.has(key))'), 'a finished decode is not thrown away if the job key was rekeyed')
assert(read('src/previewRaster/painters/image.ts').includes('loadPreviewImageBitmap'), 'HQ image painter uses the preview bitmap tier')
assert(read('src/previewRaster/subscribeSlides.ts').includes('loadPreviewImageBitmap'), 'LQ prefetch decodes at thumb size, not native')
assert(read('src/previewRaster/subscribeSlides.ts').includes('mediaPainted'), 'a covering blit is not settled while slide images are still missing')
assert(read('src/previewRaster/subscribeSlides.ts').includes('subscribePreviewBitmaps'), 'missing preview images retry when the bitmap arrives')
assert(read('src/views/components/ThumbnailSlide/paintedSlide.ts').includes('el.src'), 'thumb paint keys include image srcs')
assert(
  /loadImageBitmap\(src\)/.test(read('src/views/components/element/ImageElement/useImageBitmap.ts')),
  'live canvas still decodes full-resolution bitmaps',
)
assert(scheduler.includes('RASTER_PRIORITY_LQ_CURRENT'), 'LQ current jobs outrank HQ work')
assert(scheduler.includes('runningSlideIds'), 'LQ and HQ for the same slide never run at once')
assert(!extractFn(subscribe, 'resizeVisiblePreviews').includes('paintedById.delete'), 'gutter dest growth keeps the old blit until HQ arrives')
assert(read('src/previewRaster/painters/text.ts').includes('textPaintHtml'), 'list markup paints through the shared HTML booth')
assert(/MAX_PREVIEW_STAGES\s*=\s*[2-9]/.test(pool), 'scratch pool can paint more than one onscreen slide')
assert(
  /MAX_CONCURRENT_RASTERS\s*=\s*3/.test(scheduler) && /MAX_PREVIEW_STAGES\s*=\s*3/.test(pool),
  'queue width matches the scratch pool',
)
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
  'applyElementStack',
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
