import { useEffect, useRef } from 'react'
import { useMainStore } from '@/store'
import { parseText2Paragraphs } from '@/utils/textParser'
import useCreateElement from '@/hooks/useCreateElement'
import usePasteDataTransfer from '@/hooks/usePasteDataTransfer'

export default (elementRef: { current: HTMLElement | null }) => {
  const { createTextElement } = useCreateElement()
  const { pasteDataTransfer } = usePasteDataTransfer()
  const createTextElementRef = useRef(createTextElement)
  createTextElementRef.current = createTextElement
  const pasteDataTransferRef = useRef(pasteDataTransfer)
  pasteDataTransferRef.current = pasteDataTransfer

  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      if (!e.dataTransfer || e.dataTransfer.items.length === 0) return
      const { isFile, dataTransferFirstItem } = pasteDataTransferRef.current(e.dataTransfer)
      if (isFile) return
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
    document.ondragleave = ev => ev.preventDefault()
    document.ondrop = ev => ev.preventDefault()
    document.ondragenter = ev => ev.preventDefault()
    document.ondragover = ev => ev.preventDefault()

    return () => {
      el?.removeEventListener('drop', handleDrop)
      document.ondragleave = null
      document.ondrop = null
      document.ondragenter = null
      document.ondragover = null
    }
  }, [elementRef])
}
