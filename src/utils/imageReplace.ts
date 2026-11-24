import type { ImageClipDataRange, ImageMediaFit, PPTImageElement } from '@/types/slides'
import { fillPhotoFrame } from '@/views/Myna/photoFrames'

const FULL_IMAGE_RANGE: ImageClipDataRange = [[0, 0], [100, 100]]

const round2 = (value: number) => Math.round(value * 100) / 100

export interface ImageNaturalSize {
  width: number
  height: number
}

export interface AspectFitPatchResult {
  patch: Partial<PPTImageElement>
  removeClip: boolean
}

export interface ManualImageReplacePatchResult {
  patch: Partial<PPTImageElement>
  removeProps: Array<keyof PPTImageElement>
}

// A delayed job addresses the superseded slot. An intentional editor command
// can still replace the same image using its element ID.
const supersededSlots = new Map<string, string>()

export function recordManualImageReplacement(previous: Pick<PPTImageElement, 'id' | 'mediaState'>): void {
  const slotId = previous.mediaState?.slotId
  if (slotId) supersededSlots.set(slotId, previous.id)
}

export function isManualImageReplacementProtected(
  element: Pick<PPTImageElement, 'id' | 'mediaState'>,
  { slotId }: { slotId?: string },
): boolean {
  return !!slotId && element.mediaState?.slotId !== slotId && supersededSlots.get(slotId) === element.id
}

export function findManuallyReplacedElementIdForSlot(slotId: string): string | undefined {
  return supersededSlots.get(slotId)
}

export function clearManualImageReplacementGuard(): void {
  supersededSlots.clear()
}

/**
 * Compute an aspect-preserving patch for replacing an image's source inside
 * its existing box (or fitting inside its box when `fit === 'contain'`).
 */
export function computeImageAspectFitPatch(
  element: PPTImageElement,
  natural: ImageNaturalSize | undefined,
  fit: ImageMediaFit,
  explicitPatch?: Partial<PPTImageElement>,
  options?: { preserveFixedRatio?: boolean },
): AspectFitPatchResult {
  if (!natural || !Number.isFinite(natural.width) || !Number.isFinite(natural.height) || natural.width <= 0 || natural.height <= 0) {
    return { patch: {}, removeClip: false }
  }
  const width = explicitPatch?.width ?? element.width
  const height = explicitPatch?.height ?? element.height
  const left = explicitPatch?.left ?? element.left
  const top = explicitPatch?.top ?? element.top
  if (width <= 0 || height <= 0) return { patch: {}, removeClip: false }
  const boxRatio = width / height
  const imgRatio = natural.width / natural.height
  const fixedRatioPatch = options?.preserveFixedRatio ? {} : { fixedRatio: true }

  if (Math.abs(imgRatio - boxRatio) <= 0.005) {
    const existingShape = element.clip?.shape
    return {
      patch: {
        ...fixedRatioPatch,
        ...(existingShape && existingShape !== 'rect' ? { clip: { shape: existingShape, range: FULL_IMAGE_RANGE } } : {}),
      },
      removeClip: !existingShape || existingShape === 'rect',
    }
  }

  if (fit === 'contain') {
    let nextLeft = left
    let nextTop = top
    let nextWidth = width
    let nextHeight = height
    if (imgRatio > boxRatio) {
      const fitted = width / imgRatio
      nextTop += (height - fitted) / 2
      nextHeight = fitted
    }
    else {
      const fitted = height * imgRatio
      nextLeft += (width - fitted) / 2
      nextWidth = fitted
    }
    const existingShape = element.clip?.shape
    return {
      patch: {
        left: Math.round(nextLeft),
        top: Math.round(nextTop),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
        ...fixedRatioPatch,
        ...(existingShape && existingShape !== 'rect' ? { clip: { shape: existingShape, range: FULL_IMAGE_RANGE } } : {}),
      },
      removeClip: !existingShape || existingShape === 'rect',
    }
  }

  const shape = element.clip?.shape ?? 'rect'
  if (imgRatio > boxRatio) {
    const keep = boxRatio / imgRatio * 100
    const start = (100 - keep) / 2
    return {
      patch: {
        ...fixedRatioPatch,
        clip: { shape, range: [[round2(start), 0], [round2(start + keep), 100]] },
      },
      removeClip: false,
    }
  }
  const keep = imgRatio / boxRatio * 100
  const start = (100 - keep) / 2
  return {
    patch: {
      ...fixedRatioPatch,
      clip: { shape, range: [[0, round2(start)], [100, round2(start + keep)]] },
    },
    removeClip: false,
  }
}

/**
 * Build the store update payload for manually replacing an image element's
 * source while preserving its element ID, bounds, crop/fit shape, decorations,
 * and clearing any pending/error `mediaState`.
 */
export function buildManualImageReplacePatch(
  element: PPTImageElement,
  src: string,
  natural: ImageNaturalSize,
): ManualImageReplacePatchResult {
  const removeProps: Array<keyof PPTImageElement> = []
  if (element.mediaState !== undefined) removeProps.push('mediaState')

  if (element.photoFrame) {
    const filled = fillPhotoFrame(element, src, natural.width, natural.height)
    return {
      patch: {
        src: filled.src,
        clip: filled.clip,
        photoFrame: filled.photoFrame,
      },
      removeProps,
    }
  }

  const fit: ImageMediaFit = element.mediaState?.fit ?? 'cover'
  const fitResult = computeImageAspectFitPatch(element, natural, fit, undefined, { preserveFixedRatio: true })
  if (fitResult.removeClip) removeProps.push('clip')

  return {
    patch: {
      ...fitResult.patch,
      src,
    },
    removeProps,
  }
}

/**
 * Verify that an image URL or data/blob URL loads and decodes to positive
 * natural dimensions without attaching a persistent node to the document.
 */
export function decodeImageSource(src: string, signal?: AbortSignal): Promise<ImageNaturalSize> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Image source is empty'))
      return
    }
    if (signal?.aborted) {
      reject(new DOMException('Image decode aborted', 'AbortError'))
      return
    }

    const img = new Image()
    let settled = false

    const cleanup = () => {
      img.onload = null
      img.onerror = null
      signal?.removeEventListener('abort', onAbort)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const succeed = () => {
      if (settled) return
      const width = img.naturalWidth
      const height = img.naturalHeight
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        fail(new Error('Image dimensions must be positive'))
        return
      }
      settled = true
      cleanup()
      resolve({ width, height })
    }

    const onAbort = () => {
      img.src = ''
      fail(new DOMException('Image decode aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })

    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(succeed, () => {
          // Some browsers reject decode() for valid SVGs even after onload succeeds.
          if (img.naturalWidth > 0 && img.naturalHeight > 0 && /^data:image\/svg\+xml/i.test(src)) {
            succeed()
            return
          }
          fail(new Error('Unable to decode image'))
        })
      }
      else {
        succeed()
      }
    }

    img.onerror = () => {
      fail(new Error('Unable to decode image'))
    }

    img.src = src
  })
}
