import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './VideoStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useState } from 'react'

import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementShallow } from '../common/handleElement'
import type { PPTVideoElement } from '@/types/slides'
import { getImageDataURL } from '@/utils/image'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import FileInput from '@/components/FileInput'
import Button from '@/components/Button'
import Switch from '@/components/Switch'
import Divider from '@/components/Divider'
import { useI18nContext } from '@/i18n/useI18nContext'

const VideoStylePanel = memo(() => {
  const { LL } = useI18nContext()
  const handleVideoElement = useHandleElementShallow(el => {
    if (!el || el.type !== 'video') return null
    return { poster: el.poster, autoplay: el.autoplay }
  })
  const [synthesizing, setSynthesizing] = useState(false)
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateVideo = (props: Partial<PPTVideoElement>) => {
    const handleElement = getHandleElement()
    if (!handleElement) return
    useSlidesStore.getState().updateElement({ id: handleElement.id, props })
    addHistorySnapshot()
  }

  const setVideoPoster = (files: FileList) => {
    const imageFile = files[0]
    if (!imageFile) return
    getImageDataURL(imageFile).then(dataURL => updateVideo({ poster: dataURL }))
  }

  const generatePoster = async () => {
    const el = getHandleElement() as PPTVideoElement | null
    if (!el?.src || synthesizing) return
    setSynthesizing(true)
    try {
      const { captureVideoPoster, synthesizeVideoPoster } = await import('@/utils/mediaPoster')
      const { mediaPlayerHostId } = await import('@/utils/mediaLayout')
      const video = (
        document.querySelector(`#${mediaPlayerHostId(el.id)} video`)
        || document.querySelector(`#editable-element-${el.id} video`)
      ) as HTMLVideoElement | null
      const fromPlayer = captureVideoPoster(video, { acceptBlank: true })
      if (fromPlayer) {
        updateVideo({ poster: fromPlayer })
        return
      }
      const poster = await synthesizeVideoPoster(el.src)
      updateVideo({ poster: poster || '' })
    }
    finally {
      setSynthesizing(false)
    }
  }

  if (!handleVideoElement) return null

  return (
    <div className={cx('video-style-panel')}>
      <div className={cx('title')}>{LL.editor.videoStyle.previewPoster()}</div>
      <div className={cx('background-image-wrapper')}>
        <FileInput onChange={files => setVideoPoster(files)}>
          <div className={cx('background-image')}>
            <div
              className={cx('content', { synthesizing })}
              style={{ backgroundImage: handleVideoElement.poster ? `url(${handleVideoElement.poster})` : '' }}
            >
              {synthesizing ? <span className={cx('skel')} /> : <Icon icon="plus" />}
            </div>
          </div>
        </FileInput>
      </div>
      <div className={cx('row')}>
        <Button style={{ flex: '1' }} disabled={synthesizing} onClick={() => generatePoster()}>
          <Icon icon="camera" /> {synthesizing ? LL.editor.videoStyle.synthesizingPoster() : LL.editor.videoStyle.setFirstFrameAsPoster()}
        </Button>
      </div>
      {handleVideoElement.poster ? (
        <div className={cx('row')}>
          <Button style={{ flex: '1' }} onClick={() => updateVideo({ poster: '' })}>
            <Icon icon="undo-2" /> {LL.editor.videoStyle.resetPoster()}
          </Button>
        </div>
      ) : null}
      <Divider />
      <div className={cx('row switch-row')}>
        <div style={{ width: '40%' }}>{LL.editor.videoStyle.autoplay()}</div>
        <div className={cx('switch-wrapper')} style={{ width: '60%' }}>
          <Switch value={handleVideoElement.autoplay} onUpdateValue={value => updateVideo({ autoplay: value })} />
        </div>
      </div>
    </div>
  )
})

export default VideoStylePanel
