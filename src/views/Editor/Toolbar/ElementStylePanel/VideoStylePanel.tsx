import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './VideoStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useState } from 'react'

import { useSlidesStore, selectCurrentSlide } from '@/store'
import { getHandleElement, useHandleElementShallow } from '../common/handleElement'
import type { PPTVideoElement } from '@/types/slides'
import { getImageDataURL } from '@/utils/image'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import FileInput from '@/components/FileInput'
import Button from '@/components/Button'
import Switch from '@/components/Switch'
import Divider from '@/components/Divider'
import { useI18nContext } from '@/i18n/useI18nContext'

const posterUploadRequests = new Map<string, symbol>()

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
    const element = getHandleElement()
    const slideId = selectCurrentSlide(useSlidesStore.getState())?.id
    if (!imageFile || element?.type !== 'video' || !slideId) return
    const elementId = element.id
    const key = JSON.stringify([slideId, elementId])
    const request = Symbol()
    posterUploadRequests.set(key, request)
    getImageDataURL(imageFile).then(dataURL => {
      if (posterUploadRequests.get(key) !== request) return
      const store = useSlidesStore.getState()
      const current = store.slides.find(slide => slide.id === slideId)?.elements.find(el => el.id === elementId)
      if (current?.type !== 'video') return
      store.updateElement({ id: elementId, slideId, props: { poster: dataURL } })
      addHistorySnapshot()
    }).finally(() => {
      if (posterUploadRequests.get(key) === request) posterUploadRequests.delete(key)
    })
  }

  const resetPoster = () => {
    const element = getHandleElement()
    const slideId = selectCurrentSlide(useSlidesStore.getState())?.id
    if (element?.type !== 'video' || !slideId) return
    posterUploadRequests.delete(JSON.stringify([slideId, element.id]))
    updateVideo({ poster: '' })
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
          <Button style={{ flex: '1' }} onClick={resetPoster}>
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
