import { useEffect, useRef } from 'react'
import { useMainStore } from '@/store'
import { isAppOwnedEvent } from '@/utils/portal'
import usePasteTextClipboardData from './usePasteTextClipboardData'
import usePasteDataTransfer from './usePasteDataTransfer'

export default () => {
  const { pasteTextClipboardData } = usePasteTextClipboardData()
  const { pasteDataTransfer } = usePasteDataTransfer()
  const pasteTextClipboardDataRef = useRef(pasteTextClipboardData)
  const pasteDataTransferRef = useRef(pasteDataTransfer)
  pasteTextClipboardDataRef.current = pasteTextClipboardData
  pasteDataTransferRef.current = pasteDataTransfer

  useEffect(() => {
    /**
     * Clipboard paste listener
     */
    const pasteListener = (e: ClipboardEvent) => {
      if (!isAppOwnedEvent(e)) return
      const { editorAreaFocus, thumbnailsFocus, disableHotkeys } = useMainStore.getState()
      if (!editorAreaFocus && !thumbnailsFocus) return
      if (disableHotkeys) return

      if (!e.clipboardData) return

      const { isFile, dataTransferFirstItem } = pasteDataTransferRef.current(e.clipboardData)
      if (isFile) return

      if (dataTransferFirstItem && dataTransferFirstItem.kind === 'string' && dataTransferFirstItem.type === 'text/plain') {
        dataTransferFirstItem.getAsString(text => pasteTextClipboardDataRef.current(text))
      }
    }

    document.addEventListener('paste', pasteListener)
    return () => {
      document.removeEventListener('paste', pasteListener)
    }
  }, [])
}
