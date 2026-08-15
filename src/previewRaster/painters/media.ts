import Konva from 'konva'
import type { PPTAudioElement, PPTVideoElement } from '@/types/slides'
import { loadPreviewImageBitmap } from '@/utils/imageBitmapCache'

const iconStub = (element: PPTVideoElement | PPTAudioElement) => {
  const group = new Konva.Group({ listening: false })
  const isAudio = element.type === 'audio'
  group.add(new Konva.Rect({
    width: element.width,
    height: element.height,
    fill: isAudio ? (element.color || '#18181b') : '#18181b',
    listening: false,
  }))
  const cx = element.width / 2
  const cy = element.height / 2
  const r = Math.min(element.width, element.height) * 0.16
  group.add(new Konva.Circle({
    x: cx,
    y: cy,
    radius: r,
    fill: 'rgba(255,255,255,0.18)',
    listening: false,
  }))
  if (isAudio) {
    group.add(new Konva.Rect({
      x: cx - r * 0.35,
      y: cy - r * 0.28,
      width: r * 0.28,
      height: r * 0.56,
      fill: '#fafafa',
      listening: false,
    }))
    group.add(new Konva.Wedge({
      x: cx - r * 0.08,
      y: cy,
      radius: r * 0.42,
      angle: 70,
      rotation: -35,
      fill: '#fafafa',
      listening: false,
    }))
  }
  else {
    group.add(new Konva.RegularPolygon({
      x: cx + r * 0.08,
      y: cy,
      sides: 3,
      radius: r * 0.42,
      rotation: 90,
      fill: '#fafafa',
      listening: false,
    }))
  }
  return group
}

export const paintMedia = async (element: PPTVideoElement | PPTAudioElement) => {
  const poster = element.poster
  if (poster) {
    const bitmap = await loadPreviewImageBitmap(poster)
    if (bitmap) {
      return new Konva.Image({
        image: bitmap,
        width: element.width,
        height: element.height,
        listening: false,
      })
    }
  }
  return iconStub(element)
}
