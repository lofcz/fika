import { bindStyles } from '@/utils/cssm'
import styles from './ImagePolygonOutline.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import type { PPTElementOutline } from '@/types/slides'
import useElementOutline from '@/views/components/element/hooks/useElementOutline'

export type IImagePolygonOutlineProps = {
  width: number
  height: number
  createPath: (width: number, height: number) => string
  outline?: PPTElementOutline
}

const ImagePolygonOutline = memo((props: IImagePolygonOutlineProps) => {
  const { width, height, createPath, outline } = props
  const { outlineWidth, outlineColor, strokeDashArray } = useElementOutline(outline)

  if (!outline) return null

  return (
    <svg className={cx('image-polygon-outline')} overflow="visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height="100%">
      <path
        vectorEffect="non-scaling-stroke"
        strokeLinecap="butt"
        strokeMiterlimit="8"
        fill="transparent"
        d={createPath(width, height)}
        stroke={outlineColor}
        strokeWidth={outlineWidth}
        strokeDasharray={strokeDashArray}
      />
    </svg>
  )
})

export default ImagePolygonOutline
