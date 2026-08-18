import { bindStyles } from '@/utils/cssm'
import styles from './ImageRectOutline.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import type { PPTElementOutline } from '@/types/slides'
import { resolveOutlineRadiusPx } from '@/utils/elementOutline'
import useElementOutline from '@/views/components/element/hooks/useElementOutline'

export type IImageRectOutlineProps = {
  width: number
  height: number
  outline?: PPTElementOutline
  radius?: string
}

const ImageRectOutline = memo((props: IImageRectOutlineProps) => {
  const { width, height, outline, radius = '0' } = props
  const { outlineWidth, outlineColor, strokeDashArray } = useElementOutline(outline)
  const effectiveRadius = (() => {
    if (outline?.radius) {
      return resolveOutlineRadiusPx(outline.radius, width, height)
    }
    const parsed = parseFloat(String(radius).replace('px', ''))
    return Number.isFinite(parsed) ? parsed : 0
  })()

  if (!outline) return null

  return (
    <svg className={cx('image-rect-outline')} overflow="visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height="100%">
      <rect
        vectorEffect="non-scaling-stroke"
        strokeLinecap="butt"
        strokeMiterlimit="8"
        fill="transparent"
        rx={effectiveRadius}
        ry={effectiveRadius}
        width={width}
        height={height}
        stroke={outlineColor}
        strokeWidth={outlineWidth}
        strokeDasharray={strokeDashArray}
      />
    </svg>
  )
})

export default ImageRectOutline
