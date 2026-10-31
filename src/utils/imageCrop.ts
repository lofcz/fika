import type { ImageClipDataRange, PPTImageElement } from '@/types/slides'

/** Change the crop box while keeping the full bitmap fixed in slide coordinates. */
export const imageCropGeometry = (element: PPTImageElement, range: ImageClipDataRange) => {
  const [start, end] = element.clip?.range ?? [[0, 0], [100, 100]]
  const fullWidth = element.width * 100 / (end[0] - start[0])
  const fullHeight = element.height * 100 / (end[1] - start[1])
  const width = fullWidth * (range[1][0] - range[0][0]) / 100
  const height = fullHeight * (range[1][1] - range[0][1]) / 100
  const left = element.left + fullWidth * (range[0][0] - start[0]) / 100
  const top = element.top + fullHeight * (range[0][1] - start[1]) / 100
  // Mirroring and rotation both act around the crop box center.
  const dx = left + width / 2 - (element.left + element.width / 2)
  const dy = top + height / 2 - (element.top + element.height / 2)
  const mirroredX = element.flipH ? -dx : dx
  const mirroredY = element.flipV ? -dy : dy
  const angle = element.rotate * Math.PI / 180
  return {
    width,
    height,
    left: left + mirroredX * Math.cos(angle) - mirroredY * Math.sin(angle) - dx,
    top: top + mirroredX * Math.sin(angle) + mirroredY * Math.cos(angle) - dy,
  }
}
