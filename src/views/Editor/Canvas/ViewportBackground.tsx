import { bindStyles } from '@/utils/cssm'
import styles from './ViewportBackground.module.scss'
const cx = bindStyles(styles)
import { memo, type CSSProperties } from 'react'

import { useMainStore, useSlidesStore, useKeyboardStore, selectCurrentSlide } from '@/store'
import { resolveGridSize } from '@/utils/snap'
import GridLines from './GridLines'
import useSlideBackgroundStyle from '@/hooks/useSlideBackgroundStyle'

const ViewportBackground = memo(({ showGrid = true, operateLineColor }: { showGrid?: boolean; operateLineColor?: string }) => {
  const gridLineSize = useMainStore(s => s.gridLineSize)
  const altKeyState = useKeyboardStore(s => s.altKeyState)
  const background = useSlidesStore(s => selectCurrentSlide(s)?.background)
  const slideId = useSlidesStore(s => selectCurrentSlide(s)?.id)
  const { backgroundStyle } = useSlideBackgroundStyle(background)
  const previewGrid = altKeyState && !gridLineSize
  const effectiveSize = resolveGridSize(gridLineSize, altKeyState) || gridLineSize
  const style: CSSProperties = showGrid && effectiveSize && operateLineColor
    ? ({ ...backgroundStyle, '--operate-line': operateLineColor } as CSSProperties)
    : backgroundStyle

  return (
    <div key={slideId} className={cx('viewport-background')} data-live-background style={style}>
      {showGrid && effectiveSize ? <GridLines size={effectiveSize} ephemeral={previewGrid} /> : null}
    </div>
  )
})

export default ViewportBackground
