import { bindStyles } from '@/utils/cssm'
import styles from './TextStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useMemo, useState, useLayoutEffect } from 'react'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore } from '@/store'
import { useHandleElementId, useHandleElementShallow, useToolbarStoreSelect } from '../common/handleElement'
import type { PPTTextElement, TextAlignVertical, TextInset } from '@/types/slides'
import emitter, { EmitterEvents, type RichTextAction } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import ElementOpacity from '../common/ElementOpacity'
import ElementOutline from '../common/ElementOutline'
import ElementShadow from '../common/ElementShadow'
import RichTextBase from '../common/RichTextBase'
import PanelSection from '../common/PanelSection'
import BoxInsetControl from '../common/BoxInsetControl'
import ColorSwatches from '@/components/ColorSwatches'
import FormatChip from '@/components/FormatChip'
import Select from '@/components/Select'
import { Icon } from '@/components/Icon'
import {
  PLACEHOLDER_FILLED_WEIGHT,
  TEXT_PRESET_BODY,
  TEXT_PRESET_BODY_SMALL,
  TEXT_PRESET_CAPTION,
  TEXT_PRESET_LARGE_TITLE,
  TEXT_PRESET_SMALL_TITLE,
} from '@/configs/textPresets'

type PresetKey = 'largeTitle' | 'smallTitle' | 'body' | 'bodySmall' | 'caption'

const presetStyleDefs: {
  key: PresetKey
  preview: { fontSize: number; fontWeight: number; fontStyle: string }
  cmd: RichTextAction[]
}[] = [
  {
    key: 'largeTitle',
    preview: { fontSize: 15, fontWeight: PLACEHOLDER_FILLED_WEIGHT, fontStyle: 'normal' },
    cmd: [
      { command: 'clear' },
      { command: 'bold' },
      { command: 'fontsize', value: `${TEXT_PRESET_LARGE_TITLE.fontSize}px` },
      { command: 'align', value: TEXT_PRESET_LARGE_TITLE.align },
    ],
  },
  {
    key: 'smallTitle',
    preview: { fontSize: 13, fontWeight: PLACEHOLDER_FILLED_WEIGHT, fontStyle: 'normal' },
    cmd: [
      { command: 'clear' },
      { command: 'bold' },
      { command: 'fontsize', value: `${TEXT_PRESET_SMALL_TITLE.fontSize}px` },
      { command: 'align', value: TEXT_PRESET_SMALL_TITLE.align },
    ],
  },
  {
    key: 'body',
    preview: { fontSize: 12, fontWeight: 400, fontStyle: 'normal' },
    cmd: [
      { command: 'clear' },
      { command: 'fontsize', value: `${TEXT_PRESET_BODY.fontSize}px` },
    ],
  },
  {
    key: 'bodySmall',
    preview: { fontSize: 11, fontWeight: 400, fontStyle: 'normal' },
    cmd: [
      { command: 'clear' },
      { command: 'fontsize', value: `${TEXT_PRESET_BODY_SMALL.fontSize}px` },
    ],
  },
  {
    key: 'caption',
    preview: { fontSize: 11, fontWeight: 400, fontStyle: 'italic' },
    cmd: [
      { command: 'clear' },
      { command: 'fontsize', value: `${TEXT_PRESET_CAPTION.fontSize}px` },
      { command: 'em' },
    ],
  },
]

const lineHeightOptions = [0.9, 1.0, 1.15, 1.2, 1.4, 1.5, 1.8, 2.0, 2.5, 3.0]
const paragraphSpaceOptions = [0, 5, 10, 15, 20, 25, 30, 40, 50, 80]
const DEFAULT_INSET: TextInset = [10, 10, 10, 10]

