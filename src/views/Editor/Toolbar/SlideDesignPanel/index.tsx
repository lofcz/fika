import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import tinycolor from 'tinycolor2'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import type {
  Gradient,
  GradientType,
  SlideBackground,
  SlideBackgroundType,
  SlideTheme,
  SlideBackgroundImage,
  SlideBackgroundImageSize,
} from '@/types/slides'
import { matchThemeBackgroundIndex, PRESET_THEMES, slideBackgroundToStyle, themeBackgroundCycle } from '@/configs/theme'
import { useFonts } from '@/configs/font'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useSlideTheme from '@/hooks/useSlideTheme'
import { getImageDataURL } from '@/utils/image'
import { applySlideBackgroundWithContrast } from '@/utils/textContrast'
import ViewportSizeSetting from './ViewportSizeSetting'
import FileInput from '@/components/FileInput'
import ColorPicker from '@/components/ColorPicker/index'
import ColorSwatches from '@/components/ColorSwatches'
import Slider from '@/components/Slider'
import Select from '@/components/Select'
import Popover from '@/components/Popover'
import Modal from '@/components/Modal'
import GradientBar from '@/components/GradientBar'
import PanelSection from '../common/PanelSection'
import { useI18nContext } from '@/i18n/useI18nContext'
import { Icon } from '@/components/Icon'

const DEFAULT_BACKGROUND: SlideBackground = { type: 'solid', color: '#fff' }

const selectCurrentSlideBackground = (state: { slides: { background?: SlideBackground }[]; slideIndex: number }) => (
  state.slides[state.slideIndex]?.background
)

const readBackground = (): SlideBackground => {
  return selectCurrentSlideBackground(useSlidesStore.getState()) || DEFAULT_BACKGROUND
}

const ThemeList = memo(function ThemeList({
  activeThemeId,
  useLabel,
  onApply,
}: {
  activeThemeId: string | null
  useLabel: string
  onApply: (item: (typeof PRESET_THEMES)[number]) => void
}) {
  return (
    <div className={cx('theme-list')}>
      {PRESET_THEMES.map(item => (
        <div className={cx('theme-item')} key={item.id}>
          <button
            type="button"
            className={cx('theme-card', { selected: activeThemeId === item.id })}
            onMouseDown={event => event.preventDefault()}
            onClick={() => onApply(item)}
          >
            <span className={cx('theme-card-preview')} style={slideBackgroundToStyle(item.featureBackground, item.background)} />
            <span className={cx('theme-card-aa')} style={{ color: item.featureFontColor || '#fff' }}>Aa</span>
            <span className={cx('theme-card-use')}>{useLabel}</span>
          </button>
          <span className={cx('theme-name')}>{item.name}</span>
        </div>
      ))}
    </div>
  )
})

const ThemeLooks = memo(function ThemeLooks({
  looks,
  activeIndex,
  onPick,
}: {
  looks: SlideBackground[]
  activeIndex: number
  onPick: (index: number) => void
}) {
  return (
    <div className={cx('theme-looks')}>
      {looks.map((look, index) => (
        <button
          key={index}
          type="button"
          className={cx('theme-look', { selected: index === activeIndex })}
          style={slideBackgroundToStyle(look)}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onPick(index)}
        />
      ))}
    </div>
  )
})

