import { frameDescendantIds } from '@/utils/nestedFrames'
import { useMainStore, useSlidesStore } from '@/store'
import { getLL } from '@/i18n/getLL'
import { copyText, readClipboard } from '@/utils/clipboard'
import { encrypt } from '@/utils/crypto'
import message from '@/utils/message'
import usePasteTextClipboardData from '@/hooks/usePasteTextClipboardData'
import useDeleteElement from './useDeleteElement'

export default () => {
  const { pasteTextClipboardData } = usePasteTextClipboardData()
  const { deleteElement } = useDeleteElement()

  const copyElement = async () => {
    const { activeElementIdList, setEditorareaFocus } = useMainStore.getState()
    if (!activeElementIdList.length) return false
    const state = useSlidesStore.getState()
    const elements = state.slides[state.slideIndex]?.elements || []
    const ids = frameDescendantIds(elements, activeElementIdList)
    const activeElementList = elements.filter(e => ids.includes(e.id))
    const text = encrypt(JSON.stringify({
      type: 'elements',
      data: activeElementList,
    }))
    try {
      await copyText(text)
      setEditorareaFocus(true)
      return true
    } catch {
      message.warning(getLL().common.clipboard.unsupportedOrDenied())
      return false
    }
  }

  const cutElement = async () => {
    if (await copyElement()) deleteElement()
  }

  const pasteElement = () => {
    readClipboard().then(text => {
      pasteTextClipboardData(text)
    }).catch(err => message.warning(err))
  }

  const quickCopyElement = async () => {
    if (await copyElement()) pasteElement()
  }

  return {
    copyElement,
    cutElement,
    pasteElement,
    quickCopyElement,
  }
}
