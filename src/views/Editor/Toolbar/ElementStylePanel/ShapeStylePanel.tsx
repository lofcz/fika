import { bindStyles } from '@/utils/cssm'
import styles from './ShapeStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useMemo, useState, useEffect } from 'react'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementId, useHandleElementSelect, useHandleElementShallow } from '../common/handleElement'
import type { GradientType, PPTShapeElement, Gradient } from '@/types/slides'
import { type ShapePoolItem, SHAPE_LIST, SHAPE_PATH_FORMULAS } from '@/configs/shapes'
import { getImageDataURL } from '@/utils/image'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useShapeFormatPainter from '@/hooks/useShapeFormatPainter'
import ElementOpacity from '../common/ElementOpacity'
import ElementOutline from '../common/ElementOutline'
import ElementShadow from '../common/ElementShadow'
import ElementFlip from '../common/ElementFlip'
import TextStyleContent from '../common/TextStyleContent'
import PanelSection from '../common/PanelSection'
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
import { applyLiveGradient } from '@/utils/liveElementPaint'

const ShapeStylePanel = memo(function ShapeStylePanel() {
  const { LL } = useI18nContext()
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
  }, [shapeStyle])

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

  const nextGradient = (gradientProps: Partial<Gradient>): Gradient => {
    const handleElement = getHandleElement()
    const current = handleElement?.type === 'shape' && handleElement.gradient
      ? handleElement.gradient
      : gradient
    return { ...current, ...gradientProps }
  }

  const paintGradient = (gradientProps: Partial<Gradient>) => {
    applyLiveGradient(handleElementId, nextGradient(gradientProps))
  }

  const updateGradient = (gradientProps: Partial<Gradient>) => {
    const next = nextGradient(gradientProps)
    applyLiveGradient(handleElementId, next)
    useSlidesStore.getState().updateElement({
      id: handleElementId,
      props: { gradient: next },
    })
    addHistorySnapshot()
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
                  onInput={value => paintGradient({ colors: value })}
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
                      data-style-slider="gradient-angle"
                      onInput={value => paintGradient({ rotate: value })}
                      onUpdateValue={value => updateGradient({ rotate: value })}
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

      {hasShapeText || isEditingText ? <TextStyleContent /> : null}

      <ElementOutline />
      <ElementShadow />
      <ElementOpacity />

      {!isEditingText ? (
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
      ) : null}
    </div>
  )
})

export default ShapeStylePanel
