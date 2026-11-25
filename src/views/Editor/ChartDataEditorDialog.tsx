import { useCallback, memo, useRef, useState, useEffect } from 'react'

import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { ChartData, ChartType, PPTChartElement, PPTElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useHeldSlideElement } from '@/hooks/useHeldSlideElement'
import ChartDataEditor from '@/components/ChartDataEditor'
import Modal from '@/components/Modal'

const isChartElement = (el: PPTElement): el is PPTChartElement => el.type === 'chart'

const ChartDataEditorDialog = memo(({ request }: { request?: { seq: number } }) => {
  const [visible, setVisible] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const [sessionId, setSessionId] = useState(0)
  const handledSeqRef = useRef(0)
  const { addHistorySnapshot } = useHistorySnapshot()
  const { element: editingChartElement, present } = useHeldSlideElement(editingElementId, visible, isChartElement)
  const modalVisible = visible && (!editingElementId || present)

  const openDataEditor = useCallback(() => {
    const handleElementId = useMainStore.getState().handleElementId
    const element = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === handleElementId)
    if (!element || element.type !== 'chart') return
    setEditingElementId(element.id)
    setSessionId(id => id + 1)
    setVisible(true)
  }, [])

  const updateData = useCallback((payload: { data: ChartData; type: ChartType }) => {
    const id = editingElementId
    if (!id) return
    useSlidesStore.getState().updateElement({
      id,
      props: { data: payload.data, chartType: payload.type },
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
      if (!el || !isChartElement(el)) {
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
      emitter.on(EmitterEvents.OPEN_CHART_DATA_EDITOR, openDataEditor)
      return () => {
        emitter.off(EmitterEvents.OPEN_CHART_DATA_EDITOR, openDataEditor)
      }
    }
    if (request.seq === handledSeqRef.current) return
    handledSeqRef.current = request.seq
    openDataEditor()
  }, [request, openDataEditor])

  return (
    <Modal visible={modalVisible} onUpdateVisible={setVisible} onClosed={handleClosed} width={640}>
      {editingChartElement ? (
        <ChartDataEditor
          key={sessionId}
          type={editingChartElement.chartType}
          data={editingChartElement.data}
          onClose={close}
          onSave={updateData}
        />
      ) : null}
    </Modal>
  )
})

export default ChartDataEditorDialog
