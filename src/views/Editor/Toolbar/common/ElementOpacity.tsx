import { memo } from 'react'

import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementSelect } from './handleElement'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import PanelSection from './PanelSection'
import Slider from '@/components/Slider'
import { useI18nContext } from '@/i18n/useI18nContext'

const ElementOpacity = memo(() => {
  const { LL } = useI18nContext()
  const opacity = useHandleElementSelect(el => el && 'opacity' in el && el.opacity !== undefined ? el.opacity : 1)
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateOpacity = (value: number) => {
    const el = getHandleElement()
    if (!el) return
    useSlidesStore.getState().updateElement({ id: el.id, props: { opacity: value } })
    addHistorySnapshot()
  }

  return (
    <PanelSection>
      <div className="field">
        <span className="field-label">{LL.editor.elementCommon.opacity()}</span>
        <Slider min={0} max={1} step={0.1} value={opacity} onUpdateValue={value => updateOpacity(value)} />
      </div>
    </PanelSection>
  )
})

export default ElementOpacity
