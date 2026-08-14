import { bindStyles } from '@/utils/cssm'
import styles from './ElementOutline.module.scss'
const cx = bindStyles(styles)
import { memo, useState } from 'react'

import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementSelect } from './handleElement'
import type { LineStyleType, PPTElementOutline } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import SVGLine from './SVGLine'
import PanelSection from './PanelSection'
import ColorSwatches from '@/components/ColorSwatches'
import NumberInput from '@/components/NumberInput'
import SelectCustom from '@/components/SelectCustom'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IElementOutlineProps = {
  fixed?: boolean
}

const ElementOutline = memo(({ fixed = false }: IElementOutlineProps) => {
  const { LL } = useI18nContext()
  const theme = useSlidesStore(s => s.theme)
  const outline = useHandleElementSelect(el => el && 'outline' in el ? el.outline : undefined)
  const hasOutline = !!outline
  const [lineStyleOptions] = useState<LineStyleType[]>(['solid', 'dashed', 'dotted'])
  const { addHistorySnapshot } = useHistorySnapshot()

  const toggleFaceStyle = (!hasOutline || !outline) ? undefined : {
    borderColor: outline.color || '#18181b',
    borderStyle: outline.style === 'dotted' ? 'dotted' : outline.style === 'dashed' ? 'dashed' : 'solid',
    borderWidth: `${Math.min(3, Math.max(1.5, outline.width || 2))}px`,
    borderRadius: `${Math.min(8, outline.radius || 2)}px`,
  }

  const updateOutline = (outlineProps: Partial<PPTElementOutline>) => {
    const el = getHandleElement()
    if (!el) return
    useSlidesStore.getState().updateElement({
      id: el.id,
      props: { outline: { ...outline, ...outlineProps } },
    })
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
          <div className={cx('metric-row')}>
            <NumberInput
              className={cx('metric-input')}
              value={outline.width || 0}
              data-tooltip={LL.editor.multiStyle.borderWidth()}
              onUpdateValue={value => updateOutline({ width: value })}
            />
            <NumberInput
              className={cx('metric-input')}
              min={0}
              max={200}
              value={outline.radius || 0}
              data-tooltip={LL.editor.multiStyle.borderRadius()}
              onUpdateValue={value => updateOutline({ radius: value })}
            />
          </div>
        </>
      ) : null}
    </PanelSection>
  )
})

export default ElementOutline
