import { bindStyles } from '@/utils/cssm'
import styles from './VirtualSymbolGrid.module.scss'
const cx = bindStyles(styles)
import { useRef, useState, useLayoutEffect, type CSSProperties, type UIEvent, type MouseEvent } from 'react'

export type IVirtualSymbolGridProps = {
  items: string[]
  emoji?: boolean
  loading?: boolean
  className?: string
  style?: CSSProperties
  onSelect?: (value: string) => void
}

const GAP = 4
const OVERSCAN = 1
const MIN_CELL = 36
const MAX_COLS = 8

export default function VirtualSymbolGrid({
  items,
  emoji = false,
  loading = false,
  className,
  style,
  onSelect,
}: IVirtualSymbolGridProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [startRow, setStartRow] = useState(0)
  const [cols, setCols] = useState(MAX_COLS)
  const [cellSize, setCellSize] = useState(40)
  const [rowPool, setRowPool] = useState(6)
  const startRowRef = useRef(startRow)
  startRowRef.current = startRow
  const itemsRef = useRef(items)
  itemsRef.current = items

  const rowHeight = cellSize + GAP
  const rowCount = Math.ceil(items.length / cols) || 0
  const totalHeight = rowCount === 0 ? 0 : rowCount * cellSize + (rowCount - 1) * GAP
  const offsetY = startRow * rowHeight
  const startIndex = startRow * cols

  const windowStyle = {
    transform: `translate3d(0, ${offsetY}px, 0)`,
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gridAutoRows: `${cellSize}px`,
    gap: `${GAP}px`,
  }

  const pool = (() => {
    const size = rowPool * cols
    const start = startIndex
    const list = items
    const cells: { slot: number; index: number; item: string }[] = []
    for (let slot = 0; slot < size; slot++) {
      const index = start + slot
      cells.push({
        slot,
        index,
        item: list[index] ?? '',
      })
    }
    return cells
  })()

  const clampStartRow = (next: number, nextRowCount = rowCount, nextRowPool = rowPool) => {
    const maxStart = Math.max(0, nextRowCount - nextRowPool)
    if (next < 0) return 0
    if (next > maxStart) return maxStart
    return next
  }

  const syncStartRow = (scrollTop: number, nextRowHeight = rowHeight, nextRowCount = rowCount, nextRowPool = rowPool) => {
    const next = clampStartRow(Math.floor(scrollTop / nextRowHeight) - OVERSCAN, nextRowCount, nextRowPool)
    if (next !== startRowRef.current) setStartRow(next)
  }

  const measure = () => {
    const el = viewportRef.current
    if (!el) return

    const width = el.clientWidth
    const height = el.clientHeight
    if (width <= 0 || height <= 0) return

    const nextCols = Math.max(4, Math.min(MAX_COLS, Math.floor((width + GAP) / (MIN_CELL + GAP))))
    const nextCell = Math.floor((width - GAP * (nextCols - 1)) / nextCols)
    const nextRowHeight = nextCell + GAP
    const visibleRows = Math.max(1, Math.ceil(height / nextRowHeight))
    const nextPool = visibleRows + OVERSCAN * 2
    const nextRowCount = Math.ceil(itemsRef.current.length / nextCols) || 0

    setCols(nextCols)
    setCellSize(nextCell)
    setRowPool(nextPool)
    syncStartRow(el.scrollTop, nextRowHeight, nextRowCount, nextPool)
  }

  const frame = useRef(0)
  const pendingTop = useRef(0)
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    pendingTop.current = (event.target as HTMLElement).scrollTop
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      syncStartRow(pendingTop.current)
    })
  }

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (loading) return
    const cell = (event.target as HTMLElement | null)?.closest('[data-index]') as HTMLElement | null
    if (!cell) return
    const item = items[Number(cell.dataset.index)]
    if (item) onSelect?.(item)
  }

  useLayoutEffect(() => {
    setStartRow(0)
    if (viewportRef.current) viewportRef.current.scrollTop = 0
  }, [items])

  useLayoutEffect(() => {
    const resizeObserver = new ResizeObserver(() => measure())
    if (viewportRef.current) resizeObserver.observe(viewportRef.current)
    measure()
    return () => {
      resizeObserver.disconnect()
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  return (
    <div
      ref={viewportRef}
      className={cx('virtual-symbol-grid', className, { emoji })}
      style={style}
      onScroll={onScroll}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
    >
      <div className={cx('spacer')} style={{ height: `${totalHeight}px` }} />
      <div className={cx('window')} style={windowStyle}>
        {pool.map(cell => (
          <div
            key={cell.slot}
            className={cx('cell', { empty: !loading && !cell.item, skeleton: loading })}
            data-index={cell.index}
          >
            {loading ? '' : cell.item}
          </div>
        ))}
      </div>
    </div>
  )
}
