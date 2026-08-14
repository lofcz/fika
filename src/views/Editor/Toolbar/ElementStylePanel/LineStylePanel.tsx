import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './LineStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useState } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementShallow } from '../common/handleElement'
import type { Broken2LineDirection, LinePoint, LineStyleType, PPTLineElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import ElementShadow from '../common/ElementShadow'
import SVGLine from '../common/SVGLine'
import LinePointMarker from '@/views/components/element/LineElement/LinePointMarker'
import Button from '@/components/Button'
import ColorButton from '@/components/ColorButton'
import ColorPicker from '@/components/ColorPicker/index'
import Divider from '@/components/Divider'
import NumberInput from '@/components/NumberInput'
import Select from '@/components/Select'
import SelectCustom from '@/components/SelectCustom'
import Popover from '@/components/Popover'

interface LineTypeOption {
  key: string
  path: string
  isBroken?: boolean
  isBroken2?: boolean
  isCurve?: boolean
  isCubic?: boolean
}

const LineStylePanel = memo(() => {
  const { LL } = useI18nContext()
  const handleLineElement = useHandleElementShallow(el => {
    if (!el || el.type !== 'line') return null
    return {
      id: el.id,
      style: el.style,
      color: el.color,
      width: el.width,
      points: el.points,
      broken2: el.broken2,
      broken2Direction: el.broken2Direction,
      start: el.start,
      end: el.end,
    }
  })
  const { addHistorySnapshot } = useHistorySnapshot()
  const [lineStyleOptions] = useState<LineStyleType[]>(['solid', 'dashed', 'dotted'])
  const [lineMarkerOptions] = useState<LinePoint[]>(['', 'arrow', 'dot'])
  const lineBroken2DirectionOptions = [
    { label: LL.editor.stylePanel.line.directionAuto(), value: 'auto' as const },
    { label: LL.editor.stylePanel.line.directionHorizontal(), value: 'horizontal' as const },
    { label: LL.editor.stylePanel.line.directionVertical(), value: 'vertical' as const },
  ]
  const lineTypeOptions: LineTypeOption[] = [
    { key: 'straight', path: 'M 2 2 L 22 22' },
    { key: 'broken', path: 'M 2 2 L 2 22 L 22 22', isBroken: true },
    { key: 'broken2', path: 'M 2 2 L 12 2 L 12 22 L 22 22', isBroken2: true },
    { key: 'curve', path: 'M 2 2 Q 2 22 22 22', isCurve: true },
    { key: 'cubic', path: 'M 2 2 C 22 2 2 22 22 22', isCubic: true },
  ]

  const changeLineType = (line: LineTypeOption) => {
    const handleElement = getHandleElement()
    if (!handleElement || handleElement.type !== 'line') return
    const { id, start, end } = handleElement
    const midpoint: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
    const propName: Array<keyof PPTLineElement> = ['broken', 'broken2', 'curve', 'cubic']
    if (!line.isBroken2) propName.push('broken2Direction')
    useSlidesStore.getState().removeElementProps({ id, propName })
    const props: Partial<PPTLineElement> = {}
    if (line.isBroken) props.broken = midpoint
    if (line.isBroken2) props.broken2 = midpoint
    if (line.isCurve) props.curve = midpoint
    if (line.isCubic) props.cubic = [midpoint, midpoint]
    useSlidesStore.getState().updateElement({ id, props })
    addHistorySnapshot()
  }

  const updateLine = (props: Partial<PPTLineElement>) => {
    const handleElement = getHandleElement()
    if (!handleElement) return
    useSlidesStore.getState().updateElement({ id: handleElement.id, props })
    addHistorySnapshot()
  }

  const updateBroken2Direction = (value: string | number) => {
    const handleElement = getHandleElement()
    if (!handleElement) return
    if (value === 'auto') {
      useSlidesStore.getState().removeElementProps({ id: handleElement.id, propName: 'broken2Direction' })
      addHistorySnapshot()
    }
    else updateLine({ broken2Direction: value as Broken2LineDirection })
  }

  if (!handleLineElement) return null

  return (
    <div className={cx('line-style-panel')}>
      <div className={cx('title')}>
        <span>{LL.editor.stylePanel.line.clickToReplaceLineType()}</span>
        <Icon icon="chevron-down" />
      </div>
      <div className={cx('line-pool-wrapper')}>
        <div className={cx('line-type-list')}>
          {lineTypeOptions.map(item => (
            <div className={cx('line-type-item')} key={item.key} onClick={() => changeLineType(item)}>
              <div className={cx('line-type-content')}>
                <svg overflow="visible" width="24" height="24">
                  <defs>
                    {handleLineElement.points[0] ? (
                      <LinePointMarker id={`replace-line-${item.key}`} position="start" type={handleLineElement.points[0]} color="currentColor" baseSize={2} preview />
                    ) : null}
                    {handleLineElement.points[1] ? (
                      <LinePointMarker id={`replace-line-${item.key}`} position="end" type={handleLineElement.points[1]} color="currentColor" baseSize={2} preview />
                    ) : null}
                  </defs>
                  <path
                    d={item.path}
                    stroke="currentColor"
                    fill="none"
                    strokeWidth="2"
                    strokeDasharray={handleLineElement.style === 'solid' ? '0, 0' : '4, 1'}
                    markerStart={handleLineElement.points[0] ? `url(#${`replace-line-${item.key}`}-${handleLineElement.points[0]}-start)` : ''}
                    markerEnd={handleLineElement.points[1] ? `url(#${`replace-line-${item.key}`}-${handleLineElement.points[1]}-end)` : ''}
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.line.lineStyle()}</div>
        <SelectCustom
          style={{ width: '60%' }}
          options={lineStyleOptions.map(item => (
            <div className={cx('option')} key={item} onClick={() => updateLine({ style: item })}>
              <SVGLine type={item} />
            </div>
          ))}
          label={<SVGLine type={handleLineElement.style} />}
        />
      </div>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.line.lineColor()}</div>
        <Popover
          trigger="click"
          style={{ width: '60%' }}
          content={<ColorPicker modelValue={handleLineElement.color} onUpdateModelValue={value => updateLine({ color: value })} />}
        >
          <ColorButton color={handleLineElement.color} />
        </Popover>
      </div>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.line.lineWidth()}</div>
        <NumberInput
          value={handleLineElement.width}
          onUpdateValue={value => updateLine({ width: value })}
          style={{ width: '60%' }}
        />
      </div>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.line.startPointStyle()}</div>
        <SelectCustom
          style={{ width: '60%' }}
          options={lineMarkerOptions.map(item => (
            <div className={cx('option')} key={item} onClick={() => updateLine({ points: [item, handleLineElement.points[1]] })}>
              <SVGLine padding={5} markers={[item, '']} />
            </div>
          ))}
          label={<SVGLine padding={5} markers={[handleLineElement.points[0], '']} />}
        />
      </div>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.line.endPointStyle()}</div>
        <SelectCustom
          style={{ width: '60%' }}
          options={lineMarkerOptions.map(item => (
            <div className={cx('option')} key={item} onClick={() => updateLine({ points: [handleLineElement.points[0], item] })}>
              <SVGLine padding={5} markers={['', item]} />
            </div>
          ))}
          label={<SVGLine padding={5} markers={['', handleLineElement.points[1]]} />}
        />
      </div>
      {handleLineElement.broken2 ? (
        <div className={cx('row')}>
          <div style={{ width: '40%' }}>{LL.editor.stylePanel.line.lineDirection()}</div>
          <Select
            style={{ width: '60%' }}
            value={handleLineElement.broken2Direction || 'auto'}
            options={lineBroken2DirectionOptions}
            onUpdateValue={value => updateBroken2Direction(value)}
          />
        </div>
      ) : null}
      <Divider />
      <div className={cx('row')}>
        <Button style={{ flex: '1' }} onClick={() => updateLine({ start: handleLineElement.end, end: handleLineElement.start })}>
          <Icon icon="arrow-left-right" /> {LL.editor.stylePanel.line.swapDirection()}
        </Button>
      </div>
      <ElementShadow />
    </div>
  )
})

export default LineStylePanel
