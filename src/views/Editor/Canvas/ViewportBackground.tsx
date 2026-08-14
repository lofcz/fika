import { bindStyles } from '@/utils/cssm'
import styles from './ViewportBackground.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import { useMainStore, useSlidesStore, useKeyboardStore, selectCurrentSlide } from '@/store'
import { resolveGridSize } from '@/utils/snap'
import GridLines from './GridLines'
import useSlideBackgroundStyle from '@/hooks/useSlideBackgroundStyle'

const ViewportBackground = memo(() => {
  const gridLineSize = useMainStore(s => s.gridLineSize)
  const altKeyState = useKeyboardStore(s => s.altKeyState)
  const currentSlide = useSlidesStore(selectCurrentSlide)
  const background = currentSlide?.background
  const { backgroundStyle } = useSlideBackgroundStyle(background)
  const previewGrid = altKeyState && !gridLineSize
  const effectiveSize = resolveGridSize(gridLineSize, altKeyState) || gridLineSize

  return (
    <div className={cx('viewport-background')} style={backgroundStyle}>
      {effectiveSize ? <GridLines size={effectiveSize} ephemeral={previewGrid} /> : null}
    </div>
  )
})

export default ViewportBackground
