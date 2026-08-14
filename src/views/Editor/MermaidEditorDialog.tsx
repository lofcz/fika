import { useCallback, memo, useState, useEffect, useRef } from 'react'

import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement, PPTMermaidElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useHeldSlideElement } from '@/hooks/useHeldSlideElement'
import { LazyMermaidEditor } from '@/components/MermaidEditor/lazy'
import Modal from '@/components/Modal'

const isMermaidElement = (el: PPTElement): el is PPTMermaidElement => el.type === 'mermaid'

const MermaidEditorDialog = memo(() => {
  const slidesStore = useSlidesStore()
  const { addHistorySnapshot } = useHistorySnapshot()
  const [visible, setVisible] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const { element: editingMermaidElement, present } = useHeldSlideElement(editingElementId, visible, isMermaidElement)

  useEffect(() => {
    if (!visible || !editingElementId || present) return
    setVisible(false)
    setEditingElementId('')
  }, [visible, editingElementId, present])

  const openMermaidEditor = useCallback((elementId: string) => {
    const element = selectCurrentSlide(useSlidesStore.getState()).elements.find(item => item.id === elementId)
    if (!element || element.type !== 'mermaid' || element.lock) return
    setEditingElementId(element.id)
    setVisible(true)
  }, [])

  const updateMermaidCode = useCallback((code: string) => {
    const id = editingElementId
    if (!id) return
    const current = selectCurrentSlide(useSlidesStore.getState()).elements.find(item => item.id === id)
    if (current?.type === 'mermaid' && code !== current.code) {
      slidesStore.updateElement({
        id,
        props: { code },
      })
      addHistorySnapshot()
    }
    setVisible(false)
  }, [editingElementId, slidesStore, addHistorySnapshot])

  const close = useCallback(() => setVisible(false), [])

  useEffect(() => {
    emitter.on(EmitterEvents.OPEN_MERMAID_EDITOR, openMermaidEditor)
    return () => {
      emitter.off(EmitterEvents.OPEN_MERMAID_EDITOR, openMermaidEditor)
    }
  }, [openMermaidEditor])

  const sessionIdRef = useRef(editingElementId)
  if (visible && editingElementId) sessionIdRef.current = editingElementId

  return (
    <Modal visible={visible} onUpdateVisible={setVisible} width={880}>
      {editingMermaidElement ? (
        <LazyMermaidEditor
          key={sessionIdRef.current}
          value={editingMermaidElement.code}
          onClose={close}
          onUpdate={updateMermaidCode}
        />
      ) : null}
    </Modal>
  )
})

export default MermaidEditorDialog
