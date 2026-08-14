import { bindStyles } from '@/utils/cssm'
import styles from './ImageEllipseOutline.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import type { PPTElementOutline } from '@/types/slides'
import useElementOutline from '@/views/components/element/hooks/useElementOutline'

export type IImageEllipseOutlineProps = {
  width: number
  height: number
  outline?: PPTElementOutline
}

const ImageEllipseOutline = memo((props: IImageEllipseOutlineProps) => {
  const { width, height, outline } = props
  const { outlineWidth, outlineColor, strokeDashArray } = useElementOutline(outline)

  if (!outline) return null

  return (
    <svg className={cx('image-ellipse-outline')} overflow="visible" width={width} height={height}>
      <ellipse
        vectorEffect="non-scaling-stroke"
        strokeLinecap="butt"
        strokeMiterlimit="8"
        fill="transparent"
        cx={width / 2}
        cy={height / 2}
        rx={width / 2}
        ry={height / 2}
        stroke={outlineColor}
        strokeWidth={outlineWidth}
        strokeDasharray={strokeDashArray}
      />
    </svg>
  )
})

export default ImageEllipseOutline
