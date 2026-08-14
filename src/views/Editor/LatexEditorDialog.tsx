import { useCallback, memo, useState, useEffect, useRef } from 'react'

import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement, PPTLatexElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useHeldSlideElement } from '@/hooks/useHeldSlideElement'
import { LazyLaTeXEditor } from '@/components/LaTeXEditor/lazy'
import Modal from '@/components/Modal'

const isLatexElement = (el: PPTElement): el is PPTLatexElement => el.type === 'latex'

const LatexEditorDialog = memo(() => {
  const slidesStore = useSlidesStore()
  const handleElementId = useMainStore(s => s.handleElementId)
  const [visible, setVisible] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const { addHistorySnapshot } = useHistorySnapshot()
  const { element: editingLatexElement, present } = useHeldSlideElement(editingElementId, visible, isLatexElement)

  useEffect(() => {
    if (!visible || !editingElementId || present) return
    setVisible(false)
    setEditingElementId('')
  }, [visible, editingElementId, present])

  const openLatexEditor = useCallback(() => {
    const element = selectCurrentSlide(useSlidesStore.getState()).elements.find(item => item.id === handleElementId)
    if (!element || element.type !== 'latex') return
    setEditingElementId(element.id)
    setVisible(true)
  }, [handleElementId])

  const updateLatexData = useCallback((data: { path: string; latex: string; w: number; h: number }) => {
    const id = editingElementId
    if (!id) return
    slidesStore.updateElement({
      id,
      props: {
        path: data.path,
        latex: data.latex,
        width: data.w,
        height: data.h,
        viewBox: [data.w, data.h],
      },
    })
    addHistorySnapshot()
    setVisible(false)
  }, [editingElementId, slidesStore, addHistorySnapshot])

  const close = useCallback(() => setVisible(false), [])

  useEffect(() => {
    emitter.on(EmitterEvents.OPEN_LATEX_EDITOR, openLatexEditor)
    return () => {
      emitter.off(EmitterEvents.OPEN_LATEX_EDITOR, openLatexEditor)
    }
  }, [openLatexEditor])

  const sessionIdRef = useRef(editingElementId)
  if (visible && editingElementId) sessionIdRef.current = editingElementId

  return (
    <Modal visible={visible} onUpdateVisible={setVisible} width={520}>
      {editingLatexElement ? (
        <LazyLaTeXEditor
          key={sessionIdRef.current}
          value={editingLatexElement.latex}
          onClose={close}
          onUpdate={updateLatexData}
        />
      ) : null}
    </Modal>
  )
})

export default LatexEditorDialog
