import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import type { TableCell, TableCellStyle } from '@/types/slides'
import { flushCommitQueue } from '@/utils/commitQueue'
import { rememberTableStyleTarget, tableStyleTarget } from '@/utils/tableStyleTarget'

export { rememberTableStyleTarget, tableStyleTarget } from '@/utils/tableStyleTarget'

// oxlint-disable-next-line react/rules-of-hooks -- zustand snapshot helper, not a React hook
const history = useHistorySnapshot()

const cloneGrid = (data: TableCell[][]) => JSON.parse(JSON.stringify(data)) as TableCell[][]

const cellKey = (row: number, col: number) => `${row}_${col}`

/**
 * Persist any live cell draft, then patch cell styles on the store grid.
 * Style panels only pass the style fields — they must not clone table data.
 */
export function applyTableCellStyles(
  style: Partial<TableCellStyle>,
  options?: {
    elementId?: string
    cells?: string[]
    allCells?: boolean
    history?: boolean
  },
) {
  flushCommitQueue()
  const main = useMainStore.getState()
  const elementId = options?.elementId ?? main.handleElementId
  if (!elementId) return false
  const slide = selectCurrentSlide(useSlidesStore.getState())
  const el = slide?.elements.find(item => item.id === elementId)
  if (!el || el.type !== 'table') return false
  const cells = options?.allCells ? [] : tableStyleTarget(elementId, options?.cells ?? main.selectedTableCells)
  if (cells.length) rememberTableStyleTarget(elementId, cells)
  const data = cloneGrid(el.data)
  let wrote = false
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i].length; j++) {
      if (cells.length && !cells.includes(cellKey(i, j))) continue
      const prev = data[i][j].style || {}
      data[i][j].style = { ...prev, ...style }
      wrote = true
    }
  }
  if (!wrote) return false
  useSlidesStore.getState().updateElement({ id: elementId, props: { data } })
  if (options?.history !== false) history.addHistorySnapshot()
  return true
}
