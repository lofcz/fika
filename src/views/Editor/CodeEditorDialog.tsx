import { useCallback, memo, useState, useEffect, useRef } from 'react'

import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTCodeElement, PPTElement } from '@/types/slides'
import type { CodeEditorPayload } from '@/configs/code'
import { LazyCodeEditor } from '@/components/CodeEditor/lazy'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useHeldSlideElement } from '@/hooks/useHeldSlideElement'
import Modal from '@/components/Modal'

const isCodeElement = (el: PPTElement): el is PPTCodeElement => el.type === 'code'

const CodeEditorDialog = memo(() => {
  const slidesStore = useSlidesStore()
  const { addHistorySnapshot } = useHistorySnapshot()
  const [visible, setVisible] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const { element: editingCodeElement, present } = useHeldSlideElement(editingElementId, visible, isCodeElement)

  useEffect(() => {
    if (!visible || !editingElementId || present) return
    setVisible(false)
    setEditingElementId('')
  }, [visible, editingElementId, present])

  const updateCode = useCallback((payload: CodeEditorPayload) => {
    const id = editingElementId
    if (!id) return
    slidesStore.updateElement({
      id,
      props: payload,
    })
    addHistorySnapshot()
    setVisible(false)
  }, [editingElementId, slidesStore, addHistorySnapshot])

  const close = useCallback(() => setVisible(false), [])

  useEffect(() => {
    const openCodeEditor = (elementId: string) => {
      const element = selectCurrentSlide(useSlidesStore.getState()).elements.find(item => item.id === elementId)
      if (!element || element.type !== 'code' || element.lock) return
      setEditingElementId(element.id)
      setVisible(true)
    }
    emitter.on(EmitterEvents.OPEN_CODE_EDITOR, openCodeEditor)
    return () => {
      emitter.off(EmitterEvents.OPEN_CODE_EDITOR, openCodeEditor)
    }
  }, [])

  const sessionIdRef = useRef(editingElementId)
  if (visible && editingElementId) sessionIdRef.current = editingElementId

  return (
    <Modal visible={visible} onUpdateVisible={setVisible} width={880}>
      {editingCodeElement ? (
        <LazyCodeEditor
          key={sessionIdRef.current}
          code={editingCodeElement.code}
          language={editingCodeElement.language}
          theme={editingCodeElement.theme}
          fontSize={editingCodeElement.fontSize}
          showLineNumbers={editingCodeElement.showLineNumbers}
          onClose={close}
          onUpdate={updateCode}
        />
      ) : null}
    </Modal>
  )
})

export default CodeEditorDialog
