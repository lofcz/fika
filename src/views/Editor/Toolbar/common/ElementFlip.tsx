import { memo } from 'react'
import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementShallow } from './handleElement'
import type { ImageOrShapeFlip } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import PanelSection from './PanelSection'
import FormatChip from '@/components/FormatChip'
import { useI18nContext } from '@/i18n/useI18nContext'
import { Icon } from '@/components/Icon'

const ElementFlip = memo(function ElementFlip() {
  const { LL } = useI18nContext()
  const flip = useHandleElementShallow(el => {
    if (!el || (el.type !== 'image' && el.type !== 'shape')) return null
    return { flipH: !!el.flipH, flipV: !!el.flipV }
  })
  const flipH = flip?.flipH ?? false
  const flipV = flip?.flipV ?? false
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateFlip = (flipProps: ImageOrShapeFlip) => {
    const el = getHandleElement()
    if (!el) return
    useSlidesStore.getState().updateElement({ id: el.id, props: flipProps })
    addHistorySnapshot()
  }

  return (
    <PanelSection>
      <div className="chip-row">
        <FormatChip active={flipV} onClick={() => updateFlip({ flipV: !flipV })}>
          <Icon icon="flip-vertical-2" /> {LL.editor.elementCommon.flipVertical()}
        </FormatChip>
        <FormatChip active={flipH} onClick={() => updateFlip({ flipH: !flipH })}>
          <Icon icon="flip-horizontal-2" /> {LL.editor.elementCommon.flipHorizontal()}
        </FormatChip>
      </div>
    </PanelSection>
  )
})

export default ElementFlip
