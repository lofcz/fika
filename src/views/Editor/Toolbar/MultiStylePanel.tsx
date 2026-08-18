import { bindStyles } from '@/utils/cssm'
import styles from './MultiStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMainStore, useSlidesStore, selectActiveElementList } from '@/store'
import type { LineStyleType, PPTElement, PPTElementOutline } from '@/types/slides'
import { applyTableCellStyles } from '@/utils/tableCellStyle'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { useFonts, fontSizeToPx, parseFontSize } from '@/configs/font'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import SVGLine from './common/SVGLine'
import PanelSection from './common/PanelSection'
import { OUTLINE_RADIUS_MAX, OUTLINE_WIDTH_MAX } from './common/ElementOutline'
import ColorSwatches, { HIGHLIGHT_SWATCHES } from '@/components/ColorSwatches'
import FontSizeControl from '@/components/FontSizeControl'
import FormatChip from '@/components/FormatChip'
import Select from '@/components/Select'
import SelectCustom from '@/components/SelectCustom'
import Slider from '@/components/Slider'
import { outlineRadiusToPercent, percentToOutlineRadius } from '@/utils/elementOutline'
import { Icon } from '@/components/Icon'
import { useI18nContext } from '@/i18n/useI18nContext'

const MultiStylePanel = memo(function MultiStylePanel() {
  const { LL } = useI18nContext()
  const fonts = useFonts()
  const richTextAttrs = useMainStore(useShallow(s => s.richTextAttrs))
  const { addHistorySnapshot } = useHistorySnapshot()

  const [lineStyleOptions] = useState<LineStyleType[]>(['solid', 'dashed', 'dotted'])
  const [fill, setFill] = useState('#fff')
  const [outline, setOutline] = useState<PPTElementOutline>({
    width: 0,
    color: '#fff',
    style: 'solid',
  })

  const updateElement = (id: string, props: Partial<PPTElement>) => {
    useSlidesStore.getState().updateElement({ id, props })
    addHistorySnapshot()
  }

  const activeElements = () => selectActiveElementList(useMainStore.getState())

  const updateFill = (value: string) => {
    for (const el of activeElements()) {
      if (el.type === 'text' || el.type === 'shape' || el.type === 'chart') {
        updateElement(el.id, { fill: value })
      }
      if (el.type === 'table') applyTableCellStyles({ backcolor: value }, { elementId: el.id, allCells: true })
      if (el.type === 'audio') updateElement(el.id, { color: value })
    }
    setFill(value)
  }

  const paintOutline = (outlineProps: Partial<PPTElementOutline>) => {
    for (const el of activeElements()) {
      if (
        el.type === 'text' ||
        el.type === 'image' ||
        el.type === 'shape' ||
        el.type === 'table' ||
        el.type === 'chart'
      ) {
        const current = el.outline || { width: 2, color: '#000', style: 'solid' }
        useSlidesStore.getState().updateElement({ id: el.id, props: { outline: { ...current, ...outlineProps } } })
      }
      if (el.type === 'line') useSlidesStore.getState().updateElement({ id: el.id, props: outlineProps })
    }
    setOutline(prev => ({ ...prev, ...outlineProps }))
  }

  const updateOutline = (outlineProps: Partial<PPTElementOutline>) => {
    paintOutline(outlineProps)
    addHistorySnapshot()
  }

  const updateFontStyle = (command: string, value: string) => {
    for (const el of activeElements()) {
      if (el.type === 'text' || (el.type === 'shape' && el.text?.content)) {
        emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { target: el.id, action: { command, value } })
      }
      if (el.type === 'table') applyTableCellStyles({ [command]: value }, { elementId: el.id, allCells: true })
      if (el.type === 'latex' && command === 'color') {
        updateElement(el.id, { color: value })
      }
    }
  }

  return (
    <div className={cx('multi-style-panel')}>
      <PanelSection label={LL.editor.panel.fill()}>
        <ColorSwatches
          modelValue={fill}
          allowNone
          noneValue=""
          noneTitle={LL.editor.slideDesign.noFill()}
          customTitle={LL.editor.multiStyle.fillColor()}
          onUpdateModelValue={value => updateFill(value)}
        />
      </PanelSection>

      <PanelSection label={LL.editor.panel.border()}>
        <SelectCustom
          className={cx('quiet-line')}
          options={lineStyleOptions.map(item => (
            <div className={cx('option')} key={item} onClick={() => updateOutline({ style: item })}>
              <SVGLine type={item} />
            </div>
          ))}
          label={<SVGLine type={outline.style} />}
        />
        <ColorSwatches
          modelValue={outline.color || '#000'}
          customTitle={LL.editor.multiStyle.borderColor()}
          onUpdateModelValue={value => updateOutline({ color: value })}
        />
        <div className="field">
          <span className="field-label">{LL.editor.multiStyle.borderWidth()}</span>
          <Slider
            min={0}
            max={Math.max(OUTLINE_WIDTH_MAX, outline.width || 0)}
            step={1}
            value={outline.width || 0}
            onInput={value => paintOutline({ width: value })}
            onUpdateValue={value => updateOutline({ width: value })}
          />
        </div>
        <div className="field">
          <span className="field-label">{LL.editor.multiStyle.borderRadius()}</span>
          <Slider
            min={0}
            max={OUTLINE_RADIUS_MAX}
            step={1}
            tooltipSuffix="%"
            value={outlineRadiusToPercent(outline.radius, 0, 0)}
            onInput={value => paintOutline({ radius: percentToOutlineRadius(value) })}
            onUpdateValue={value => updateOutline({ radius: percentToOutlineRadius(value) })}
          />
        </div>
      </PanelSection>

      <PanelSection label={LL.editor.panel.type()}>
        <div className={cx('type-row')}>
          <Select
            className={cx('quiet-select font-select')}
            value={richTextAttrs.fontname}
            search
            searchLabel={LL.editor.multiStyle.searchFont()}
            autofocus
            previewFonts
            onUpdateValue={value => updateFontStyle('fontname', value as string)}
            options={fonts}
          />
          <FontSizeControl
            value={parseFontSize(richTextAttrs.fontsize)}
            onUpdateValue={value => updateFontStyle('fontsize', fontSizeToPx(value))}
          />
        </div>
      </PanelSection>

      <PanelSection label={LL.editor.panel.color()}>
        <ColorSwatches
          modelValue={richTextAttrs.color}
          customTitle={LL.editor.multiStyle.textColor()}
          onUpdateModelValue={value => updateFontStyle('color', value)}
        />
      </PanelSection>

      <PanelSection label={LL.editor.panel.highlight()}>
        <ColorSwatches
          modelValue={richTextAttrs.backcolor}
          includeTheme={false}
          includeNeutrals={false}
          extraColors={HIGHLIGHT_SWATCHES}
          allowNone
          noneValue=""
          noneTitle={LL.editor.panel.none()}
          customTitle={LL.editor.multiStyle.textHighlight()}
          onUpdateModelValue={value => updateFontStyle('backcolor', value)}
        />
      </PanelSection>

      <PanelSection label={LL.editor.panel.paragraph()}>
        <div className="chip-row">
          <FormatChip active={richTextAttrs.align === 'left'} data-tooltip={LL.editor.multiStyle.alignLeft()} onClick={() => updateFontStyle('align', 'left')}>
            <Icon icon="align-left" />
          </FormatChip>
          <FormatChip active={richTextAttrs.align === 'center'} data-tooltip={LL.editor.multiStyle.alignCenter()} onClick={() => updateFontStyle('align', 'center')}>
            <Icon icon="align-center" />
          </FormatChip>
          <FormatChip active={richTextAttrs.align === 'right'} data-tooltip={LL.editor.multiStyle.alignRight()} onClick={() => updateFontStyle('align', 'right')}>
            <Icon icon="align-right" />
          </FormatChip>
          <FormatChip active={richTextAttrs.align as string === 'justify'} data-tooltip={LL.editor.multiStyle.justify()} onClick={() => updateFontStyle('align', 'justify')}>
            <Icon icon="align-justify" />
          </FormatChip>
        </div>
      </PanelSection>
    </div>
  )
})

export default MultiStylePanel
