import { useEffect, useRef } from 'react'
import { useMainStore } from '@/store'
import { imageSourceFromTransfer } from '@/utils/imageTransfer'
import { parseText2Paragraphs } from '@/utils/textParser'
import useCreateElement from '@/hooks/useCreateElement'
import usePasteDataTransfer from '@/hooks/usePasteDataTransfer'

export default (elementRef: { current: HTMLElement | null }, onFrameDrop?: (event: DragEvent) => boolean) => {
  const frameDropRef = useRef(onFrameDrop)
  frameDropRef.current = onFrameDrop
  const { createTextElement, createImageElement } = useCreateElement()
  const { pasteDataTransfer } = usePasteDataTransfer()
  const createImageElementRef = useRef(createImageElement)
  createImageElementRef.current = createImageElement
  const createTextElementRef = useRef(createTextElement)
  createTextElementRef.current = createTextElement
  const pasteDataTransferRef = useRef(pasteDataTransfer)
  pasteDataTransferRef.current = pasteDataTransfer

  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      if (!e.dataTransfer || e.dataTransfer.items.length === 0) return
      e.preventDefault()
      if (useMainStore.getState().readOnly) return
      if (frameDropRef.current?.(e)) return
      const { isFile, dataTransferFirstItem } = pasteDataTransferRef.current(e.dataTransfer)
      if (isFile) return
      const imageSrc = imageSourceFromTransfer(e.dataTransfer)
      if (imageSrc) {
        createImageElementRef.current(imageSrc)
        return
      }
      if (dataTransferFirstItem && dataTransferFirstItem.kind === 'string' && dataTransferFirstItem.type === 'text/plain') {
        dataTransferFirstItem.getAsString(text => {
          if (useMainStore.getState().disableHotkeys) return
          const string = parseText2Paragraphs(text)
          createTextElementRef.current({
            left: 0,
            top: 0,
            width: 600,
            height: 50,
          }, { content: string })
        })
      }
    }

    const el = elementRef.current
    el?.addEventListener('drop', handleDrop)
    const preventDrag = (event: DragEvent) => event.preventDefault()
    el?.addEventListener('dragover', preventDrag)

    return () => {
      el?.removeEventListener('drop', handleDrop)
      el?.removeEventListener('dragover', preventDrag)
    }
  }, [elementRef])
}
