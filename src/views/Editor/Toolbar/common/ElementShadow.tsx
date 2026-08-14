import { memo } from 'react'

import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementSelect } from './handleElement'
import type { PPTElementShadow } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import PanelSection from './PanelSection'
import ColorSwatches from '@/components/ColorSwatches'
import Switch from '@/components/Switch'
import Slider from '@/components/Slider'
import { useI18nContext } from '@/i18n/useI18nContext'

const ElementShadow = memo(() => {
  const { LL } = useI18nContext()
  const theme = useSlidesStore(s => s.theme)
  const shadow = useHandleElementSelect(el => el && 'shadow' in el ? el.shadow : undefined)
  const hasShadow = !!shadow
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateShadow = (shadowProps: Partial<PPTElementShadow>) => {
    const el = getHandleElement()
    if (!el || !shadow) return
    const _shadow = { ...shadow, ...shadowProps }
    useSlidesStore.getState().updateElement({ id: el.id, props: { shadow: _shadow } })
    addHistorySnapshot()
  }

  const toggleShadow = (checked: boolean) => {
    const el = getHandleElement()
    if (!el) return
    if (checked) {
      useSlidesStore.getState().updateElement({ id: el.id, props: { shadow: theme.shadow } })
    }
    else {
      useSlidesStore.getState().removeElementProps({ id: el.id, propName: 'shadow' })
    }
    addHistorySnapshot()
  }

  return (
    <PanelSection label={LL.editor.panel.shadow()}>
      <div className="field">
        <span className="field-label">{LL.editor.elementShadow.enableShadow()}</span>
        <Switch value={hasShadow} onUpdateValue={value => toggleShadow(value)} />
      </div>
      {hasShadow && shadow ? (
        <>
          <div className="field">
            <span className="field-label">{LL.editor.elementShadow.horizontalShadow()}</span>
            <Slider min={-20} max={20} step={1} value={shadow.h} onUpdateValue={value => updateShadow({ h: value })} />
          </div>
          <div className="field">
            <span className="field-label">{LL.editor.elementShadow.verticalShadow()}</span>
            <Slider min={-20} max={20} step={1} value={shadow.v} onUpdateValue={value => updateShadow({ v: value })} />
          </div>
          <div className="field">
            <span className="field-label">{LL.editor.elementShadow.blurDistance()}</span>
            <Slider min={1} max={30} step={1} value={shadow.blur} onUpdateValue={value => updateShadow({ blur: value })} />
          </div>
          <ColorSwatches
            modelValue={shadow.color}
            customTitle={LL.editor.elementShadow.shadowColor()}
            onUpdateModelValue={value => updateShadow({ color: value })}
          />
        </>
      ) : null}
    </PanelSection>
  )
})

export default ElementShadow
