import { bindStyles } from '@/utils/cssm'
import styles from './ShapeStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useMemo, useState, useEffect } from 'react'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import { getHandleElement, useHandleElementId, useHandleElementSelect, useHandleElementShallow } from '../common/handleElement'
import type { GradientType, PPTShapeElement, Gradient, ShapeText, TextInset } from '@/types/slides'
import { type ShapePoolItem, SHAPE_LIST, SHAPE_PATH_FORMULAS } from '@/configs/shapes'
import { getImageDataURL } from '@/utils/image'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useShapeFormatPainter from '@/hooks/useShapeFormatPainter'
import { resolveElementDefaultFontColor } from '@/utils/textContrast'
import ElementOpacity from '../common/ElementOpacity'
import ElementOutline from '../common/ElementOutline'
import ElementShadow from '../common/ElementShadow'
import ElementFlip from '../common/ElementFlip'
import RichTextBase from '../common/RichTextBase'
import PanelSection from '../common/PanelSection'
import PanelAccordion from '../common/PanelAccordion'
import BoxInsetControl from '../common/BoxInsetControl'
import ShapeItemThumbnail from '@/views/Editor/CanvasTool/ShapeItemThumbnail'
import ColorButton from '@/components/ColorButton'
import ColorSwatches from '@/components/ColorSwatches'
import FormatChip from '@/components/FormatChip'
import ColorPicker from '@/components/ColorPicker/index'
import Slider from '@/components/Slider'
import Select from '@/components/Select'
import Popover from '@/components/Popover'
import GradientBar from '@/components/GradientBar'
import FileInput from '@/components/FileInput'
import { Icon } from '@/components/Icon'

const lineHeightOptions = [0.9, 1.0, 1.15, 1.2, 1.4, 1.5, 1.8, 2.0, 2.5, 3.0]
const wordSpaceOptions = [0, 1, 2, 3, 4, 5, 6, 8, 10]
const paragraphSpaceOptions = [0, 5, 10, 15, 20, 25, 30, 40, 50, 80]
const DEFAULT_SHAPE_INSET: TextInset = [10, 10, 10, 10]

