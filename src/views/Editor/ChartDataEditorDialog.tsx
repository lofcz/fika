import { useCallback, memo, useState, useEffect, useRef } from 'react'

import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { ChartData, ChartType, PPTChartElement, PPTElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useHeldSlideElement } from '@/hooks/useHeldSlideElement'
import ChartDataEditor from '@/components/ChartDataEditor'
import Modal from '@/components/Modal'

const isChartElement = (el: PPTElement): el is PPTChartElement => el.type === 'chart'

const ChartDataEditorDialog = memo(() => {
  const slidesStore = useSlidesStore()
  const handleElementId = useMainStore(s => s.handleElementId)
  const [visible, setVisible] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const { addHistorySnapshot } = useHistorySnapshot()
  const { element: editingChartElement, present } = useHeldSlideElement(editingElementId, visible, isChartElement)

  useEffect(() => {
    if (!visible || !editingElementId || present) return
    setVisible(false)
    setEditingElementId('')
  }, [visible, editingElementId, present])

  const openDataEditor = useCallback(() => {
    const element = selectCurrentSlide(useSlidesStore.getState()).elements.find(item => item.id === handleElementId)
    if (!element || element.type !== 'chart') return
    setEditingElementId(element.id)
    setVisible(true)
  }, [handleElementId])

  const updateData = useCallback((payload: { data: ChartData; type: ChartType }) => {
    const id = editingElementId
    if (!id) return
    slidesStore.updateElement({
      id,
      props: { data: payload.data, chartType: payload.type },
    })
    addHistorySnapshot()
    setVisible(false)
  }, [editingElementId, slidesStore, addHistorySnapshot])

  const close = useCallback(() => setVisible(false), [])

  useEffect(() => {
    emitter.on(EmitterEvents.OPEN_CHART_DATA_EDITOR, openDataEditor)
    return () => {
      emitter.off(EmitterEvents.OPEN_CHART_DATA_EDITOR, openDataEditor)
    }
  }, [openDataEditor])

  const sessionIdRef = useRef(editingElementId)
  if (visible && editingElementId) sessionIdRef.current = editingElementId

  return (
    <Modal visible={visible} onUpdateVisible={setVisible} width={640}>
      {editingChartElement ? (
        <ChartDataEditor
          key={sessionIdRef.current}
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
