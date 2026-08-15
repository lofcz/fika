import { useMemo } from 'react'
import { useSlidesStore } from '@/store'
import { preferredInk, resolveSlideSurfaceColors } from '@/utils/textContrast'

const OPERATE_INK = '#18181b'
const OPERATE_LIGHT = '#ffffff'

/**
 * Editor overlay polarity from the slide's known fill — O(1), no pixel reads.
 * Image / gradient slides use the same representative surface as text contrast.
 * A contrasting halo covers mixed patches (photo, white card on a dark slide)
 * so guides stay visible without sampling during drag.
 */
export default () => {
  const background = useSlidesStore(s => s.slides[s.slideIndex]?.background)
  const themeBackgroundColor = useSlidesStore(s => s.theme.backgroundColor)
  const { operateLineColor, operateLineHalo } = useMemo(() => {
    const surfaces = resolveSlideSurfaceColors(background, themeBackgroundColor)
    const light = preferredInk(surfaces) === '#ffffff'
    return {
      operateLineColor: light ? OPERATE_LIGHT : OPERATE_INK,
      operateLineHalo: light ? OPERATE_INK : OPERATE_LIGHT,
    }
  }, [background, themeBackgroundColor])
  return {
    operateLineColor,
    operateLineHalo,
  }
}
