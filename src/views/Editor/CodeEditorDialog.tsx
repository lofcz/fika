import { useCallback, memo, useRef, useState, useEffect } from 'react'

import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTCodeElement, PPTElement } from '@/types/slides'
import type { CodeEditorPayload } from '@/configs/code'
import { LazyCodeEditor } from '@/components/CodeEditor/lazy'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useHeldSlideElement } from '@/hooks/useHeldSlideElement'
import Modal from '@/components/Modal'

const isCodeElement = (el: PPTElement): el is PPTCodeElement => el.type === 'code'

const CodeEditorDialog = memo(({ request }: { request?: { seq: number; elementId: string } }) => {
  const { addHistorySnapshot } = useHistorySnapshot()
  const [visible, setVisible] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const [sessionKey, setSessionKey] = useState('')
  const handledSeqRef = useRef(0)
  const { element: editingCodeElement, present } = useHeldSlideElement(editingElementId, visible, isCodeElement)
  const modalVisible = visible && (!editingElementId || present)

  const openCodeEditor = useCallback((elementId: string) => {
    const element = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === elementId)
    if (!element || element.type !== 'code' || element.lock) return
    setEditingElementId(element.id)
    setSessionKey(element.id)
    setVisible(true)
  }, [])

  const updateCode = useCallback((payload: CodeEditorPayload) => {
    const id = editingElementId
    if (!id) return
    useSlidesStore.getState().updateElement({
      id,
      props: payload,
    })
    addHistorySnapshot()
    setVisible(false)
  }, [editingElementId, addHistorySnapshot])

  const close = useCallback(() => setVisible(false), [])
  const handleClosed = useCallback(() => setEditingElementId(''), [])

  useEffect(() => {
    if (!visible || !editingElementId) return
    let active = true
    const closeIfMissing = () => {
      if (!active) return
      const slide = selectCurrentSlide(useSlidesStore.getState())
      const el = slide?.elements.find(item => item.id === editingElementId)
      if (!el || !isCodeElement(el) || el.lock) {
        setVisible(false)
        setEditingElementId('')
      }
    }
    const unsub = useSlidesStore.subscribe(closeIfMissing)
    queueMicrotask(closeIfMissing)
    return () => {
      active = false
      unsub()
    }
  }, [visible, editingElementId])

  useEffect(() => {
    if (!request) {
      emitter.on(EmitterEvents.OPEN_CODE_EDITOR, openCodeEditor)
      return () => {
        emitter.off(EmitterEvents.OPEN_CODE_EDITOR, openCodeEditor)
      }
    }
    if (request.seq === handledSeqRef.current) return
    handledSeqRef.current = request.seq
    openCodeEditor(request.elementId)
  }, [request, openCodeEditor])

  return (
    <Modal visible={modalVisible} onUpdateVisible={setVisible} onClosed={handleClosed} width={880}>
      {editingCodeElement ? (
        <LazyCodeEditor
          key={sessionKey}
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
