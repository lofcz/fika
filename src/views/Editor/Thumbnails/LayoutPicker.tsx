import { bindStyles } from '@/utils/cssm'
import styles from './LayoutPicker.module.scss'
const cx = bindStyles(styles)
import { useCallback, useMemo, useRef, memo, type CSSProperties } from 'react'

import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import {
  buildContentSlide,
  buildEndSlide,
  buildStatSlide,
  buildTitleSlide,
  buildThreeColumnSlide,
  buildTwoColumnSlide,
} from '@/configs/starterPresentation'
import { applyPresetToLayoutSlide, matchPresetTheme } from '@/configs/theme'
import { useI18nContext } from '@/i18n/useI18nContext'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'

export type ILayoutPickerProps = {
  onSelect?: (payload: Slide) => void
  className?: string
  style?: CSSProperties
}

const LayoutPicker = memo((props: ILayoutPickerProps) => {
  const { LL } = useI18nContext()
  const theme = useSlidesStore(s => s.theme)

  const starterOptions = useMemo(() => ({
    backgroundColor: theme.backgroundColor,
    fontColor: theme.fontColor,
    fontName: theme.fontName,
  }), [theme.backgroundColor, theme.fontColor, theme.fontName])

  const layouts = useMemo(() => {
    const names = LL.editor.thumbnails.layouts
    const options = starterOptions
    const preset = matchPresetTheme(theme.themeColors)
    const items = [
      { id: 'cover', name: names.cover(), index: 0, slide: buildTitleSlide(LL, options) },
      { id: 'content', name: names.content(), index: 1, slide: buildContentSlide(LL, options) },
      { id: 'twoColumn', name: names.twoColumn(), index: 2, slide: buildTwoColumnSlide(LL, options) },
      { id: 'threeColumn', name: names.threeColumn(), index: 3, slide: buildThreeColumnSlide(LL, options) },
      { id: 'stat', name: names.stat(), index: 0, slide: buildStatSlide(LL, options) },
      { id: 'end', name: names.end(), index: 0, slide: buildEndSlide(LL, options) },
    ]

    for (const item of items) {
      item.slide.id = `layout-${item.id}`
      if (preset) applyPresetToLayoutSlide(item.slide, preset, item.index)
    }
    return items
  }, [LL, starterOptions, theme.themeColors])

  const onSelectRef = useRef(props.onSelect)
  onSelectRef.current = props.onSelect

  const pick = useCallback((slide: Slide) => {
    onSelectRef.current?.(JSON.parse(JSON.stringify(slide)) as Slide)
  }, [])

  return (
    <div className={cx('layout-picker', props.className)} style={props.style}>
      {layouts.map(item => (
        <button
          key={item.id}
          type="button"
          className={cx('layout-card')}
          onMouseDown={event => event.preventDefault()}
          onClick={() => pick(item.slide)}
        >
          <ThumbnailSlide className={cx('thumbnail')} slide={item.slide} size={168} showPlaceholders />
          <span className={cx('layout-name')}>{item.name}</span>
        </button>
      ))}
    </div>
  )
})

export default LayoutPicker
