import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ThemeStylesExtract.module.scss'
const cx = bindStyles(styles)
import { useMemo, useState, useEffect, type CSSProperties } from 'react'
import tinycolor from 'tinycolor2'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import { useFonts } from '@/configs/font'
import useSlideTheme from '@/hooks/useSlideTheme'
import Tabs from '@/components/Tabs'
import Button from '@/components/Button'
import type { SlideTheme } from '@/types/slides'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'

interface TabItem {
  key: 'single' | 'all'
  label: string
}

export type IThemeStylesExtractProps = {
  onClose?: () => void
  className?: string
  style?: CSSProperties
}

export default function ThemeStylesExtract({ onClose, className, style }: IThemeStylesExtractProps) {
  const { LL } = useI18nContext()
  const fonts = useFonts()
  const { getSlidesThemeStyles } = useSlideTheme()

  const tabs = useMemo<TabItem[]>(() => [
    { key: 'single', label: LL.editor.slideDesign.themeExtract.fromCurrentSlide() },
    { key: 'all', label: LL.editor.slideDesign.themeExtract.fromAllSlides() },
  ], [LL])

  const [activeTab, setActiveTab] = useState<'single' | 'all'>('single')

  const fontMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const item of fonts) {
      map[item.value] = item.label
    }
    return map
  }, [fonts])

  const [themeStyles, setThemeStyles] = useState<ReturnType<typeof getSlidesThemeStyles>>({
    backgroundColors: [],
    themeColors: [],
    fontColors: [],
    fontNames: [],
  })

  const [selectedIndex, setSelectedIndex] = useState({
    backgroundColor: 0,
    themeColors: [0],
    fontColor: 0,
    fontName: 0,
  })

  useEffect(() => {
    const state = useSlidesStore.getState()
    const currentSlide = selectCurrentSlide(state)
    const nextStyles = activeTab === 'single'
      ? getSlidesThemeStyles(currentSlide!)
      : getSlidesThemeStyles(state.slides)
    setThemeStyles(nextStyles)

    const themeColors = []
    for (let i = 0; i < Math.min(nextStyles.themeColors.length); i++) {
      themeColors.push(i)
    }

    setSelectedIndex({
      backgroundColor: 0,
      fontColor: 0,
      fontName: 0,
      themeColors,
    })
  }, [activeTab])

  const updateTheme = (themeProps: Partial<SlideTheme>) => {
    useSlidesStore.getState().setTheme(themeProps)
  }

  const updateAllThemes = () => {
    let themeColors = themeStyles.themeColors.filter((item, index) => selectedIndex.themeColors.includes(index))
    if (themeColors.length > 6) {
      themeColors = themeColors.slice(0, 6)
      message.warning(LL.editor.slideDesign.themeExtract.themeColorLimitWarning())
    }

    const backgroundColor = themeStyles.backgroundColors[selectedIndex.backgroundColor]
    const fontColor = themeStyles.fontColors[selectedIndex.fontColor]
    const fontName = themeStyles.fontNames[selectedIndex.fontName]

    const data: Partial<SlideTheme> = {}
    if (backgroundColor) data.backgroundColor = backgroundColor
    if (fontColor) data.fontColor = fontColor
    if (fontName) data.fontName = fontName
    if (themeColors.length) data.themeColors = themeColors

    useSlidesStore.getState().setTheme(data)
    onClose?.()
  }

  const removeThemeColor = (index: number) => {
    setSelectedIndex(prev => {
      if (prev.themeColors.includes(index)) {
        return { ...prev, themeColors: prev.themeColors.filter(i => i !== index) }
      }
      return { ...prev, themeColors: [...prev.themeColors, index] }
    })
  }

  const getMostReadableColor = (color: string) => {
    const colorList = ['#000', '#fff']
    return tinycolor.mostReadable(color, colorList, { includeFallbackColors: true }).toRgbString()
  }

  const getHexColor = (color: string) => {
    const c = tinycolor(color)
    const alpha = c.getAlpha()
    if (alpha < 1) return c.toHex8String().toUpperCase()
    return c.toHexString().toUpperCase()
  }

  return (
    <div className={cx('theme-styles-extract', className)} style={style}>
      <Tabs
        tabs={tabs}
        value={activeTab}
        onUpdateValue={value => setActiveTab(value as 'single' | 'all')}
        tabsStyle={{ marginBottom: '12px' }}
        tabStyle={{ padding: '8px 12px' }}
      />
      <div className={cx('content')}>
        {themeStyles.fontNames.length ? (
          <div className={cx('config-item')}>
            <div className={cx('label')}>{LL.editor.slideDesign.font()}</div>
            <div className={cx('values')}>
              {themeStyles.fontNames.map((item, index) => (
                <div className={cx('value-wrap')} key={item}>
                  <div className={cx('value')} style={{ fontFamily: item }}>{fontMap[item] || item}</div>
                  <div className={cx('handler')}>
                    <div className={cx('state', { active: selectedIndex.fontName === index })}>
                      <Icon icon="check" />
                    </div>
                    <div
                      className={cx('config-btn')}
                      onClick={() => setSelectedIndex(prev => ({ ...prev, fontName: index }))}
                    >
                      {LL.editor.slideDesign.themeExtract.select()}
                    </div>
                    <div
                      className={cx('config-btn')}
                      onClick={() => {
                        updateTheme({ fontName: item })
                        setSelectedIndex(prev => ({ ...prev, fontName: index }))
                      }}
                    >
                      {LL.editor.slideDesign.themeExtract.applyToTheme()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {themeStyles.fontColors.length ? (
          <div className={cx('config-item')}>
            <div className={cx('label')}>{LL.editor.slideDesign.fontColor()}</div>
            <div className={cx('values')}>
              {themeStyles.fontColors.map((item, index) => (
                <div className={cx('value-wrap')} key={item}>
                  <div className={cx('value')} style={{ backgroundColor: item, color: getMostReadableColor(item) }}>{getHexColor(item)}</div>
                  <div className={cx('handler')}>
                    <div className={cx('state', { active: selectedIndex.fontColor === index })}>
                      <Icon icon="check" />
                    </div>
                    <div
                      className={cx('config-btn')}
                      onClick={() => setSelectedIndex(prev => ({ ...prev, fontColor: index }))}
                    >
                      {LL.editor.slideDesign.themeExtract.select()}
                    </div>
                    <div
                      className={cx('config-btn')}
                      onClick={() => {
                        updateTheme({ fontColor: item })
                        setSelectedIndex(prev => ({ ...prev, fontColor: index }))
                      }}
                    >
                      {LL.editor.slideDesign.themeExtract.applyToTheme()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {themeStyles.backgroundColors.length ? (
          <div className={cx('config-item')}>
            <div className={cx('label')}>{LL.editor.slideDesign.backgroundColor()}</div>
            <div className={cx('values')}>
              {themeStyles.backgroundColors.map((item, index) => (
                <div className={cx('value-wrap')} key={item}>
                  <div className={cx('value')} style={{ backgroundColor: item, color: getMostReadableColor(item) }}>{getHexColor(item)}</div>
                  <div className={cx('handler')}>
                    <div className={cx('state', { active: selectedIndex.backgroundColor === index })}>
                      <Icon icon="check" />
                    </div>
                    <div
                      className={cx('config-btn')}
                      onClick={() => setSelectedIndex(prev => ({ ...prev, backgroundColor: index }))}
                    >
                      {LL.editor.slideDesign.themeExtract.select()}
                    </div>
                    <div
                      className={cx('config-btn')}
                      onClick={() => {
                        updateTheme({ backgroundColor: item })
                        setSelectedIndex(prev => ({ ...prev, backgroundColor: index }))
                      }}
                    >
                      {LL.editor.slideDesign.themeExtract.applyToTheme()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {themeStyles.themeColors.length ? (
          <div className={cx('config-item')}>
            <div className={cx('label')}>
              {LL.editor.slideDesign.themeColor()}
              <span className={cx('tip')}>{LL.editor.slideDesign.themeExtract.themeColorTip()}</span>
            </div>
            <div className={cx('values', 'inline')}>
              {themeStyles.themeColors.map((item, index) => (
                <div className={cx('value-wrap')} key={item} onClick={() => removeThemeColor(index)}>
                  <div
                    className={cx('value', { disabled: !selectedIndex.themeColors.includes(index) })}
                    style={{ backgroundColor: item }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className={cx('btns')}>
        <Button className={cx('btn')} type="primary" onClick={() => updateAllThemes()}>
          <Icon icon="check" /> {LL.editor.slideDesign.themeExtract.saveSelectedAsTheme()}
        </Button>
      </div>
    </div>
  )
}
