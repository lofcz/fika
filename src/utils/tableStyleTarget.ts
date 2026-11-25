import type { TableCell } from '@/types/slides'

type RememberedTarget = {
  cells: string[]
  cellIds?: string[]
}

const MAX_STYLE_TARGETS = 256
const lastStyleTarget = new Map<string, RememberedTarget>()

/** Keep the last in-cell style target so Present/deselect cannot widen the next fill. */
export function rememberTableStyleTarget(elementId: string, cells: string[], cellIds?: string[]) {
  if (!elementId || !cells.length) return
  lastStyleTarget.delete(elementId)
  if (lastStyleTarget.size >= MAX_STYLE_TARGETS) {
    const oldest = lastStyleTarget.keys().next().value
    if (oldest !== undefined) lastStyleTarget.delete(oldest)
  }
  lastStyleTarget.set(elementId, {
    cells: [...cells],
    ...(cellIds?.length ? { cellIds: [...cellIds] } : {}),
  })
}

export function forgetTableStyleTarget(elementId: string) {
  if (!elementId) return
  lastStyleTarget.delete(elementId)
}

export function tableStyleTarget(elementId: string, cells?: string[]) {
  if (cells?.length) return cells
  return lastStyleTarget.get(elementId)?.cells ?? []
}

/**
 * Pure resolver mapping a remembered table style target onto the live grid.
 * - Returns `string[]` (non-empty) when specific cells are targeted.
 * - Returns `[]` when no specific cell was ever remembered (style applies to whole table).
 * - Returns `null` when all remembered cell IDs have been deleted from `data`
 *   so mutators skip styling cleanly (and may prune via `forgetTableStyleTarget`).
 */
export function resolveTableStyleTarget(
  elementId: string,
  data: TableCell[][],
  cells?: string[],
): string[] | null {
  if (cells?.length) return cells
  const saved = lastStyleTarget.get(elementId)
  if (!saved) return []
  if (saved.cellIds?.length) {
    const idSet = new Set(saved.cellIds)
    const matched: string[] = []
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      for (let j = 0; j < row.length; j++) {
        if (idSet.has(row[j].id)) matched.push(`${i}_${j}`)
      }
    }
    return matched.length ? matched : null
  }
  return saved.cells
}

export function collectTableCellIds(data: TableCell[][], cells: string[]): string[] {
  const ids: string[] = []
  for (const key of cells) {
    const [r, c] = key.split('_').map(Number)
    const id = data[r]?.[c]?.id
    if (id) ids.push(id)
  }
  return ids
}
