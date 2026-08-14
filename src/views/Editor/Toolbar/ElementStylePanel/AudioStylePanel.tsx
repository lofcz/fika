import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './AudioStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useState } from 'react'

import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementShallow } from '../common/handleElement'
import type { PPTAudioElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import ColorButton from '@/components/ColorButton'
import ColorPicker from '@/components/ColorPicker/index'
import Switch from '@/components/Switch'
import Popover from '@/components/Popover'
import Button from '@/components/Button'
import { useI18nContext } from '@/i18n/useI18nContext'

const AudioStylePanel = memo(() => {
  const { LL } = useI18nContext()
  const handleAudioElement = useHandleElementShallow(el => {
    if (!el || el.type !== 'audio') return null
    return { color: el.color, autoplay: el.autoplay, loop: el.loop }
  })
  const [synthesizing, setSynthesizing] = useState(false)
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateAudio = (props: Partial<PPTAudioElement>) => {
    const handleElement = getHandleElement()
    if (!handleElement) return
    useSlidesStore.getState().updateElement({ id: handleElement.id, props })
    addHistorySnapshot()
  }

  const generatePoster = async () => {
    const el = getHandleElement() as PPTAudioElement | null
    if (!el?.src || synthesizing) return
    setSynthesizing(true)
    try {
      const { synthesizeAudioPoster } = await import('@/utils/mediaPoster')
      const poster = await synthesizeAudioPoster(el.src, el.color)
      if (poster) updateAudio({ poster })
    }
    finally {
      setSynthesizing(false)
    }
  }

  if (!handleAudioElement) return null

  return (
    <div className={cx('audio-style-panel')}>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.audio.iconColor()}</div>
        <Popover
          trigger="click"
          style={{ width: '60%' }}
          content={<ColorPicker modelValue={handleAudioElement.color} onUpdateModelValue={value => updateAudio({ color: value })} />}
        >
          <ColorButton color={handleAudioElement.color} />
        </Popover>
      </div>
      <div className={cx('row')}>
        <Button style={{ flex: '1' }} disabled={synthesizing} onClick={() => generatePoster()}>
          <Icon icon="camera" /> {synthesizing ? LL.editor.videoStyle.synthesizingPoster() : LL.editor.stylePanel.audio.generatePoster()}
        </Button>
      </div>
      <div className={cx('row switch-row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.audio.autoplay()}</div>
        <div className={cx('switch-wrapper')} style={{ width: '60%' }}>
          <Switch value={handleAudioElement.autoplay} onUpdateValue={value => updateAudio({ autoplay: value })} />
        </div>
      </div>
      <div className={cx('row switch-row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.audio.loopPlayback()}</div>
        <div className={cx('switch-wrapper')} style={{ width: '60%' }}>
          <Switch value={handleAudioElement.loop} onUpdateValue={value => updateAudio({ loop: value })} />
        </div>
      </div>
    </div>
  )
})

export default AudioStylePanel
