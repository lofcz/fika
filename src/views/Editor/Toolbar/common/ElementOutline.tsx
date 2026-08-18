import { bindStyles } from '@/utils/cssm'
import styles from './ElementOutline.module.scss'
const cx = bindStyles(styles)
import { memo, useState } from 'react'

import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementSelect, useHandleElementShallow } from './handleElement'
import type { LineStyleType, PPTElementOutline } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import SVGLine from './SVGLine'
import PanelSection from './PanelSection'
import ColorSwatches from '@/components/ColorSwatches'
import SelectCustom from '@/components/SelectCustom'
import Slider from '@/components/Slider'
import { outlineElementPatch, outlineRadiusToPercent, percentToOutlineRadius, resolveOutlineRadiusPx } from '@/utils/elementOutline'
import { useI18nContext } from '@/i18n/useI18nContext'

export const OUTLINE_WIDTH_MAX = 20
export const OUTLINE_RADIUS_MAX = 100

export type IElementOutlineProps = {
  fixed?: boolean
}

const ElementOutline = memo(({ fixed = false }: IElementOutlineProps) => {
  const { LL } = useI18nContext()
  const theme = useSlidesStore(s => s.theme)
  const outline = useHandleElementSelect(el => el && 'outline' in el ? el.outline : undefined)
  const box = useHandleElementShallow(el => el ? { width: el.width, height: 'height' in el ? el.height : 0 } : { width: 0, height: 0 })
  const hasOutline = !!outline
  const [lineStyleOptions] = useState<LineStyleType[]>(['solid', 'dashed', 'dotted'])
  const { addHistorySnapshot } = useHistorySnapshot()

  const toggleFaceStyle = (!hasOutline || !outline) ? undefined : {
    borderColor: outline.color || '#18181b',
    borderStyle: outline.style === 'dotted' ? 'dotted' : outline.style === 'dashed' ? 'dashed' : 'solid',
    borderWidth: `${Math.min(3, Math.max(1.5, outline.width || 2))}px`,
    borderRadius: `${Math.min(8, resolveOutlineRadiusPx(outline.radius, 24, 24) || 2)}px`,
  }

  const paintOutline = (outlineProps: Partial<PPTElementOutline>) => {
    const el = getHandleElement()
    if (!el) return
    const nextOutline = { ...outline, ...outlineProps }
    useSlidesStore.getState().updateElement({
      id: el.id,
      props: outlineElementPatch(el, nextOutline, 'radius' in outlineProps),
    })
  }

  const updateOutline = (outlineProps: Partial<PPTElementOutline>) => {
    paintOutline(outlineProps)
    addHistorySnapshot()
  }

  const toggleOutline = (checked: boolean) => {
    const el = getHandleElement()
    if (!el) return
    if (checked) {
      useSlidesStore.getState().updateElement({ id: el.id, props: { outline: theme.outline } })
    }
    else {
      useSlidesStore.getState().removeElementProps({ id: el.id, propName: 'outline' })
    }
    addHistorySnapshot()
  }

  return (
    <PanelSection label={LL.editor.panel.border()}>
      <div className={cx('border-row')}>
        {!fixed ? (
          <button
            type="button"
            className={cx('border-toggle', { on: hasOutline, empty: !hasOutline })}
            data-tooltip={hasOutline ? LL.editor.panel.border() : LL.editor.panel.none()}
            onMouseDown={event => { event.preventDefault() }}
            onClick={() => toggleOutline(!hasOutline)}
          >
            <span className={cx('border-toggle-face', { none: !hasOutline })} style={hasOutline ? toggleFaceStyle : undefined} />
            {!hasOutline ? <span className={cx('border-toggle-label')}>{LL.editor.panel.none()}</span> : null}
          </button>
        ) : null}
        {hasOutline && outline ? (
          <SelectCustom
            className={cx('quiet-line border-style')}
            options={lineStyleOptions.map(item => (
              <div className={cx('option')} key={item} onClick={() => updateOutline({ style: item })}>
                <SVGLine type={item} />
              </div>
            ))}
            label={<SVGLine type={outline.style} />}
          />
        ) : null}
      </div>
      {hasOutline && outline ? (
        <>
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
              value={outlineRadiusToPercent(outline.radius, box.width, box.height)}
              onInput={value => paintOutline({ radius: percentToOutlineRadius(value) })}
              onUpdateValue={value => updateOutline({ radius: percentToOutlineRadius(value) })}
            />
          </div>
        </>
      ) : null}
    </PanelSection>
  )
})

export default ElementOutline
