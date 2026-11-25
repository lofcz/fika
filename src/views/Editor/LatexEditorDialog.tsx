import { useCallback, memo, useRef, useState, useEffect } from 'react'

import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement, PPTLatexElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { latexPropsAfterEdit } from '@/utils/latex'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useHeldSlideElement } from '@/hooks/useHeldSlideElement'
import { LazyLaTeXEditor } from '@/components/LaTeXEditor/lazy'
import Modal from '@/components/Modal'

const isLatexElement = (el: PPTElement): el is PPTLatexElement => el.type === 'latex'

const LatexEditorDialog = memo(({ request }: { request?: { seq: number } }) => {
  const [visible, setVisible] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const [sessionKey, setSessionKey] = useState('')
  const handledSeqRef = useRef(0)
  const { addHistorySnapshot } = useHistorySnapshot()
  const { element: editingLatexElement, present } = useHeldSlideElement(editingElementId, visible, isLatexElement)
  const modalVisible = visible && (!editingElementId || present)

  const openLatexEditor = useCallback(() => {
    const handleElementId = useMainStore.getState().handleElementId
    const element = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === handleElementId)
    if (!element || element.type !== 'latex') return
    setEditingElementId(element.id)
    setSessionKey(element.id)
    setVisible(true)
  }, [])

  const updateLatexData = useCallback((data: { path: string; latex: string; w: number; h: number }) => {
    const current = editingLatexElement
    if (!current) return
    useSlidesStore.getState().updateElement({
      id: current.id,
      props: latexPropsAfterEdit(current, data),
    })
    addHistorySnapshot()
    setVisible(false)
  }, [editingLatexElement, addHistorySnapshot])

  const close = useCallback(() => setVisible(false), [])
  const handleClosed = useCallback(() => setEditingElementId(''), [])

  useEffect(() => {
    if (!visible || !editingElementId) return
    let active = true
    const closeIfMissing = () => {
      if (!active) return
      const slide = selectCurrentSlide(useSlidesStore.getState())
      const el = slide?.elements.find(item => item.id === editingElementId)
      if (!el || !isLatexElement(el)) {
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
      emitter.on(EmitterEvents.OPEN_LATEX_EDITOR, openLatexEditor)
      return () => {
        emitter.off(EmitterEvents.OPEN_LATEX_EDITOR, openLatexEditor)
      }
    }
    if (request.seq === handledSeqRef.current) return
    handledSeqRef.current = request.seq
    openLatexEditor()
  }, [request, openLatexEditor])

  return (
    <Modal visible={modalVisible} onUpdateVisible={setVisible} onClosed={handleClosed} width={520}>
      {editingLatexElement ? (
        <LazyLaTeXEditor
          key={sessionKey}
          value={editingLatexElement.latex}
          onClose={close}
          onUpdate={updateLatexData}
        />
      ) : null}
    </Modal>
  )
})

export default LatexEditorDialog