const TextStylePanel = memo(function TextStylePanel() {
  const { LL } = useI18nContext()
  const handleElementId = useHandleElementId()
  const textStyle = useHandleElementShallow(el => {
    if (!el || el.type !== 'text') return null
    return {
      fill: el.fill || '',
      lineHeight: el.lineHeight || 1.5,
      paragraphSpace: el.paragraphSpace === undefined ? 5 : el.paragraphSpace,
      inset: el.inset || DEFAULT_INSET,
      fixedHeight: !!el.fixedHeight,
      vAlign: (el.vAlign || 'top') as TextAlignVertical,
    }
  })
  const richTextAttrs = useToolbarStoreSelect(
    () => useMainStore.getState().richTextAttrs,
    (a, b) => (
      a.fontname === b.fontname && a.fontsize === b.fontsize && a.em === b.em && a.color === b.color
    ),
  )
  const { addHistorySnapshot } = useHistorySnapshot()

  const [colorTarget, setColorTarget] = useState<'fg' | 'bg'>('fg')
  const fill = textStyle?.fill ?? ''
  const lineHeight = textStyle?.lineHeight
  const paragraphSpace = textStyle?.paragraphSpace
  const inset = textStyle?.inset ?? DEFAULT_INSET
  const fixedHeight = textStyle?.fixedHeight ?? false
  const vAlign = (textStyle?.vAlign ?? 'top') as TextAlignVertical

  const presetLabels = useMemo<Record<PresetKey, string>>(() => ({
    largeTitle: LL.editor.stylePanel.text.presetLargeTitle(),
    smallTitle: LL.editor.stylePanel.text.presetSmallTitle(),
    body: LL.editor.stylePanel.text.presetBody(),
    bodySmall: LL.editor.stylePanel.text.presetBodySmall(),
    caption: LL.editor.stylePanel.text.presetNote1(),
  }), [LL])

  const presetStyles = useMemo(() => {
    const fontFamilyStyle = richTextAttrs.fontname ? { fontFamily: richTextAttrs.fontname } : {}
    return presetStyleDefs.map(item => ({
      key: item.key,
      label: presetLabels[item.key],
      sampleStyle: {
        ...fontFamilyStyle,
        fontSize: `${item.preview.fontSize}px`,
        fontWeight: item.preview.fontWeight,
        fontStyle: item.preview.fontStyle,
      },
      cmd: item.cmd,
    }))
  }, [presetLabels, richTextAttrs.fontname])

  const size = parseInt(richTextAttrs.fontsize, 10)
  const activePreset: PresetKey | null =
    size === TEXT_PRESET_LARGE_TITLE.fontSize ? 'largeTitle'
      : size === TEXT_PRESET_SMALL_TITLE.fontSize ? 'smallTitle'
        : size === TEXT_PRESET_BODY.fontSize ? 'body'
          : size === TEXT_PRESET_BODY_SMALL.fontSize ? 'bodySmall'
            : size === TEXT_PRESET_CAPTION.fontSize && richTextAttrs.em ? 'caption'
              : null

  const activeColor = colorTarget === 'fg' ? (richTextAttrs.color || '') : fill

  const updateText = useCallback((props: Partial<PPTTextElement>) => {
    useSlidesStore.getState().updateElement({ id: handleElementId, props })
    addHistorySnapshot()
  }, [handleElementId, addHistorySnapshot])

  const applyColor = useCallback((value: string) => {
    if (colorTarget === 'fg') {
      emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command: 'color', value } })
      return
    }
    updateText({ fill: value })
  }, [colorTarget, updateText])

  useLayoutEffect(() => {
    emitter.emit(EmitterEvents.SYNC_RICH_TEXT_ATTRS_TO_STORE)
  }, [handleElementId])

  const lineHeightSelectOptions = useMemo(() => lineHeightOptions.map(item => ({
    label: LL.editor.stylePanel.shared.lineHeightOption({ value: item }),
    value: item,
  })), [LL])
  const paragraphSpaceSelectOptions = useMemo(() => paragraphSpaceOptions.map(item => ({
    label: LL.editor.stylePanel.shared.pixelValue({ value: item }),
    value: item,
  })), [LL])

  const applyPreset = useCallback((action: RichTextAction[]) => {
    emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action })
  }, [])

  const updateFixedHeight = useCallback((fixed: boolean) => {
    if (fixed) updateText({ fixedHeight: true, vAlign: vAlign || 'top' })
    else {
      useSlidesStore.getState().removeElementProps({ id: handleElementId, propName: ['fixedHeight', 'vAlign'] })
      addHistorySnapshot()
    }
  }, [updateText, vAlign, handleElementId, addHistorySnapshot])

  const presetsSlot = useMemo(() => (
    <div className={cx('preset-grid')}>
      {presetStyles.map(item => (
        <button
          key={item.key}
          type="button"
          className={cx('preset-card', { selected: activePreset === item.key, wide: item.key === 'caption' })}
          onMouseDown={event => { event.preventDefault() }}
          onClick={() => applyPreset(item.cmd)}
        >
          <span className={cx('preset-card-label')} style={item.sampleStyle}>{item.label}</span>
        </button>
      ))}
    </div>
  ), [presetStyles, activePreset, applyPreset])

  const colorSlot = useMemo(() => (
    <PanelSection
      label={LL.editor.panel.color()}
      action={(
        <div className={cx('target-toggle')}>
          <button
            type="button"
            className={cx('target-btn', { on: colorTarget === 'fg' })}
            data-tooltip={LL.editor.multiStyle.textColor()}
            onMouseDown={event => { event.preventDefault() }}
            onClick={() => setColorTarget('fg')}
          >
            A
          </button>
          <button
            type="button"
            className={cx('target-btn', { on: colorTarget === 'bg' })}
            data-tooltip={LL.editor.panel.fill()}
            onMouseDown={event => { event.preventDefault() }}
            onClick={() => setColorTarget('bg')}
          >
            <span className={cx('fill-glyph')} />
          </button>
        </div>
      )}
    >
      <ColorSwatches
        modelValue={activeColor}
        allowNone
        noneValue=""
        noneTitle={LL.editor.panel.none()}
        customTitle={colorTarget === 'fg' ? LL.editor.multiStyle.textColor() : LL.editor.stylePanel.text.textBoxFill()}
        onUpdateModelValue={applyColor}
      />
    </PanelSection>
  ), [LL, colorTarget, activeColor, applyColor])

  const paragraphActionSlot = useMemo(() => (
    <div className={cx('target-toggle')}>
      <button
        type="button"
        className={cx('target-btn', { on: !fixedHeight })}
        data-tooltip={LL.editor.stylePanel.text.autoHeight()}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => updateFixedHeight(false)}
      >
        <Icon icon="unfold-vertical" />
      </button>
      <button
        type="button"
        className={cx('target-btn', { on: fixedHeight })}
        data-tooltip={LL.editor.stylePanel.text.fixedHeight()}
        onMouseDown={event => { event.preventDefault() }}
        onClick={() => updateFixedHeight(true)}
      >
        <Icon icon="square" />
      </button>
    </div>
  ), [LL, fixedHeight, updateFixedHeight])

  const paragraphExtraSlot = useMemo(() => (
    fixedHeight ? (
      <div className={cx('chip-row')}>
        <FormatChip active={vAlign === 'top'} data-tooltip={LL.editor.stylePanel.shared.textAlignTop()} onClick={() => updateText({ vAlign: 'top' })}>
          <Icon icon="align-vertical-justify-start" />
        </FormatChip>
        <FormatChip active={vAlign === 'middle'} data-tooltip={LL.editor.stylePanel.shared.textAlignMiddle()} onClick={() => updateText({ vAlign: 'middle' })}>
          <Icon icon="align-vertical-justify-center" />
        </FormatChip>
        <FormatChip active={vAlign === 'bottom'} data-tooltip={LL.editor.stylePanel.shared.textAlignBottom()} onClick={() => updateText({ vAlign: 'bottom' })}>
          <Icon icon="align-vertical-justify-end" />
        </FormatChip>
      </div>
    ) : null
  ), [LL, fixedHeight, vAlign, updateText])

  return (
    <div className={cx('text-style-panel')}>
      <RichTextBase
        showColor={false}
        presets={presetsSlot}
        color={colorSlot}
        paragraphAction={paragraphActionSlot}
        paragraphExtra={paragraphExtraSlot}
      />
      <ElementOutline />
      <PanelSection label={LL.editor.panel.box()}>
        <div className={cx('field')}>
          <span className={cx('field-icon')} data-tooltip={LL.editor.stylePanel.shared.lineHeight()}>
            <Icon icon="move-vertical" />
          </span>
          <Select
            className={cx('quiet-select')}
            value={lineHeight || 1}
            onUpdateValue={value => updateText({ lineHeight: value as number })}
            options={lineHeightSelectOptions}
          />
        </div>
        <BoxInsetControl
          value={inset}
          topTitle={LL.editor.stylePanel.shared.paddingTop()}
          rightTitle={LL.editor.stylePanel.shared.paddingRight()}
          bottomTitle={LL.editor.stylePanel.shared.paddingBottom()}
          leftTitle={LL.editor.stylePanel.shared.paddingLeft()}
          onUpdateValue={value => updateText({ inset: value })}
        />
        <div className={cx('field')}>
          <span className={cx('field-icon')} data-tooltip={LL.editor.stylePanel.shared.paragraphSpace()}>
            <Icon icon="between-vertical-start" />
          </span>
          <Select
            className={cx('quiet-select')}
            value={paragraphSpace || 0}
            onUpdateValue={value => updateText({ paragraphSpace: value as number })}
            options={paragraphSpaceSelectOptions}
          />
        </div>
      </PanelSection>
      <ElementShadow />
      <ElementOpacity />
    </div>
  )
})

export default TextStylePanel
