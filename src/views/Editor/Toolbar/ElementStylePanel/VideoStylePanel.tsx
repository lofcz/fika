import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './VideoStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo, useState } from 'react'

import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import { getHandleElement, useHandleElementId, useHandleElementShallow } from '../common/handleElement'
import type { PPTVideoElement } from '@/types/slides'
import { getImageDataURL } from '@/utils/image'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import FileInput from '@/components/FileInput'
import Button from '@/components/Button'
import Switch from '@/components/Switch'
import Divider from '@/components/Divider'
import { useI18nContext } from '@/i18n/useI18nContext'
import { isElementSelectable } from '@/utils/selection'
import message from '@/utils/message'
import { getLL } from '@/i18n/getLL'

const posterRequests = new Map<string, symbol>()

const VideoStylePanel = memo(() => {
  const { LL } = useI18nContext()
  const handleVideoElement = useHandleElementShallow(el => {
    if (!el || el.type !== 'video') return null
    return { poster: el.poster, autoplay: el.autoplay }
  })
  const elementId = useHandleElementId()
  const slideId = useSlidesStore(s => selectCurrentSlide(s)?.id)
  const [generatingTargets, setGeneratingTargets] = useState<Set<string>>(() => new Set())
  const synthesizing = generatingTargets.has(JSON.stringify([slideId, elementId]))
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
    const slide = selectCurrentSlide(useSlidesStore.getState())
    if (!imageFile || element?.type !== 'video' || !slide
      || !isElementSelectable(element, slide.elements, useMainStore.getState().hiddenElementIdList)) return
    const slideId = slide.id
    const elementId = element.id
    const key = JSON.stringify([slideId, elementId])
    const request = Symbol()
    posterRequests.set(key, request)
    getImageDataURL(imageFile).then(dataURL => {
      if (posterRequests.get(key) !== request) return
      const store = useSlidesStore.getState()
      const currentSlide = store.slides.find(slide => slide.id === slideId)
      const current = currentSlide?.elements.find(el => el.id === elementId)
      if (!currentSlide || current?.type !== 'video'
        || !isElementSelectable(current, currentSlide.elements, useMainStore.getState().hiddenElementIdList)) return
      store.updateElement({ id: elementId, slideId, props: { poster: dataURL } })
      addHistorySnapshot()
    }).catch(() => {
      if (posterRequests.get(key) === request) message.error(getLL().common.fileParseError())
    }).finally(() => {
      if (posterRequests.get(key) === request) posterRequests.delete(key)
    })
  }

  const resetPoster = () => {
    const element = getHandleElement()
    const slideId = selectCurrentSlide(useSlidesStore.getState())?.id
    if (element?.type !== 'video' || !slideId) return
    posterRequests.delete(JSON.stringify([slideId, element.id]))
    updateVideo({ poster: '' })
  }

  const generatePoster = async () => {
    const el = getHandleElement() as PPTVideoElement | null
    const slide = selectCurrentSlide(useSlidesStore.getState())
    if (el?.type !== 'video' || !el.src || !slide || synthesizing
      || !isElementSelectable(el, slide.elements, useMainStore.getState().hiddenElementIdList)) return
    const slideId = slide.id
    const key = JSON.stringify([slideId, el.id])
    const request = Symbol()
    posterRequests.set(key, request)
    const commitPoster = (poster: string) => {
      if (posterRequests.get(key) !== request) return
      const store = useSlidesStore.getState()
      const currentSlide = store.slides.find(slide => slide.id === slideId)
      const current = currentSlide?.elements.find(item => item.id === el.id)
      if (!currentSlide || current?.type !== 'video' || current.src !== el.src
        || !isElementSelectable(current, currentSlide.elements, useMainStore.getState().hiddenElementIdList)) return
      store.updateElement({ id: el.id, slideId, props: { poster } })
      addHistorySnapshot()
    }
    setGeneratingTargets(targets => new Set(targets).add(key))
    try {
      const { captureVideoPoster, synthesizeVideoPoster } = await import('@/utils/mediaPoster')
      const { mediaPlayerHostId } = await import('@/utils/mediaLayout')
      const video = (
        document.querySelector(`#${mediaPlayerHostId(el.id)} video`)
        || document.querySelector(`#editable-element-${el.id} video`)
      ) as HTMLVideoElement | null
      const fromPlayer = captureVideoPoster(video, { acceptBlank: true })
      if (fromPlayer) {
        commitPoster(fromPlayer)
        return
      }
      const poster = await synthesizeVideoPoster(el.src)
      if (poster) commitPoster(poster)
      else if (posterRequests.get(key) === request) message.error(getLL().common.fileParseError())
    }
    catch {
      if (posterRequests.get(key) === request) message.error(getLL().common.fileParseError())
    }
    finally {
      if (posterRequests.get(key) === request) posterRequests.delete(key)
      setGeneratingTargets(targets => {
        const next = new Set(targets)
        next.delete(key)
        return next
      })
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
