import { bindStyles } from '@/utils/cssm'
import styles from './AnimationIndex.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import { useMainStore } from '@/store'
import type { PPTElement } from '@/types/slides'
import type { getElementRange } from '@/utils/element'

export type IAnimationIndexProps = {
  elementInfo: PPTElement
  range: ReturnType<typeof getElementRange>
  indexList: number[]
}

function animationIndexEqual(prev: IAnimationIndexProps, next: IAnimationIndexProps) {
  return (
    prev.elementInfo.id === next.elementInfo.id &&
    prev.range.minX === next.range.minX &&
    prev.range.minY === next.range.minY &&
    prev.range.maxX === next.range.maxX &&
    prev.range.maxY === next.range.maxY &&
    prev.indexList.length === next.indexList.length &&
    prev.indexList.every((value, index) => value === next.indexList[index])
  )
}

const AnimationIndex = memo((props: IAnimationIndexProps) => {
  const { indexList } = props
  const canvasScale = useMainStore(s => s.canvasScale)

  const animationIndexStyle = (() => {
    const { minX, minY } = props.range
    return {
      left: minX * canvasScale - 24 + 'px',
      top: minY * canvasScale + 'px',
    }
  })()

  return (
    <div className={cx('animation-index')} style={animationIndexStyle}>
      {indexList.map(index => (
        <div className={cx('index-item')} key={index}>{index + 1}</div>
      ))}
    </div>
  )
}, animationIndexEqual)

AnimationIndex.displayName = 'AnimationIndex'

export default AnimationIndex