const ShapeStylePanel = memo(function ShapeStylePanel() {
  const { LL } = useI18nContext()
  const theme = useSlidesStore(s => s.theme)
  const handleElementId = useHandleElementId()
  const shapeFormatPainter = useMainStore(s => s.shapeFormatPainter)
  const editingElementId = useMainStore(s => s.editingElementId)
  const hasShapeText = useHandleElementSelect(el => !!(el?.type === 'shape' && el.text?.content))
  const isEditingText = !!editingElementId && editingElementId === handleElementId
  const shapeStyle = useHandleElementShallow(el => {
    if (!el || el.type !== 'shape') return null
    return {
      fill: el.fill,
      gradient: el.gradient,
      pattern: el.pattern,
      textAlign: el.text?.align || 'middle',
      lineHeight: el.text?.lineHeight || 1.5,
      wordSpace: el.text?.wordSpace || 0,
      paragraphSpace: el.text?.paragraphSpace === undefined ? 5 : el.text.paragraphSpace,
      inset: el.text?.inset || DEFAULT_SHAPE_INSET,
    }
  })
  const { addHistorySnapshot } = useHistorySnapshot()
  const { toggleShapeFormatPainter } = useShapeFormatPainter()

  const [fill, setFill] = useState('#000')
  const [pattern, setPattern] = useState('')
  const [gradient, setGradient] = useState<Gradient>({
    type: 'linear',
    rotate: 0,
    colors: [
      { pos: 0, color: '#fff' },
      { pos: 100, color: '#fff' },
    ],
  })
  const [fillType, setFillType] = useState('fill')
  const [textAlign, setTextAlign] = useState('middle')
  const [lineHeight, setLineHeight] = useState<number>()
  const [wordSpace, setWordSpace] = useState<number>()
  const [paragraphSpace, setParagraphSpace] = useState<number>()
  const [inset, setInset] = useState<TextInset>([10, 10, 10, 10])
  const [currentGradientIndex, setCurrentGradientIndex] = useState(0)
  const [lastSolidFill, setLastSolidFill] = useState('#fff')

  const fillTypeOptions = useMemo(() => [
    { label: LL.editor.slideDesign.noFill(), value: 'none' },
    { label: LL.editor.slideDesign.solidFill(), value: 'fill' },
    { label: LL.editor.slideDesign.gradientFill(), value: 'gradient' },
    { label: LL.editor.slideDesign.imageFill(), value: 'pattern' },
  ], [LL])
  const gradientTypeOptions = useMemo(() => [
    { label: LL.editor.slideDesign.linearGradient(), value: 'linear' },
    { label: LL.editor.slideDesign.radialGradient(), value: 'radial' },
  ], [LL])
  const lineHeightSelectOptions = lineHeightOptions.map(item => ({
    label: LL.editor.stylePanel.shared.lineHeightOption({ value: item }),
    value: item,
  }))
  const paragraphSpaceSelectOptions = paragraphSpaceOptions.map(item => ({
    label: LL.editor.stylePanel.shared.pixelValue({ value: item }),
    value: item,
  }))
  const wordSpaceSelectOptions = wordSpaceOptions.map(item => ({
    label: LL.editor.stylePanel.shared.pixelValue({ value: item }),
    value: item,
  }))

  useEffect(() => {
    if (!shapeStyle) return
    const rawFill = shapeStyle.fill
    setFill(rawFill || '')
    if (rawFill) setLastSolidFill(rawFill)
    const defaultGradientColor = [
      { pos: 0, color: rawFill || lastSolidFill },
      { pos: 100, color: '#fff' },
    ]
    setGradient(shapeStyle.gradient || { type: 'linear', rotate: 0, colors: defaultGradientColor })
    setPattern(shapeStyle.pattern || '')
    setFillType(shapeStyle.pattern !== undefined
      ? 'pattern'
      : (shapeStyle.gradient ? 'gradient' : (rawFill ? 'fill' : 'none')))
    setTextAlign(shapeStyle.textAlign)
    setLineHeight(shapeStyle.lineHeight)
    setWordSpace(shapeStyle.wordSpace)
    setParagraphSpace(shapeStyle.paragraphSpace)
    setInset(shapeStyle.inset)
    if (hasShapeText) {
      emitter.emit(EmitterEvents.SYNC_RICH_TEXT_ATTRS_TO_STORE)
    }
  }, [shapeStyle, hasShapeText])

  useEffect(() => {
    setCurrentGradientIndex(0)
  }, [handleElementId])

  const commit = useCallback((props: Partial<PPTShapeElement>) => {
    useSlidesStore.getState().updateElement({ id: handleElementId, props })
    addHistorySnapshot()
  }, [handleElementId, addHistorySnapshot])

  const updateFillType = (type: 'gradient' | 'fill' | 'pattern' | 'none') => {
    if (type === 'none') {
      if (fill) setLastSolidFill(fill)
      useSlidesStore.getState().removeElementProps({ id: handleElementId, propName: ['gradient', 'pattern'] })
      commit({ fill: '' })
    }
    else if (type === 'fill') {
      useSlidesStore.getState().removeElementProps({ id: handleElementId, propName: ['gradient', 'pattern'] })
      commit({ fill: fill || lastSolidFill || '#fff' })
    }
    else if (type === 'gradient') {
      setCurrentGradientIndex(0)
      useSlidesStore.getState().removeElementProps({ id: handleElementId, propName: 'pattern' })
      commit({ gradient })
    }
    else if (type === 'pattern') {
      useSlidesStore.getState().removeElementProps({ id: handleElementId, propName: 'gradient' })
      commit({ pattern: '' })
    }
  }

  const updateGradient = (gradientProps: Partial<Gradient>) => {
    if (!gradient) return
    const _gradient = { ...gradient, ...gradientProps }
    commit({ gradient: _gradient })
  }
  const updateGradientColors = (color: string) => {
    const colors = gradient.colors.map((item, index) => index === currentGradientIndex ? { ...item, color } : item)
    updateGradient({ colors })
  }

  const uploadPattern = (files: FileList) => {
    const imageFile = files[0]
    if (!imageFile) return
    getImageDataURL(imageFile).then(dataURL => {
      setPattern(dataURL)
      commit({ pattern: dataURL })
    })
  }

  const updateFill = (value: string) => {
    if (value) setLastSolidFill(value)
    else useSlidesStore.getState().removeElementProps({ id: handleElementId, propName: ['gradient', 'pattern'] })
    commit({ fill: value })
  }

  const changeShape = (shape: ShapePoolItem) => {
    const handleElement = getHandleElement()
    if (!handleElement || handleElement.type !== 'shape') return
    const { width, height } = handleElement
    const props: Partial<PPTShapeElement> = {
      viewBox: shape.viewBox,
      path: shape.path,
      special: shape.special,
    }
    if (shape.pathFormula) {
      props.pathFormula = shape.pathFormula
      props.viewBox = [width, height]
      const pathFormula = SHAPE_PATH_FORMULAS[shape.pathFormula]
      if ('editable' in pathFormula) {
        props.path = pathFormula.formula(width, height, pathFormula.defaultValue)
        props.keypoints = pathFormula.defaultValue
      }
      else props.path = pathFormula.formula(width, height)
    }
    else {
      props.pathFormula = undefined
      props.keypoints = undefined
    }
    commit(props)
  }

  const updateTextProps = (props: Partial<ShapeText>) => {
    const handleElement = getHandleElement()
    if (!handleElement || handleElement.type !== 'shape') return
    const slides = useSlidesStore.getState()
    const currentSlide = selectCurrentSlide(slides)
    const defaultText: ShapeText = {
      content: '',
      defaultFontName: theme.fontName,
      defaultColor: resolveElementDefaultFontColor(theme.fontColor, {
        fill: handleElement.fill,
        background: currentSlide?.background,
        fallbackSurface: theme.backgroundColor,
      }),
      align: 'middle',
    }
    const _text = handleElement.text || defaultText
    commit({ text: { ..._text, ...props } })
  }

  return (
    <div className={cx('shape-style-panel')}>
      {!isEditingText ? (
        <>
          <PanelSection label={LL.editor.stylePanel.shape.clickToReplaceShape()}>
            <div className={cx('shape-pool')}>
              {SHAPE_LIST.map(item => (
                <div className={cx('category')} key={item.categoryKey}>
                  <div className={cx('shape-list')}>
                    {item.children.map((shape, index) => (
                      <ShapeItemThumbnail
                        className={cx('shape-item')}
                        key={index}
                        shape={shape}
                        onClick={() => changeShape(shape)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </PanelSection>

          <PanelSection label={LL.editor.panel.fill()}>
            <Select
              className={cx('quiet-select')}
              value={fillType}
              onUpdateValue={value => updateFillType(value as 'fill' | 'gradient' | 'pattern' | 'none')}
              options={fillTypeOptions}
            />
            {fillType === 'fill' || fillType === 'none' ? (
              <ColorSwatches
                modelValue={fill}
                allowNone
                noneValue=""
                noneTitle={LL.editor.slideDesign.noFill()}
                customTitle={LL.editor.slideDesign.solidFill()}
                onUpdateModelValue={value => updateFill(value)}
              />
            ) : fillType === 'gradient' ? (
              <Select
                className={cx('quiet-select')}
                value={gradient.type}
                onUpdateValue={value => updateGradient({ type: value as GradientType })}
                options={gradientTypeOptions}
              />
            ) : null}
            {fillType === 'gradient' ? (
              <>
                <GradientBar
                  value={gradient.colors}
                  index={currentGradientIndex}
                  onUpdateValue={value => updateGradient({ colors: value })}
                  onUpdateIndex={index => setCurrentGradientIndex(index)}
                />
                <div className={cx('field')}>
                  <span className="field-label">{LL.editor.slideDesign.currentColorStop()}</span>
                  <Popover
                    trigger="click"
                    content={(
                      <ColorPicker
                        modelValue={gradient.colors[currentGradientIndex].color}
                        onUpdateModelValue={value => updateGradientColors(value)}
                      />
                    )}
                  >
                    <ColorButton color={gradient.colors[currentGradientIndex].color} />
                  </Popover>
                </div>
                {gradient.type === 'linear' ? (
                  <div className={cx('field')}>
                    <span className="field-label">{LL.editor.slideDesign.gradientAngle()}</span>
                    <Slider
                      min={0}
                      max={360}
                      step={15}
                      value={gradient.rotate}
                      onUpdateValue={value => updateGradient({ rotate: value as number })}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            {fillType === 'pattern' ? (
              <div className={cx('pattern-image-wrapper')}>
                <FileInput onChange={files => uploadPattern(files)}>
                  <div className={cx('pattern-image')}>
                    <div className={cx('content')} style={{ backgroundImage: `url(${pattern})` }}>
                      <Icon icon="plus" />
                    </div>
                  </div>
                </FileInput>
              </div>
            ) : null}
          </PanelSection>

          <ElementFlip />
        </>
      ) : null}

      {hasShapeText || isEditingText ? (
        <>
          <RichTextBase />
          <PanelAccordion label={LL.editor.panel.more()}>
            <div className={cx('field')}>
              <span className={cx('field-icon')} data-tooltip={LL.editor.stylePanel.shared.lineHeight()}>
                <Icon icon="move-vertical" />
              </span>
              <Select
                className={cx('quiet-select')}
                value={lineHeight || 1}
                onUpdateValue={value => updateTextProps({ lineHeight: value as number })}
                options={lineHeightSelectOptions}
              />
            </div>
            <div className={cx('field')}>
              <span className={cx('field-icon')} data-tooltip={LL.editor.stylePanel.shared.paragraphSpace()}>
                <Icon icon="between-vertical-start" />
              </span>
              <Select
                className={cx('quiet-select')}
                value={paragraphSpace || 0}
                onUpdateValue={value => updateTextProps({ paragraphSpace: value as number })}
                options={paragraphSpaceSelectOptions}
              />
            </div>
            <div className={cx('field')}>
              <span className={cx('field-icon')} data-tooltip={LL.editor.stylePanel.shared.wordSpace()}>
                <Icon icon="move-horizontal" />
              </span>
              <Select
                className={cx('quiet-select')}
                value={wordSpace || 0}
                onUpdateValue={value => updateTextProps({ wordSpace: value as number })}
                options={wordSpaceSelectOptions}
              />
            </div>
            <BoxInsetControl
              value={inset}
              topTitle={LL.editor.stylePanel.shared.paddingTop()}
              rightTitle={LL.editor.stylePanel.shared.paddingRight()}
              bottomTitle={LL.editor.stylePanel.shared.paddingBottom()}
              leftTitle={LL.editor.stylePanel.shared.paddingLeft()}
              onUpdateValue={value => updateTextProps({ inset: value })}
            />
            <div className={cx('chip-row')}>
              <FormatChip active={textAlign === 'top'} data-tooltip={LL.editor.stylePanel.shared.textAlignTop()} onClick={() => updateTextProps({ align: 'top' })}>
                <Icon icon="align-vertical-justify-start" />
              </FormatChip>
              <FormatChip active={textAlign === 'middle'} data-tooltip={LL.editor.stylePanel.shared.textAlignMiddle()} onClick={() => updateTextProps({ align: 'middle' })}>
                <Icon icon="align-vertical-justify-center" />
              </FormatChip>
              <FormatChip active={textAlign === 'bottom'} data-tooltip={LL.editor.stylePanel.shared.textAlignBottom()} onClick={() => updateTextProps({ align: 'bottom' })}>
                <Icon icon="align-vertical-justify-end" />
              </FormatChip>
            </div>
          </PanelAccordion>
        </>
      ) : null}

      {!isEditingText ? (
        <>
          <ElementOutline />
          <ElementShadow />
          <ElementOpacity />

          <PanelSection>
            <FormatChip
              active={!!shapeFormatPainter}
              data-tooltip={LL.editor.stylePanel.shape.doubleClickContinuousUse()}
              onClick={() => toggleShapeFormatPainter()}
              onDoubleClick={() => toggleShapeFormatPainter(true)}
            >
              <Icon icon="paintbrush" /> {LL.editor.stylePanel.shape.shapeFormatPainter()}
            </FormatChip>
          </PanelSection>
        </>
      ) : null}
    </div>
  )
})

export default ShapeStylePanel
