import Konva from 'konva'
import type { PPTImageElement } from '@/types/slides'
import { loadImageBitmap } from '@/utils/imageBitmapCache'
import {
  drawImageClip,
  imageClipKind,
  imageClipPathData,
  imageCornerRadius,
  imageCropRect,
  imageOpacity,
  outlineStrokePaint,
  shadowPaint,
} from '@/utils/elementPaint'

const frame = (
  width: number,
  height: number,
  rotate: number,
  flipH?: boolean,
  flipV?: boolean,
  shadow?: PPTImageElement['shadow'],
  opacity = 1,
) => {
  const root = new Konva.Group({ listening: false, opacity })
  const pivoted = new Konva.Group({
    x: width / 2,
    y: height / 2,
    offsetX: width / 2,
    offsetY: height / 2,
    rotation: rotate,
    listening: false,
    ...shadowPaint(shadow),
  })
  const content = new Konva.Group({
    x: width / 2,
    y: height / 2,
    offsetX: width / 2,
    offsetY: height / 2,
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1,
    listening: false,
  })
  pivoted.add(content)
  root.add(pivoted)
  return { root, content }
}

const addImageOutline = (content: Konva.Group, element: PPTImageElement) => {
  const stroke = outlineStrokePaint(element.outline)
  if (!stroke.strokeEnabled) return
  const kind = imageClipKind(element)
  const w = element.width
  const h = element.height
  if (kind === 'ellipse') {
    content.add(new Konva.Path({
      data: `M ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2 - 0.001} Z`,
      fillEnabled: false,
      listening: false,
      ...stroke,
    }))
    return
  }
  const pathData = imageClipPathData(element)
  if (pathData) {
    content.add(new Konva.Path({
      data: pathData,
      fillEnabled: false,
      listening: false,
      ...stroke,
    }))
    return
  }
  content.add(new Konva.Rect({
    width: w,
    height: h,
    cornerRadius: imageCornerRadius(element),
    fillEnabled: false,
    listening: false,
    ...stroke,
  }))
}

export const paintImage = async (element: PPTImageElement) => {
  const { root, content } = frame(
    element.width,
    element.height,
    element.rotate,
    element.flipH,
    element.flipV,
    element.shadow,
    imageOpacity(element.filters),
  )
  const bitmap = await loadImageBitmap(element.src)
  const kind = imageClipKind(element)
  const radius = imageCornerRadius(element)
  const needsClip = kind !== 'rect' || radius > 0
  const clipped = new Konva.Group({
    listening: false,
    clipFunc: needsClip ? (ctx) => drawImageClip(ctx, element) : undefined,
  })

  if (!bitmap) {
    clipped.add(new Konva.Rect({
      width: element.width,
      height: element.height,
      fill: '#e4e4e7',
      cornerRadius: kind === 'rect' ? radius : 0,
      listening: false,
    }))
  }
  else {
    clipped.add(new Konva.Image({
      image: bitmap,
      width: element.width,
      height: element.height,
      crop: imageCropRect(element.clip, bitmap.width, bitmap.height),
      listening: false,
    }))
  }

  if (element.colorMask) {
    clipped.add(new Konva.Rect({
      width: element.width,
      height: element.height,
      fill: element.colorMask,
      listening: false,
    }))
  }

  content.add(clipped)
  addImageOutline(content, element)
  return root
}
