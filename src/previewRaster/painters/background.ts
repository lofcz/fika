import Konva from 'konva'
import type { SlideBackground } from '@/types/slides'
import { loadImageBitmap } from '@/utils/imageBitmapCache'
import {
  fitRect,
  linearGradientPaint,
  patternImageSource,
  radialGradientPaint,
} from '@/utils/elementPaint'

export const paintBackground = async (
  background: SlideBackground | undefined,
  themeBackgroundColor: string,
  width: number,
  height: number,
) => {
  const group = new Konva.Group({ listening: false })
  const fallback = background?.type === 'solid' && background.color
    ? background.color
    : themeBackgroundColor || '#ffffff'

  if (background?.type === 'gradient' && background.gradient) {
    const gradient = background.gradient
    group.add(new Konva.Rect({
      x: 0,
      y: 0,
      width,
      height,
      listening: false,
      ...(gradient.type === 'radial'
        ? radialGradientPaint(width, height, gradient, 'css')
        : linearGradientPaint(width, height, gradient)),
    }))
  }
  else {
    group.add(new Konva.Rect({
      x: 0,
      y: 0,
      width,
      height,
      fill: fallback,
      listening: false,
    }))
  }

  if (background?.type === 'image' && background.image?.src) {
    const bitmap = await loadImageBitmap(background.image.src)
    if (bitmap) {
      const size = background.image.size || 'cover'
      if (size === 'repeat') {
        const scale = Math.min(width / bitmap.width, height / bitmap.height)
        group.add(new Konva.Rect({
          x: 0,
          y: 0,
          width,
          height,
          fillPatternImage: patternImageSource(bitmap),
          fillPatternRepeat: 'repeat',
          fillPatternScaleX: scale,
          fillPatternScaleY: scale,
          listening: false,
        }))
      }
      else {
        const fitted = fitRect(bitmap.width, bitmap.height, width, height, size)
        const clipped = new Konva.Group({
          listening: false,
          clip: { x: 0, y: 0, width, height },
        })
        clipped.add(new Konva.Image({
          image: bitmap,
          ...fitted,
          listening: false,
        }))
        group.add(clipped)
      }
    }
  }

  return group
}
