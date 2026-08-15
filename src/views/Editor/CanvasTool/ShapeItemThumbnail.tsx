import { bindStyles } from '@/utils/cssm'
import styles from './ShapeItemThumbnail.module.scss'
const cx = bindStyles(styles)
import { memo, type CSSProperties, type MouseEventHandler } from 'react'
import type { ShapePoolItem } from '@/configs/shapes'

export type IShapeItemThumbnailProps = {
  shape: ShapePoolItem
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLDivElement>
  onSelect?: (shape: ShapePoolItem) => void
}

function ShapeItemThumbnail({ shape, className, style, onClick, onSelect }: IShapeItemThumbnailProps) {
  return (
    <div
      className={cx('shape-item-thumbnail', className)}
      data-shape-item=""
      data-shape-formula={shape.pathFormula || 'static'}
      style={style}
      onClick={event => {
        onSelect?.(shape)
        onClick?.(event)
      }}
    >
      <div className={cx('shape-content')}>
        <svg
          overflow="visible"
          width="18"
          height="18"
        >
          <g
            transform={`scale(${18 / shape.viewBox[0]}, ${18 / shape.viewBox[1]}) translate(0,0) matrix(1,0,0,1,0,0)`}
          >
            <path
              className={cx('shape-path', { outlined: shape.outlined })}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="butt"
              strokeMiterlimit={8}
              fill={shape.outlined ? '#999' : 'transparent'}
              stroke={shape.outlined ? 'transparent' : '#999'}
              strokeWidth="2"
              d={shape.path}
            />
          </g>
        </svg>
      </div>
    </div>
  )
}

export default memo(ShapeItemThumbnail)
