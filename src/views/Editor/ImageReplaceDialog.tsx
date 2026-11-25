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

const ImageReplaceDialog = memo(({ request }: { request?: { seq: number; elementId: string } }) => {
  const { addHistorySnapshot } = useHistorySnapshot()
  const readOnly = useMainStore(s => s.readOnly)
  const [visible, setVisible] = useState(false)
  const [target, setTarget] = useState<{ slideId: string; elementId: string } | null>(null)
  const [sessionId, setSessionId] = useState(0)
  const titleId = useId()
  const hotkeysDisabledByDialogRef = useRef(false)
  const handledSeqRef = useRef(0)

  const targetPresent = useSlidesStore(s => {
    if (!target) return false
    const slide = s.slides.find(item => item.id === target.slideId)
    if (!slide || slide.skeleton) return false
    const el = slide.elements.find(item => item.id === target.elementId)
    if (!el || !isImageElement(el)) return false
    return isElementSelectable(el, slide.elements, useMainStore.getState().hiddenElementIdList)
  })
  const modalVisible = visible && !readOnly && !!target && targetPresent

  useEffect(() => {
    const main = useMainStore.getState()
    if (modalVisible) {
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
  }, [modalVisible])

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
    setTarget(null)
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
    if (!visible || !target) return
    let active = true
    const closeIfInvalid = () => {
      if (!active) return
      const main = useMainStore.getState()
      if (main.readOnly) {
        setVisible(false)
        setTarget(null)
        return
      }
      const slide = useSlidesStore.getState().slides.find(item => item.id === target.slideId)
      const el = slide && !slide.skeleton
        ? slide.elements.find(item => item.id === target.elementId)
        : undefined
      if (!el || !isImageElement(el) || !isElementSelectable(el, slide!.elements, main.hiddenElementIdList)) {
        setVisible(false)
        setTarget(null)
      }
    }
    const unsubSlides = useSlidesStore.subscribe(closeIfInvalid)
    const unsubMain = useMainStore.subscribe(closeIfInvalid)
    queueMicrotask(closeIfInvalid)
    return () => {
      active = false
      unsubSlides()
      unsubMain()
    }
  }, [visible, target])

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
    if (!request) {
      emitter.on(EmitterEvents.OPEN_IMAGE_REPLACE_DIALOG, openReplaceDialog)
      return () => {
        emitter.off(EmitterEvents.OPEN_IMAGE_REPLACE_DIALOG, openReplaceDialog)
      }
    }
    if (request.seq === handledSeqRef.current) return
    handledSeqRef.current = request.seq
    openReplaceDialog(request.elementId)
  }, [request])

  return (
    <Modal
      visible={modalVisible}
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
