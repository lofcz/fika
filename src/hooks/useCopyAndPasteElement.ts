import { useMainStore, selectActiveElementList } from '@/store'
import { copyText, readClipboard } from '@/utils/clipboard'
import { encrypt } from '@/utils/crypto'
import message from '@/utils/message'
import usePasteTextClipboardData from '@/hooks/usePasteTextClipboardData'
import useDeleteElement from './useDeleteElement'

export default () => {
  const { pasteTextClipboardData } = usePasteTextClipboardData()
  const { deleteElement } = useDeleteElement()

  const copyElement = () => {
    const { activeElementIdList, setEditorareaFocus } = useMainStore.getState()
    if (!activeElementIdList.length) return
    const activeElementList = selectActiveElementList(useMainStore.getState())
    const text = encrypt(JSON.stringify({
      type: 'elements',
      data: activeElementList,
    }))
    copyText(text).then(() => {
      setEditorareaFocus(true)
    })
  }

  const cutElement = () => {
    copyElement()
    deleteElement()
  }

  const pasteElement = () => {
    readClipboard().then(text => {
      pasteTextClipboardData(text)
    }).catch(err => message.warning(err))
  }

  const quickCopyElement = () => {
    copyElement()
    pasteElement()
  }

  return {
    copyElement,
    cutElement,
    pasteElement,
    quickCopyElement,
  }
}
