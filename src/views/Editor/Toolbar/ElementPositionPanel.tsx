import { bindStyles } from '@/utils/cssm'
import styles from './ElementPositionPanel.module.scss'
const cx = bindStyles(styles)
import { memo, useEffect, useState } from 'react'
import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementId, useHandleElementShallow } from './common/handleElement'
import type { PPTElement } from '@/types/slides'
import { ElementAlignCommands, ElementOrderCommands } from '@/types/edit'
import { MIN_SIZE } from '@/configs/element'
import { textElementLocksSize } from '@/utils/placeholderLayout'
import { SHAPE_PATH_FORMULAS } from '@/configs/shapes'
import useOrderElement from '@/hooks/useOrderElement'
import useAlignElementToCanvas from '@/hooks/useAlignElementToCanvas'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useI18nContext } from '@/i18n/useI18nContext'
import { Icon } from '@/components/Icon'
import Button from '@/components/Button'
import ButtonGroup from '@/components/ButtonGroup'
import NumberInput from '@/components/NumberInput'
import FitText from '@/components/FitText'
import PanelSection from './common/PanelSection'

const ElementPositionPanel = memo(function ElementPositionPanel() {
  const { LL } = useI18nContext()
  const handleElementId = useHandleElementId()
  const handleElement = useHandleElementShallow(el => {
    if (!el) return null
    return {
      id: el.id,
      type: el.type,
      left: el.left,
      top: el.top,
      width: 'width' in el ? el.width : 0,
      height: 'height' in el ? el.height : 0,
      rotate: 'rotate' in el ? el.rotate : 0,
      fixedRatio: 'fixedRatio' in el && !!el.fixedRatio,
      vertical: el.type === 'text' && !!el.vertical,
      fixedHeight: el.type === 'text' && !!el.fixedHeight,
      pathFormula: el.type === 'shape' ? el.pathFormula : undefined,
      keypoints: el.type === 'shape' ? el.keypoints : undefined,
    }
  })
  const { orderElement } = useOrderElement()
  const { alignElementToCanvas } = useAlignElementToCanvas()
  const { addHistorySnapshot } = useHistorySnapshot()

  const [left, setLeft] = useState(0)
  const [top, setTop] = useState(0)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [rotate, setRotate] = useState(0)
  const [fixedRatio, setFixedRatio] = useState(false)

  useEffect(() => {
    if (!handleElement) return
    const round1 = (n: number) => Math.round(n * 10) / 10
    setLeft(round1(handleElement.left))
    setTop(round1(handleElement.top))
    setFixedRatio('fixedRatio' in handleElement && !!handleElement.fixedRatio)
    if (handleElement.type !== 'line') {
      setWidth(round1(handleElement.width))
      setHeight(round1(handleElement.height))
      setRotate('rotate' in handleElement && handleElement.rotate !== undefined ? round1(handleElement.rotate) : 0)
    }
  }, [handleElement])

  if (!handleElement) return null

  const minSize = MIN_SIZE[handleElement.type] || 20
  const textLocked = handleElement.type === 'text' && textElementLocksSize(handleElement)
  const isAutoHeightText = handleElement.type === 'text' && !handleElement.vertical && !textLocked
  const isAutoWidthText = handleElement.type === 'text' && handleElement.vertical && !textLocked

  const commit = (props: Partial<PPTElement>) => {
    useSlidesStore.getState().updateElement({ id: handleElementId, props })
    addHistorySnapshot()
  }

  const updateLeft = (value: number) => commit({ left: value })
  const updateTop = (value: number) => commit({ top: value })

  const updateShapePathData = (nextWidth: number, nextHeight: number) => {
    if (handleElement.type === 'shape' && handleElement.pathFormula) {
      const live = getHandleElement()
      const keypoints = live && live.type === 'shape' ? live.keypoints : handleElement.keypoints
      const pathFormula = SHAPE_PATH_FORMULAS[handleElement.pathFormula]
      let path = ''
      if ('editable' in pathFormula && pathFormula.editable) path = pathFormula.formula(nextWidth, nextHeight, keypoints!)
      else path = pathFormula.formula(nextWidth, nextHeight)
      return { viewBox: [nextWidth, nextHeight], path }
    }
    return null
  }

  const updateWidth = (value: number) => {
    if (handleElement.type === 'line' || isAutoWidthText) return
    let h = height
    if (fixedRatio) {
      const ratio = width / height
      h = value / ratio < minSize ? minSize : value / ratio
    }
    let props: Partial<PPTElement> = { width: value, height: h }
    const shapePathData = updateShapePathData(value, h)
    if (shapePathData) props = { width: value, height: h, ...shapePathData }
    commit(props)
  }

  const updateHeight = (value: number) => {
    if (handleElement.type === 'line' || handleElement.type === 'table' || isAutoHeightText) return
    let w = width
    if (fixedRatio) {
      const ratio = width / height
      w = value * ratio < minSize ? minSize : value * ratio
    }
    let props: Partial<PPTElement> = { width: w, height: value }
    const shapePathData = updateShapePathData(w, value)
    if (shapePathData) props = { width: w, height: value, ...shapePathData }
    commit(props)
  }

  const updateRotate = (value: number) => commit({ rotate: value } as Partial<PPTElement>)

  const updateFixedRatio = (value: boolean) => {
    commit({ fixedRatio: value } as Partial<PPTElement>)
  }

  const updateRotate45 = (command: '+' | '-') => {
    let next = Math.floor(rotate / 45) * 45
    if (command === '+') next = next + 45
    else if (command === '-') next = next - 45
    if (next < -180) next = -180
    if (next > 180) next = 180
    commit({ rotate: next } as Partial<PPTElement>)
  }

  return (
    <div className={cx('element-positopn-panel')}>
      <PanelSection label={LL.editor.positionPanel.layer()}>
        <ButtonGroup className={cx('row')}>
          <Button className={cx('layer-button')} style={{ flex: 1 }} onClick={() => { const el = getHandleElement(); if (el) orderElement(el, ElementOrderCommands.TOP) }}>
            <Icon icon="send-to-back" />
            <FitText text={LL.editor.positionPanel.bringToTop()} maxFontSize={12} minFontSize={8} />
          </Button>
          <Button className={cx('layer-button')} style={{ flex: 1 }} onClick={() => { const el = getHandleElement(); if (el) orderElement(el, ElementOrderCommands.BOTTOM) }}>
            <Icon icon="bring-to-front" />
            <FitText text={LL.editor.positionPanel.sendToBack()} maxFontSize={12} minFontSize={8} />
          </Button>
        </ButtonGroup>
        <ButtonGroup className={cx('row')}>
          <Button className={cx('layer-button')} style={{ flex: 1 }} onClick={() => { const el = getHandleElement(); if (el) orderElement(el, ElementOrderCommands.UP) }}>
            <Icon icon="bring-to-front" />
            <FitText text={LL.editor.positionPanel.moveUp()} maxFontSize={12} minFontSize={8} />
          </Button>
          <Button className={cx('layer-button')} style={{ flex: 1 }} onClick={() => { const el = getHandleElement(); if (el) orderElement(el, ElementOrderCommands.DOWN) }}>
            <Icon icon="send-to-back" />
            <FitText text={LL.editor.positionPanel.moveDown()} maxFontSize={12} minFontSize={8} />
          </Button>
        </ButtonGroup>
      </PanelSection>

      <PanelSection label={LL.editor.positionPanel.align()}>
        <ButtonGroup className={cx('row')}>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignLeft()} onClick={() => alignElementToCanvas(ElementAlignCommands.LEFT)}>
            <Icon icon="align-start-vertical" />
          </Button>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignHorizontalCenter()} onClick={() => alignElementToCanvas(ElementAlignCommands.HORIZONTAL)}>
            <Icon icon="align-center-horizontal" />
          </Button>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignRight()} onClick={() => alignElementToCanvas(ElementAlignCommands.RIGHT)}>
            <Icon icon="align-end-vertical" />
          </Button>
        </ButtonGroup>
        <ButtonGroup className={cx('row')}>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignTop()} onClick={() => alignElementToCanvas(ElementAlignCommands.TOP)}>
            <Icon icon="align-start-horizontal" />
          </Button>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignVerticalCenter()} onClick={() => alignElementToCanvas(ElementAlignCommands.VERTICAL)}>
            <Icon icon="align-center-vertical" />
          </Button>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignBottom()} onClick={() => alignElementToCanvas(ElementAlignCommands.BOTTOM)}>
            <Icon icon="align-end-horizontal" />
          </Button>
        </ButtonGroup>
      </PanelSection>

      <PanelSection>
        <div className={cx('field')}>
          <NumberInput min={-1000} step={5} value={left} onUpdateValue={value => updateLeft(value)} prefix={LL.editor.positionPanel.horizontal()} />
          <NumberInput min={-1000} step={5} value={top} onUpdateValue={value => updateTop(value)} prefix={LL.editor.positionPanel.vertical()} />
        </div>
        {handleElement.type !== 'line' ? (
          <div className={cx('field')}>
            <NumberInput min={minSize} max={1500} step={5} disabled={isAutoWidthText} value={width} onUpdateValue={value => updateWidth(value)} prefix={LL.editor.positionPanel.width()} />
            {['image', 'shape', 'audio'].includes(handleElement.type) ? (
              <span
                className={cx('icon-btn', { active: fixedRatio })}
                data-tooltip={fixedRatio ? LL.editor.positionPanel.unlockAspectRatio() : LL.editor.positionPanel.lockAspectRatio()}
                onClick={() => updateFixedRatio(!fixedRatio)}
              >
                {fixedRatio ? <Icon icon="lock" /> : <Icon icon="unlock" />}
              </span>
            ) : null}
            <NumberInput min={minSize} max={800} step={5} disabled={isAutoHeightText || handleElement.type === 'table'} value={height} onUpdateValue={value => updateHeight(value)} prefix={LL.editor.positionPanel.height()} />
          </div>
        ) : null}
      </PanelSection>

      {!['line', 'video', 'audio'].includes(handleElement.type) ? (
        <PanelSection>
          <div className={cx('field')}>
            <NumberInput min={-180} max={180} step={5} value={rotate} onUpdateValue={value => updateRotate(value)} prefix={LL.editor.positionPanel.rotate()} />
            <div className={cx('text-btn')} onClick={() => updateRotate45('-')}>
              <Icon icon="rotate-cw" /> -45°
            </div>
            <div className={cx('text-btn')} onClick={() => updateRotate45('+')}>
              <Icon icon="rotate-cw" style={{ transform: 'rotateY(180deg)' }} /> +45°
            </div>
          </div>
        </PanelSection>
      ) : null}
    </div>
  )
})

export default ElementPositionPanel
