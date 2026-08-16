import { useEffect, useMemo, useRef, useState, type MouseEventHandler, type PointerEvent, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSlidesStore } from '@/store'
import LiveSlideThumb from '@/views/components/ThumbnailSlide/LiveSlideThumb'
import type { ThumbnailVirtualizerApi } from '@/views/Editor/Thumbnails/useThumbnailVirtualizer'
import {
  clampScrollTop,
  mergeActiveVirtualRow,
  overlayFromNode,
  restrictDragToVertical,
  virtualRowBox,
  wheelDeltaPx,
  type OverlayPaint,
} from './draggableLayout'

type ItemRender = (args: { element: any; index: number }) => ReactNode
type OverlayRender = (paint: OverlayPaint) => ReactNode
type VirtualizerApi = ThumbnailVirtualizerApi
type VirtualRow = VirtualizerApi['virtualItems'][number]

const skipLayoutAnimation = () => false

function SlideOverlayLive({ paint }: { paint: OverlayPaint }) {
  const slide = useSlidesStore(s => s.slides.find(item => item.id === paint.slideId))
  return (
    <div
      data-slide-drag-overlay={paint.slideId}
      style={{ width: paint.width, height: paint.height, position: 'relative' }}
    >
      {slide ? (
        <div style={{
          position: 'absolute',
          left: paint.thumbX,
          top: paint.thumbY,
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.12), 0 10px 28px rgba(15, 23, 42, 0.18)',
          background: '#fff',
        }}>
          <LiveSlideThumb slide={slide} width={paint.thumbW} />
        </div>
      ) : null}
    </div>
  )
}

/** Drag ghost for slide rails: the live slide DOM at thumb size. */
export const slideDragOverlay: OverlayRender = paint => <SlideOverlayLive paint={paint} />

export default function Draggable({
  modelValue,
  list,
  itemKey = 'id',
  item,
  children,
  className,
  onEnd,
  onUpdateModelValue,
  onContextMenu,
  disabled,
  handle,
  scrollRef,
  virtualItems,
  virtualizer,
  totalSize,
  overlayRender,
}: {
  modelValue?: any[]
  list?: any[]
  itemKey?: string | ((item: any) => string)
  item?: ItemRender
  children?: ReactNode
  className?: string
  onEnd?: (event: { oldIndex: number; newIndex: number }) => void
  onUpdateModelValue?: (next: any[]) => void
  onContextMenu?: MouseEventHandler<HTMLDivElement>
  disabled?: boolean
  handle?: string
  scrollRef?: VirtualizerApi['scrollRef']
  virtualItems?: VirtualizerApi['virtualItems']
  virtualizer?: VirtualizerApi['virtualizer']
  totalSize?: number
  overlayRender?: OverlayRender
}) {
  const items = modelValue ?? list ?? []
  const ids = useMemo(
    () => items.map((entry, index) => {
      if (typeof itemKey === 'function') return String(itemKey(entry))
      return String(entry?.[itemKey] ?? index)
    }),
    [items, itemKey],
  )
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<OverlayPaint | null>(null)

  const clearDrag = () => {
    setActiveId(null)
    setOverlay(null)
  }

  useEffect(() => {
    if (!activeId) return
    const scroller = scrollRef?.current
    if (!scroller) return
    const onWheel = (event: WheelEvent) => {
      if (scroller.contains(event.target as Node)) return
      const raw = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const next = clampScrollTop(
        scroller.scrollTop,
        wheelDeltaPx(raw, event.deltaMode, scroller.clientHeight),
        scroller.scrollHeight - scroller.clientHeight,
      )
      event.preventDefault()
      if (next !== scroller.scrollTop) scroller.scrollTop = next
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [activeId, scrollRef])

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveId(id)
    if (!overlayRender) return
    const node = (event.activatorEvent.target as HTMLElement | null)?.closest<HTMLElement>('[data-sortable-id]')
    if (node) setOverlay(overlayFromNode(node, id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    clearDrag()
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onEnd?.({ oldIndex, newIndex })
    if (onUpdateModelValue) onUpdateModelValue(arrayMove(items, oldIndex, newIndex))
  }

  const activeIndex = activeId ? ids.indexOf(activeId) : -1
  const rows = virtualItems
    ? mergeActiveVirtualRow(
      virtualItems,
      activeIndex,
      activeIndex >= 0 ? virtualizer?.measurementsCache[activeIndex] : undefined,
    )
    : null
  const mounted = rows
    ? rows.map(row => ({ element: items[row.index], index: row.index, row }))
    : items.map((element, index) => ({ element, index, row: null as VirtualRow | null }))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={virtualItems ? [restrictDragToVertical] : undefined}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDrag}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={scrollRef} className={className} onContextMenu={onContextMenu}>
          {item ? (
            <div style={virtualItems ? { height: totalSize, position: 'relative' } : undefined}>
              {mounted.map(({ element, index, row }) => (
                element ? (
                  <SortableItem
                    key={ids[index]}
                    id={ids[index]}
                    disabled={!!disabled}
                    handle={handle}
                    row={row}
                    hideWhileDragging={!!overlay && activeId === ids[index]}
                  >
                    {item({ element, index })}
                  </SortableItem>
                ) : null
              ))}
            </div>
          ) : children}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none', zIndex: 40 }}>
        {overlay && overlayRender ? overlayRender(overlay) : null}
      </DragOverlay>
    </DndContext>
  )
}

function SortableItem({
  id,
  children,
  disabled,
  handle,
  row,
  hideWhileDragging,
}: {
  id: string
  children: ReactNode
  disabled?: boolean
  handle?: string
  row: VirtualRow | null
  hideWhileDragging?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    animateLayoutChanges: row ? skipLayoutAnimation : undefined,
  })
  const box = row ? virtualRowBox(row, transform) : null
  const filteredListeners = handle
    ? {
      onPointerDown(event: PointerEvent) {
        if ((event.target as Element).closest(handle)) listeners?.onPointerDown?.(event as any)
      },
    }
    : listeners
  return (
    <div
      ref={setNodeRef}
      data-sortable-id={id}
      style={{
        position: box ? 'absolute' : undefined,
        top: box ? box.top : undefined,
        left: box ? 0 : undefined,
        width: box ? '100%' : undefined,
        height: box ? box.height : undefined,
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: hideWhileDragging && isDragging ? 0 : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
      {...attributes}
      {...filteredListeners}
    >
      {children}
    </div>
  )
}
