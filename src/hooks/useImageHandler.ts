import { useMainStore, useSlidesStore, selectHandleElement, selectCurrentSlide } from '@/store'
import type { PPTImageElement } from '@/types/slides'
import { getImageDataURL, getImageSize } from '@/utils/image'
import { internMediaSrc } from '@/utils/mediaIntern'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import message from '@/utils/message'
import { getLL } from '@/i18n/getLL'
import { isElementSelectable } from '@/utils/selection'

const replacementRequests = new Map<string, symbol>()

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()

  const replaceImage = async (files: FileList) => {
    const imageFile = files[0]
    const imageElement = selectHandleElement(useMainStore.getState())
    const slide = selectCurrentSlide(useSlidesStore.getState())
    if (!imageFile || imageElement?.type !== 'image' || !slide
      || !isElementSelectable(imageElement, slide.elements, useMainStore.getState().hiddenElementIdList)) return
    const slideId = slide.id
    const imageElementId = imageElement.id
    const key = JSON.stringify([slideId, imageElementId])
    const request = Symbol()
    replacementRequests.set(key, request)

    try {
      const dataURL = await getImageDataURL(imageFile)
      // Warm the render alias, but persist the data URL: blob: URLs die with
      // the session and must never enter the document.
      void internMediaSrc(dataURL)
      const { width, height } = await getImageSize(dataURL)
      if (replacementRequests.get(key) !== request) return
      const store = useSlidesStore.getState()
      const currentSlide = store.slides.find(slide => slide.id === slideId)
      const current = currentSlide?.elements.find(el => el.id === imageElementId)
      if (current?.type !== 'image' || !currentSlide
        || !isElementSelectable(current, currentSlide.elements, useMainStore.getState().hiddenElementIdList)) return
      const h = current.height
      const w = width * (h / height)
      const props: Partial<PPTImageElement> = {
        src: dataURL,
        width: w,
        height: h,
        left: current.left + (current.width - w) / 2,
        top: current.top,
      }
      if (current.clip && current.clip.shape !== 'rect') {
        props.clip = { ...current.clip, range: [[0, 0], [100, 100]] }
      }
      else {
        store.removeElementProps({ id: imageElementId, slideId, propName: 'clip' })
      }
      store.updateElement({ id: imageElementId, slideId, props })
      addHistorySnapshot()
    }
    catch {
      if (replacementRequests.get(key) === request) message.error(getLL().common.fileParseError())
    }
    finally {
      if (replacementRequests.get(key) === request) replacementRequests.delete(key)
    }
  }
  return { replaceImage }
}