function SlideDesignPanel({ className, style }: { className?: string; style?: CSSProperties }) {
  const { LL } = useI18nContext()
  const fonts = useFonts()

  const background = useSlidesStore(selectCurrentSlideBackground) || DEFAULT_BACKGROUND
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const theme = useSlidesStore(s => s.theme)

  const [customViewportSizeVisible, setCustomViewportSizeVisible] = useState(false)
  const [currentGradientIndex, setCurrentGradientIndex] = useState(0)

  const { addHistorySnapshot } = useHistorySnapshot()
  const { applyPresetTheme, clearPresetTheme, applyThemeLookToCurrentSlide } = useSlideTheme()

  const backgroundTypeOptions = useMemo(() => [
    { label: LL.editor.slideDesign.solidFill(), value: 'solid' },
    { label: LL.editor.slideDesign.imageFill(), value: 'image' },
    { label: LL.editor.slideDesign.gradientFill(), value: 'gradient' },
  ], [LL])

  const imageSizeOptions = useMemo(() => [
    { label: LL.editor.slideDesign.imageSizeContain(), value: 'contain' },
    { label: LL.editor.slideDesign.imageSizeRepeat(), value: 'repeat' },
    { label: LL.editor.slideDesign.imageSizeCover(), value: 'cover' },
  ], [LL])

  const gradientTypeOptions = useMemo(() => [
    { label: LL.editor.slideDesign.linearGradient(), value: 'linear' },
    { label: LL.editor.slideDesign.radialGradient(), value: 'radial' },
  ], [LL])

  const viewportRatioOptions = useMemo(() => [
    { label: LL.editor.slideDesign.widescreen169(), value: 0.5625 },
    { label: LL.editor.slideDesign.widescreen1610(), value: 0.625 },
    { label: LL.editor.slideDesign.standard43(), value: 0.75 },
    { label: LL.editor.slideDesign.paperA3A4(), value: 0.70710678 },
    { label: LL.editor.slideDesign.portraitA3A4(), value: 1.41421356 },
    { label: LL.editor.slideDesign.custom(), value: 'custom' },
  ], [LL])

  const activeThemeId = useMemo(() => {
    const colors = theme.themeColors.map(item => item.toLowerCase()).join(',')
    return PRESET_THEMES.find(item => item.colors.map(color => color.toLowerCase()).join(',') === colors)?.id ?? null
  }, [theme.themeColors])
  const onApplyPresetTheme = useCallback((item: (typeof PRESET_THEMES)[number]) => {
    if (activeThemeId === item.id) {
      clearPresetTheme()
      return
    }
    applyPresetTheme(item)
  }, [activeThemeId, applyPresetTheme, clearPresetTheme])
  const activeTheme = useMemo(
    () => PRESET_THEMES.find(item => item.id === activeThemeId) ?? null,
    [activeThemeId],
  )
  const themeLooks = useMemo(() => (activeTheme ? themeBackgroundCycle(activeTheme) : []), [activeTheme])
  const activeLookIndex = useMemo(
    () => (activeTheme ? matchThemeBackgroundIndex(activeTheme, background) : -1),
    [activeTheme, background],
  )
  const onPickThemeLook = useCallback((index: number) => {
    const look = themeLooks[index]
    if (look) applyThemeLookToCurrentSlide(look)
  }, [themeLooks, applyThemeLookToCurrentSlide])

  useEffect(() => {
    setCurrentGradientIndex(0)
  }, [slideIndex])

  const isLightColor = (color: string) => {
    const parsed = tinycolor(color)
    return parsed.isValid() && parsed.getAlpha() > 0.4 && parsed.getBrightness() > 210
  }

  const updateBackgroundType = (type: SlideBackgroundType) => {
    const background = readBackground()
    if (type === 'solid') {
      const newBackground: SlideBackground = {
        ...background,
        type: 'solid',
        color: background.color || '#fff',
      }
      useSlidesStore.getState().updateSlide({ background: newBackground })
    }
    else if (type === 'image') {
      const newBackground: SlideBackground = {
        ...background,
        type: 'image',
        image: background.image || {
          src: '',
          size: 'cover',
        },
      }
      useSlidesStore.getState().updateSlide({ background: newBackground })
    }
    else {
      const newBackground: SlideBackground = {
        ...background,
        type: 'gradient',
        gradient: background.gradient || {
          type: 'linear',
          colors: [
            { pos: 0, color: '#fff' },
            { pos: 100, color: '#fff' },
          ],
          rotate: 0,
        },
      }
      setCurrentGradientIndex(0)
      useSlidesStore.getState().updateSlide({ background: newBackground })
    }
    addHistorySnapshot()
  }

  const updateBackground = (props: Partial<SlideBackground>) => {
    useSlidesStore.getState().updateSlide({ background: { ...readBackground(), ...props } })
    addHistorySnapshot()
  }

  const updateGradientBackground = (props: Partial<Gradient>) => {
    const background = readBackground()
    updateBackground({ gradient: { ...background.gradient!, ...props } })
  }

  const updateGradientBackgroundColors = (color: string) => {
    const background = readBackground()
    const colors = background.gradient!.colors.map((item, index) => {
      if (index === currentGradientIndex) return { ...item, color }
      return item
    })
    updateGradientBackground({ colors })
  }

  const updateImageBackground = (props: Partial<SlideBackgroundImage>) => {
    const background = readBackground()
    updateBackground({ image: { ...background.image!, ...props } })
  }

  const uploadBackgroundImage = (files: FileList) => {
    const imageFile = files[0]
    if (!imageFile) return
    getImageDataURL(imageFile).then(dataURL => updateImageBackground({ src: dataURL }))
  }

  const applyBackgroundAllSlide = () => {
    const { slides, theme } = useSlidesStore.getState()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    const contrastTheme = {
      backgroundColor: theme.backgroundColor,
      fontColor: theme.fontColor,
    }
    const newSlides = slides.map(slide => applySlideBackgroundWithContrast({
      ...slide,
      background: currentSlide?.background,
    }, contrastTheme))
    useSlidesStore.getState().setSlides(newSlides)
    addHistorySnapshot()
  }

  const updateTheme = (themeProps: Partial<SlideTheme>) => {
    useSlidesStore.getState().setTheme(themeProps)
  }

  const updateThemeColor = (index: number, color: string) => {
    const colors = [...useSlidesStore.getState().theme.themeColors]
    colors[index] = color
    updateTheme({ themeColors: colors })
  }

  const updateViewportRatio = (value: string | number) => {
    if (value === 'custom') {
      setCustomViewportSizeVisible(true)
      return
    }
    if (typeof value !== 'number') return
    useSlidesStore.getState().setViewportRatio(value)
  }

  return (
    <>
      <div className={cx('slide-design-panel', className)} style={style}>
        <PanelSection label={LL.editor.slideDesign.presetThemes()}>
          <ThemeList
            activeThemeId={activeThemeId}
            useLabel={LL.editor.slideDesign.use()}
            onApply={onApplyPresetTheme}
          />
        </PanelSection>

        {themeLooks.length ? (
          <PanelSection label={LL.editor.slideDesign.looks()}>
            <ThemeLooks
              looks={themeLooks}
              activeIndex={activeLookIndex}
              onPick={onPickThemeLook}
            />
          </PanelSection>
        ) : null}

        <PanelSection
          label={LL.editor.slideDesign.backgroundFill()}
          action={<span onClick={() => applyBackgroundAllSlide()}>{LL.editor.slideDesign.applyToAll()}</span>}
        >
          <Select
            className={cx('quiet-select')}
            value={background.type}
            onUpdateValue={value => updateBackgroundType(value as 'gradient' | 'image' | 'solid')}
            options={backgroundTypeOptions}
          />

          {background.type === 'solid' ? (
            <ColorSwatches
              modelValue={background.color || '#fff'}
              customTitle={LL.editor.slideDesign.solidFill()}
              onUpdateModelValue={value => updateBackground({ color: value })}
            />
          ) : background.type === 'image' ? (
            <>
              <FileInput onChange={files => uploadBackgroundImage(files)}>
                <div className={cx('background-image')}>
                  <div className={cx('content')} style={{ backgroundImage: `url(${background.image?.src})` }}>
                    <Icon icon="plus" />
                  </div>
                </div>
              </FileInput>
              <Select
                className={cx('quiet-select')}
                value={background.image?.size || 'cover'}
                onUpdateValue={value => updateImageBackground({ size: value as SlideBackgroundImageSize })}
                options={imageSizeOptions}
              />
            </>
          ) : (
            <>
              <Select
                className={cx('quiet-select')}
                value={background.gradient?.type || 'linear'}
                onUpdateValue={value => updateGradientBackground({ type: value as GradientType })}
                options={gradientTypeOptions}
              />
              <GradientBar
                value={background.gradient?.colors || []}
                index={currentGradientIndex}
                onUpdateValue={value => updateGradientBackground({ colors: value })}
                onUpdateIndex={index => setCurrentGradientIndex(index)}
              />
              <ColorSwatches
                modelValue={background.gradient?.colors[currentGradientIndex]?.color || '#fff'}
                customTitle={LL.editor.slideDesign.currentColorStop()}
                onUpdateModelValue={value => updateGradientBackgroundColors(value)}
              />
              {background.gradient?.type === 'linear' ? (
                <div className={cx('field')}>
                  <span className={cx('field-label')}>{LL.editor.slideDesign.gradientAngle()}</span>
                  <Slider
                    min={0}
                    max={360}
                    step={15}
                    value={background.gradient.rotate || 0}
                    onUpdateValue={value => updateGradientBackground({ rotate: value as number })}
                  />
                </div>
              ) : null}
            </>
          )}
        </PanelSection>

        <PanelSection label={LL.editor.slideDesign.font()}>
          <Select
            className={cx('quiet-select')}
            value={theme.fontName}
            search
            searchLabel={LL.editor.multiStyle.searchFont()}
            autofocus
            previewFonts
            onUpdateValue={value => updateTheme({ fontName: value as string })}
            options={fonts}
          />
          <ColorSwatches
            modelValue={theme.fontColor}
            customTitle={LL.editor.slideDesign.fontColor()}
            onUpdateModelValue={value => updateTheme({ fontColor: value })}
          />
        </PanelSection>

        <PanelSection label={LL.editor.slideDesign.themeColor()}>
          <div className={cx('accent-row')}>
            {theme.themeColors.map((color, index) => (
              <Popover
                trigger="click"
                key={index}
                content={<ColorPicker modelValue={color} onUpdateModelValue={value => updateThemeColor(index, value)} />}
              >
                <button
                  type="button"
                  className={cx('accent-swatch', { light: isLightColor(color) })}
                  style={{ backgroundColor: color }}
                  onMouseDown={event => event.preventDefault()}
                />
              </Popover>
            ))}
          </div>
        </PanelSection>

        <PanelSection label={LL.editor.slideDesign.canvas()}>
          <Select
            className={cx('quiet-select')}
            defaultLabel={LL.editor.slideDesign.custom()}
            value={viewportRatio}
            onUpdateValue={value => updateViewportRatio(value)}
            options={viewportRatioOptions}
          />
        </PanelSection>
      </div>

      <Modal
        visible={customViewportSizeVisible}
        width={300}
        onUpdateVisible={setCustomViewportSizeVisible}
        onClosed={() => setCustomViewportSizeVisible(false)}
      >
        <ViewportSizeSetting onClose={() => setCustomViewportSizeVisible(false)} />
      </Modal>
    </>
  )
}

export default memo(SlideDesignPanel)
