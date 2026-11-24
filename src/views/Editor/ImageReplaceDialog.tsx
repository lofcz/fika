import { memo, useCallback, useEffect, useId, useRef, useState } from 'react'

import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement, PPTImageElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { drainCommitQueue } from '@/utils/commitQueue'
import { internMediaSrc } from '@/utils/mediaIntern'
import { buildManualImageReplacePatch, recordManualImageReplacement } from '@/utils/imageReplace'
import { isElementSelectable } from '@/utils/selection'
import { queryFika } from '@/utils/portal'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { cancelImageReplacement } from '@/hooks/useImageHandler'
import { cancelPhotoFrameReplacement } from '@/views/Myna/photoFrameUpload'
import Modal from '@/components/Modal'
import MediaPicker, { type MediaPickerReplacePayload } from './CanvasTool/MediaPicker'

const isImageElement = (el: PPTElement): el is PPTImageElement => el.type === 'image'

const ImageReplaceDialog = memo(() => {
  const { addHistorySnapshot } = useHistorySnapshot()
  const readOnly = useMainStore(s => s.readOnly)
  const [visible, setVisible] = useState(false)
  const [target, setTarget] = useState<{ slideId: string; elementId: string } | null>(null)
  const [sessionId, setSessionId] = useState(0)
  const titleId = useId()
  const hotkeysDisabledByDialogRef = useRef(false)

  const targetPresent = useSlidesStore(s => {
    if (!target) return false
    const slide = s.slides.find(item => item.id === target.slideId)
    if (!slide || slide.skeleton) return false
    const el = slide.elements.find(item => item.id === target.elementId)
    if (!el || !isImageElement(el)) return false
    return isElementSelectable(el, slide.elements, useMainStore.getState().hiddenElementIdList)
  })

  useEffect(() => {
    if (!visible) return
    if (readOnly || !target || !targetPresent) {
      setVisible(false)
      setTarget(null)
    }
  }, [visible, readOnly, target, targetPresent])

  useEffect(() => {
    const main = useMainStore.getState()
    if (visible) {
      if (!main.disableHotkeys) {
        hotkeysDisabledByDialogRef.current = true
        main.setDisableHotkeysState(true)
      }
      return
    }
    if (hotkeysDisabledByDialogRef.current) {
      hotkeysDisabledByDialogRef.current = false
      main.setDisableHotkeysState(false)
    }
  }, [visible])

  useEffect(() => () => {
    if (hotkeysDisabledByDialogRef.current) {
      hotkeysDisabledByDialogRef.current = false
      useMainStore.getState().setDisableHotkeysState(false)
    }
  }, [])

  const restoreCanvasFocus = useCallback(() => {
    const main = useMainStore.getState()
    if (!main.readOnly) {
      if (!main.editorAreaFocus) main.setEditorareaFocus(true)
      const canvas = queryFika<HTMLElement>('[data-fika-canvas]')
      if (canvas) {
        Promise.resolve().then(() => {
          if (canvas.isConnected && !document.activeElement?.closest('[role="dialog"]')) {
            canvas.focus({ preventScroll: true })
          }
        })
      }
    }
  }, [])

  const close = useCallback(() => {
    setVisible(false)
    restoreCanvasFocus()
  }, [restoreCanvasFocus])

  const handleClosed = useCallback(() => {
    restoreCanvasFocus()
  }, [restoreCanvasFocus])

  const handleReplace = useCallback((payload: MediaPickerReplacePayload) => {
    const activeTarget = target
    if (!activeTarget) return
    const main = useMainStore.getState()
    if (main.readOnly) return
    const store = useSlidesStore.getState()
    const slide = store.slides.find(item => item.id === activeTarget.slideId)
    if (!slide || slide.skeleton) return
    const current = slide.elements.find(item => item.id === activeTarget.elementId)
    if (!current || !isImageElement(current)) return
    if (!isElementSelectable(current, slide.elements, main.hiddenElementIdList)) return

    drainCommitQueue()
    void internMediaSrc(payload.src)
    cancelImageReplacement(slide.id, current.id)
    cancelPhotoFrameReplacement(slide.id, current.id)

    const { patch, removeProps } = buildManualImageReplacePatch(current, payload.src, {
      width: payload.width,
      height: payload.height,
    })

    if (removeProps.length) {
      store.removeElementProps({ id: current.id, slideId: slide.id, propName: removeProps })
    }
    recordManualImageReplacement(current)
    store.updateElement({ id: current.id, slideId: slide.id, props: patch })
    addHistorySnapshot()
  }, [target, addHistorySnapshot])

  useEffect(() => {
    const openReplaceDialog = (elementId: string) => {
      const main = useMainStore.getState()
      if (main.readOnly) return
      const slide = selectCurrentSlide(useSlidesStore.getState())
      if (!slide || slide.skeleton) return
      const element = slide.elements.find(item => item.id === elementId)
      if (!element || !isImageElement(element)) return
      if (!isElementSelectable(element, slide.elements, main.hiddenElementIdList)) return
      if (main.clipingImageElementId === element.id) main.setClipingImageElementId('')
      setTarget({ slideId: slide.id, elementId: element.id })
      setSessionId(id => id + 1)
      setVisible(true)
    }
    emitter.on(EmitterEvents.OPEN_IMAGE_REPLACE_DIALOG, openReplaceDialog)
    return () => {
      emitter.off(EmitterEvents.OPEN_IMAGE_REPLACE_DIALOG, openReplaceDialog)
    }
  }, [])

  return (
    <Modal
      visible={visible}
      onUpdateVisible={setVisible}
      onClosed={handleClosed}
      width={560}
      closeButton
      ariaLabelledBy={titleId}
    >
      {target ? (
        <MediaPicker
          key={sessionId}
          mode="replace"
          titleId={titleId}
          onReplace={handleReplace}
          onClose={close}
        />
      ) : null}
    </Modal>
  )
})

ImageReplaceDialog.displayName = 'ImageReplaceDialog'

export default ImageReplaceDialog
