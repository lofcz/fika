import { useMemo } from 'react'
import { useSlidesStore } from '@/store'
import { preferredInk, resolveSlideSurfaceColors } from '@/utils/textContrast'

const OPERATE_INK = '#18181b'
const OPERATE_LIGHT = '#ffffff'

/** Selection chrome: white on dark slides, ink on light — same polarity as default text. */
export default () => {
  const background = useSlidesStore(s => s.slides[s.slideIndex]?.background)
  const themeBackgroundColor = useSlidesStore(s => s.theme.backgroundColor)
  const operateLineColor = useMemo(() => {
    const surfaces = resolveSlideSurfaceColors(background, themeBackgroundColor)
    return preferredInk(surfaces) === '#ffffff' ? OPERATE_LIGHT : OPERATE_INK
  }, [background, themeBackgroundColor])
  return {
    operateLineColor,
  }
}
