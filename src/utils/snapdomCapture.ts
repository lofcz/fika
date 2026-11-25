/**
 * SnapDOM v3 capture helpers.
 *
 * Width/height are the final CSS size (they win over `scale`). `dpr` defaults
 * to 1 so those dimensions are also the pixel size — pass `dpr: 2` when a
 * booth needs a hidpi backing store. Fonts embed automatically (`'auto'`);
 * pass `false` only to skip webfonts the way the old `fontEmbedCSS: ''` did.
 */
import type { SnapdomOptions } from '@zumer/snapdom'

let snapdomLoader: Promise<(typeof import('@zumer/snapdom'))['snapdom']> | null = null
const loadSnapdom = () => {
  if (!snapdomLoader) {
    snapdomLoader = import('@zumer/snapdom').then(mod => mod.snapdom).catch(err => {
      snapdomLoader = null
      throw err
    })
  }
  return snapdomLoader
}

export type SnapdomCaptureOptions = Pick<
  SnapdomOptions,
  | 'width'
  | 'height'
  | 'dpr'
  | 'quality'
  | 'embedFonts'
  | 'backgroundColor'
  | 'exclude'
  | 'excludeMode'
  | 'filter'
  | 'filterMode'
  | 'invalidate'
  | 'canvas'
  | 'reconcile'
>

const withDefaults = (options: SnapdomCaptureOptions = {}): SnapdomOptions => ({
  dpr: 1,
  ...options,
})

export const prefetchSnapdom = () => {
  void loadSnapdom().catch(() => {})
}

export const captureToCanvas = async (
  element: Element,
  options?: SnapdomCaptureOptions,
): Promise<HTMLCanvasElement> => {
  const snapdom = await loadSnapdom()
  return snapdom.toCanvas(element, withDefaults(options))
}

export const captureToPngDataUrl = async (
  element: Element,
  options?: SnapdomCaptureOptions,
): Promise<string> => {
  const canvas = await captureToCanvas(element, options)
  return canvas.toDataURL('image/png')
}

export const captureToJpegDataUrl = async (
  element: Element,
  options?: SnapdomCaptureOptions,
): Promise<string> => {
  const canvas = await captureToCanvas(element, {
    backgroundColor: '#ffffff',
    ...options,
  })
  return canvas.toDataURL('image/jpeg', options?.quality ?? 0.92)
}
