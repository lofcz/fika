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
  // CSS rotates around the box center; changing that center needs compensation.
  const dx = left + width / 2 - (element.left + element.width / 2)
  const dy = top + height / 2 - (element.top + element.height / 2)
  const angle = element.rotate * Math.PI / 180
  return {
    width,
    height,
    left: left + dx * Math.cos(angle) - dy * Math.sin(angle) - dx,
    top: top + dx * Math.sin(angle) + dy * Math.cos(angle) - dy,
  }
}
