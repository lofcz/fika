import type { TableCell } from '@/types/slides'

export type TableCellDraft = {
  cellId: string
  row: number
  col: number
  text: string
}

export const locateTableCell = (grid: TableCell[][], draft: Pick<TableCellDraft, 'cellId' | 'row' | 'col'>): { row: number; col: number } | null => {
  if (draft.cellId) {
    for (let i = 0; i < grid.length; i++) {
      const row = grid[i]
      for (let j = 0; j < row.length; j++) {
        if (row[j].id === draft.cellId) return { row: i, col: j }
      }
    }
    return null
  }
  const cell = grid[draft.row]?.[draft.col]
  return cell ? { row: draft.row, col: draft.col } : null
}

export const replaceTableCellText = (grid: TableCell[][], draft: TableCellDraft): TableCell[][] | null => {
  const pos = locateTableCell(grid, draft)
  if (!pos) return null
  const cell = grid[pos.row][pos.col]
  if (cell.text === draft.text) return null
  return grid.map((row, i) => {
    if (i !== pos.row) return row
    return row.map((item, j) => (j === pos.col ? { ...item, text: draft.text } : item))
  })
}

export const growTable = (grid: TableCell[][], extraRows: number, extraCols: number, createCell: () => TableCell): TableCell[][] => {
  if (!extraRows && !extraCols) return grid
  const colCount = (grid[0]?.length ?? 0) + extraCols
  const next = grid.map(row => {
    if (!extraCols) return row
    const grown = row.slice()
    for (let i = 0; i < extraCols; i++) grown.push(createCell())
    return grown
  })
  for (let i = 0; i < extraRows; i++) {
    const row: TableCell[] = []
    for (let j = 0; j < colCount; j++) row.push(createCell())
    next.push(row)
  }
  return next
}

export const applyExcelPaste = (
  grid: TableCell[][],
  startRow: number,
  startCol: number,
  excel: string[][],
  createCell: () => TableCell,
): TableCell[][] => {
  const pasteRows = excel.length
  const pasteCols = excel[0]?.length ?? 0
  if (!pasteRows || !pasteCols) return grid
  const extraRows = Math.max(0, startRow + pasteRows - grid.length)
  const extraCols = Math.max(0, startCol + pasteCols - (grid[0]?.length ?? 0))
  const grown = growTable(grid, extraRows, extraCols, createCell)
  const lastRow = startRow + pasteRows
  const lastCol = startCol + pasteCols
  return grown.map((row, i) => {
    if (i < startRow || i >= lastRow) return row
    const excelRow = excel[i - startRow]
    return row.map((cell, j) => {
      if (j < startCol || j >= lastCol) return cell
      const text = excelRow[j - startCol] ?? ''
      return cell.text === text ? cell : { ...cell, text }
    })
  })
}

// Extend only merges that cross the insertion boundary. A merge beginning
// at that boundary moves with its original cells without changing its span.
export const insertRowIntoGrid = (grid: TableCell[][], rowIndex: number, createCell: () => TableCell): TableCell[][] => {
  const next = grid.map((row, i) => row.map(cell =>
    i < rowIndex && i + cell.rowspan > rowIndex ? { ...cell, rowspan: cell.rowspan + 1 } : cell,
  ))
  next.splice(rowIndex, 0, Array.from({ length: grid[0]?.length ?? 0 }, createCell))
  return next
}

export const insertColIntoGrid = (grid: TableCell[][], colIndex: number, createCell: () => TableCell): TableCell[][] => {
  return grid.map(row => {
    const next = row.map((cell, j) =>
      j < colIndex && j + cell.colspan > colIndex ? { ...cell, colspan: cell.colspan + 1 } : cell,
    )
    next.splice(colIndex, 0, createCell())
    return next
  })
}

export const deleteTableGridLine = (grid: TableCell[][], index: number, axis: 'row' | 'col'): TableCell[][] => {
  const length = axis === 'row' ? grid.length : grid[0]?.length ?? 0
  if (length <= 1 || index < 0 || index >= length) return grid
  const next = grid.map(row => row.slice())
  const covered = new Set<string>()
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (covered.has(`${r}_${c}`)) continue
      const cell = grid[r][c]
      for (let y = r; y < r + cell.rowspan; y++) {
        for (let x = c; x < c + cell.colspan; x++) covered.add(`${y}_${x}`)
      }
      const start = axis === 'row' ? r : c
      const span = axis === 'row' ? cell.rowspan : cell.colspan
      if (start > index || start + span <= index || span === 1) continue
      const reduced = axis === 'row' ? { ...cell, rowspan: span - 1 } : { ...cell, colspan: span - 1 }
      // If the anchor is deleted, carry its content and styling into the
      // surviving portion before removing the requested grid line.
      const targetRow = r + (axis === 'row' && start === index ? 1 : 0)
      const targetCol = c + (axis === 'col' && start === index ? 1 : 0)
      next[targetRow][targetCol] = reduced
    }
  }
  if (axis === 'row') next.splice(index, 1)
  else for (const row of next) row.splice(index, 1)
  return next
}

export const tableSelectionBounds = (grid: TableCell[][], start: number[], end: number[]) => {
  let top = Math.min(start[0], end[0])
  let left = Math.min(start[1], end[1])
  let bottom = Math.max(start[0], end[0])
  let right = Math.max(start[1], end[1])
  // Expanding to include one merge can touch another merge. Continue until
  // every intersected region is entirely inside the selection.
  let expanded = true
  while (expanded) {
    expanded = false
    grid.forEach((row, r) => row.forEach((cell, c) => {
      const cellBottom = r + cell.rowspan - 1
      const cellRight = c + cell.colspan - 1
      if (r > bottom || cellBottom < top || c > right || cellRight < left) return
      if (r < top || c < left || cellBottom > bottom || cellRight > right) {
        top = Math.min(top, r)
        left = Math.min(left, c)
        bottom = Math.max(bottom, cellBottom)
        right = Math.max(right, cellRight)
        expanded = true
      }
    }))
  }
  return { top, left, bottom, right }
}
