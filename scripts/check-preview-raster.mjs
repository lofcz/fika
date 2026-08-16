/**
 * Architecture guard for the live-DOM thumbnail rail + snapshot cache.
 *
 * Thumbnails ARE the slide: a mounted thumb renders the genuine ScreenSlide
 * tree scaled with a CSS transform — the same renderer the presenter uses —
 * so the rail cannot drift from the editor canvas. On top of that, a row
 * that leaves the virtualizer window is snapshotted from that same tree
 * (thumbSnapshot.ts) and re-enters as an <img>. Nothing is captured ahead
 * of the viewport. The bitmap is only ever displayed while its key (slide
 * object identity, theme, viewport geometry, thumb box) still matches the
 * store.
 * (The old Konva-painter pipeline was a re-implementation and was removed;
 * capture now happens through snapdom from the real tree, off the display
 * path, with only the USED font families embedded.)
 *
 * These asserts keep the properties that make it fast and faithful.
 */
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

const liveThumb = read('src/views/components/ThumbnailSlide/LiveSlideThumb.tsx')
const thumbnail = read('src/views/components/ThumbnailSlide/index.tsx')
const scss = read('src/views/components/ThumbnailSlide/index.module.scss')

assert(liveThumb.includes("from '@/views/Screen/ScreenSlide'"), 'the thumbnail renders the genuine ScreenSlide tree')
assert(liveThumb.includes('SlideCaptureContext.Provider'), 'thumbnails mark the tree with SlideCaptureContext (media render paused)')
assert(liveThumb.includes('SlideScaleContext.Provider'), 'thumbnails provide SlideScaleContext like the editor canvas does')
assert(liveThumb.includes('animationIndex={Number.MAX_SAFE_INTEGER}'), 'animated elements are visible in thumbnails')
assert(liveThumb.includes('scale={scale}'), 'ScreenSlide scales itself (presenter path) — never a wrapper transform on top')
assert(!liveThumb.includes('live-slide-thumb-scale'), 'no double-scaling wrapper: the viewport transform is applied exactly once')
assert(liveThumb.includes('arePaintedSlideIdentitiesEqual'), 'thumbs re-render only when the slide object identity changes')

assert(thumbnail.includes('LiveSlideThumb'), 'ThumbnailSlide displays the live slide DOM')
assert(!thumbnail.includes('previewRaster'), 'ThumbnailSlide has no raster pipeline dependency')
assert(!thumbnail.includes('data-raster-pending'), 'no raster-pending skeleton state remains')
assert(scss.includes('pointer-events: none'), 'thumbnail content is not interactive')

const shape = read('src/views/components/element/ShapeElement/BaseShapeElement.tsx')
const text = read('src/views/components/element/TextElement/BaseTextElement.tsx')
const chart = read('src/views/components/element/ChartElement/BaseChartElement.tsx')
assert(shape.includes('selectSlideById'), 'shape contrast resolves the owning slide, not the editor current slide')
assert(text.includes('selectSlideById'), 'text contrast resolves the owning slide, not the editor current slide')
assert(chart.includes('selectSlideById'), 'chart contrast resolves the owning slide, not the editor current slide')
assert(shape.includes('SlideIdContext') && text.includes('SlideIdContext') && chart.includes('SlideIdContext'), 'owning-slide resolution comes from SlideIdContext')

const video = read('src/views/components/element/VideoElement/ScreenVideoElement.tsx')
const audio = read('src/views/components/element/AudioElement/ScreenAudioElement.tsx')
assert(video.includes('SlideCaptureContext') && audio.includes('SlideCaptureContext'), 'media players render for thumbnails')
assert(video.includes('capture ? false : elementInfo.autoplay'), 'video autoplay never fires inside a thumbnail')
assert(audio.includes('capture ? false : elementInfo.autoplay'), 'audio autoplay never fires inside a thumbnail')

assert(read('src/types/injectKey.ts').includes('SlideCaptureContext'), 'SlideCaptureContext is a shared inject key')
assert(read('src/store/slides.ts').includes('selectSlideById'), 'the store exposes per-id slide selection')

const draggable = read('src/components/Draggable.tsx')
assert(draggable.includes('LiveSlideThumb'), 'the drag ghost is the live slide DOM at thumb size')
assert(draggable.includes('overlayRender'), 'the slide drag ghost is opt-in — generic lists keep their own behavior')

const pkg = read('package.json')
assert(!pkg.includes('"konva"'), 'konva dependency is gone with the painter stack')

assert(!read('src/views/Editor/Thumbnails/index.tsx').includes('previewRaster'), 'the rail wires no raster subscription')
assert(!read('src/views/Editor/Thumbnails/index.tsx').includes('ThumbSnapshotSweeper'), 'the rail does not pre-render slides outside the viewport')

// --- snapshot cache invariants (see src/.../thumbSnapshot.ts) ---
const snapshot = read('src/views/components/ThumbnailSlide/thumbSnapshot.ts')
assert(snapshot.includes('MAX_SNAPSHOTS'), 'the snapshot cache is LRU-bounded')
assert(snapshot.includes('revokeObjectURL'), 'evicted snapshot blob URLs are revoked')
assert(snapshot.includes('depsEqual'), 'snapshots are keyed by full render identity (slide/theme/geometry/box)')
assert(snapshot.includes('excludeFonts'), 'capture embeds ONLY used font families — unused declared families are excluded')
assert(snapshot.includes('draining'), 'captures are single-flight through one idle queue')
assert(snapshot.includes('teardownThumbSnapshot'), 'snapshots are taken when the virtualizer tears a row down')
assert(snapshot.includes('HOSTILE_CAPTURE_MS'), 'slides whose capture measures slow are marked hostile, not retried forever')
assert(!snapshot.includes('preCache'), 'snapdom preCache must not scan the whole document')
assert(liveThumb.includes('snapshot ? ('), 'a row with a bitmap never mounts a live tree')
assert(!liveThumb.includes('requestThumbCapture'), 'visible rows do not capture — only teardown does')

if (failures.length) {
  console.error(`check-preview-raster: ${failures.length} failure(s)`)
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log('check-preview-raster: ok')
