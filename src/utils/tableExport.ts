import tinycolor from 'tinycolor2'
import { TABLE_PAPER } from '@/configs/table'

/** PowerPoint cell alpha exposes the slide; themed tables paint over paper in the editor. */
export function tableCellExportFill(fill: { color: string; alpha: number }, themed: boolean) {
  return themed && fill.alpha < 1
    ? { color: tinycolor.mix(TABLE_PAPER, fill.color, fill.alpha * 100).toHexString() }
    : { color: fill.color, transparency: (1 - fill.alpha) * 100 }
}
