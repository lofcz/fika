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
      const text = excelRow[j - startCol]
      return cell.text === text ? cell : { ...cell, text }
    })
  })
}

export const insertColIntoGrid = (grid: TableCell[][], colIndex: number, createCell: () => TableCell): TableCell[][] => {
  return grid.map(row => {
    const next = row.slice()
    next.splice(colIndex, 0, createCell())
    return next
  })
}
