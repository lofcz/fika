import { useMemo, type MouseEventHandler, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type ItemRender = (args: { element: any; index: number }) => ReactNode

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
}: {
  modelValue?: any[]
  list?: any[]
  itemKey?: string | ((item: any) => string)
  item?: ItemRender
  children?: ReactNode
  className?: string
  animation?: number
  scroll?: boolean
  scrollSensitivity?: number
  delayOnTouchOnly?: boolean
  delay?: number
  disabled?: boolean
  handle?: string
  onContextMenu?: MouseEventHandler<HTMLDivElement>
  onEnd?: (event: { oldIndex: number; newIndex: number }) => void
  onUpdateModelValue?: (next: any[]) => void
}) {
  const items = modelValue ?? list ?? []
  const keyOf = (entry: any, index: number) => {
    if (typeof itemKey === 'function') return String(itemKey(entry))
    return String(entry?.[itemKey] ?? index)
  }
  const ids = useMemo(() => items.map((entry, index) => keyOf(entry, index)), [items, itemKey])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onEnd?.({ oldIndex, newIndex })
    if (onUpdateModelValue) onUpdateModelValue(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className} onContextMenu={onContextMenu}>
          {item
            ? items.map((element, index) => (
              <SortableItem key={ids[index]} id={ids[index]} disabled={!!disabled} handle={handle}>
                {item({ element, index })}
              </SortableItem>
            ))
            : children}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({ id, children, disabled, handle }: { id: string; children: ReactNode; disabled?: boolean; handle?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled })
  const filteredListeners = handle
    ? {
      onPointerDown(event: React.PointerEvent) {
        if ((event.target as Element).closest(handle)) listeners?.onPointerDown?.(event as any)
      },
    }
    : listeners
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...filteredListeners}
    >
      {children}
    </div>
  )
}
