import { useCallback, memo, useRef, useState, useEffect } from 'react'

import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement, PPTMermaidElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useHeldSlideElement } from '@/hooks/useHeldSlideElement'
import { LazyMermaidEditor } from '@/components/MermaidEditor/lazy'
import Modal from '@/components/Modal'

const isMermaidElement = (el: PPTElement): el is PPTMermaidElement => el.type === 'mermaid'

const MermaidEditorDialog = memo(({ request }: { request?: { seq: number; elementId: string } }) => {
  const { addHistorySnapshot } = useHistorySnapshot()
  const [visible, setVisible] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const [sessionKey, setSessionKey] = useState('')
  const handledSeqRef = useRef(0)
  const { element: editingMermaidElement, present } = useHeldSlideElement(editingElementId, visible, isMermaidElement)
  const modalVisible = visible && (!editingElementId || present)

  const openMermaidEditor = useCallback((elementId: string) => {
    const element = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === elementId)
    if (!element || element.type !== 'mermaid' || element.lock) return
    setEditingElementId(element.id)
    setSessionKey(element.id)
    setVisible(true)
  }, [])

  const updateMermaidCode = useCallback((code: string) => {
    const id = editingElementId
    if (!id) return
    const current = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === id)
    if (current?.type === 'mermaid' && code !== current.code) {
      useSlidesStore.getState().updateElement({
        id,
        props: { code },
      })
      addHistorySnapshot()
    }
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
      if (!el || !isMermaidElement(el) || el.lock) {
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
      emitter.on(EmitterEvents.OPEN_MERMAID_EDITOR, openMermaidEditor)
      return () => {
        emitter.off(EmitterEvents.OPEN_MERMAID_EDITOR, openMermaidEditor)
      }
    }
    if (request.seq === handledSeqRef.current) return
    handledSeqRef.current = request.seq
    openMermaidEditor(request.elementId)
  }, [request, openMermaidEditor])

  return (
    <Modal visible={modalVisible} onUpdateVisible={setVisible} onClosed={handleClosed} width={880}>
      {editingMermaidElement ? (
        <LazyMermaidEditor
          key={sessionKey}
          value={editingMermaidElement.code}
          onClose={close}
          onUpdate={updateMermaidCode}
        />
      ) : null}
    </Modal>
  )
})

export default MermaidEditorDialog
