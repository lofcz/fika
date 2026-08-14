import type { PPTElementOutline, PPTTableElement, TableCell, TableCellStyle, TableTheme } from '@/types/slides'

const valueEqual = (a: unknown, b: unknown) => {
  if (a === b) return true
  if (a == null || b == null) return a == b
  if (typeof a !== 'object' || typeof b !== 'object') return false
  const keysA = Object.keys(a as object)
  const keysB = Object.keys(b as object)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!keysB.includes(key)) return false
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false
  }
  return true
}

export const styleEqual = (a?: TableCellStyle, b?: TableCellStyle) => valueEqual(a, b)
export const outlineEqual = (a?: PPTElementOutline, b?: PPTElementOutline) => valueEqual(a, b)
export const themeEqual = (a?: TableTheme, b?: TableTheme) => valueEqual(a, b)

const lastWrittenTableData = new Map<string, TableCell[][]>()

export const rememberTableCellWrite = (elementId: string, data: TableCell[][]) => {
  lastWrittenTableData.set(elementId, data)
}

export const forgetTableCellWrite = (elementId: string) => {
  lastWrittenTableData.delete(elementId)
}

export const numArrEqual = (a: number[] | undefined, b: number[] | undefined) => {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export const tableGridStructureEqual = (a: TableCell[][], b: TableCell[][]) => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const rowA = a[i]
    const rowB = b[i]
    if (rowA.length !== rowB.length) return false
    for (let j = 0; j < rowA.length; j++) {
      const ca = rowA[j]
      const cb = rowB[j]
      if (ca.id !== cb.id || ca.rowspan !== cb.rowspan || ca.colspan !== cb.colspan) return false
      if (ca.style !== cb.style && !styleEqual(ca.style, cb.style)) return false
    }
  }
  return true
}

export const tableGridTextEqual = (a: TableCell[][], b: TableCell[][]) => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const rowA = a[i]
    const rowB = b[i]
    if (rowA.length !== rowB.length) return false
    for (let j = 0; j < rowA.length; j++) {
      if (rowA[j].text !== rowB[j].text) return false
    }
  }
  return true
}

export const isTableCellHtmlEcho = (elementId: string, data: TableCell[][]) => {
  const written = lastWrittenTableData.get(elementId)
  return !!written && tableGridTextEqual(written, data)
}

export const areTableCellViewEqual = (
  prev: { cell: TableCell; isActive: boolean; isSelected: boolean; hide: boolean; cellMinHeight: number; rowIndex: number; colIndex: number },
  next: { cell: TableCell; isActive: boolean; isSelected: boolean; hide: boolean; cellMinHeight: number; rowIndex: number; colIndex: number },
) => {
  if (prev.rowIndex !== next.rowIndex || prev.colIndex !== next.colIndex) return false
  if (prev.isActive !== next.isActive || prev.isSelected !== next.isSelected || prev.hide !== next.hide) return false
  if (prev.cellMinHeight !== next.cellMinHeight) return false
  const a = prev.cell
  const b = next.cell
  if (a.id !== b.id || a.rowspan !== b.rowspan || a.colspan !== b.colspan) return false
  if (a.style !== b.style && !styleEqual(a.style, b.style)) return false
  if (next.isActive) return true
  return a.text === b.text
}

export const areTableElementInfosEqual = (a: PPTTableElement, b: PPTTableElement) => {
  if (a === b) return true
  if (a.id !== b.id || a.lock !== b.lock) return false
  if (a.top !== b.top || a.left !== b.left || a.width !== b.width || a.height !== b.height || a.rotate !== b.rotate) return false
  if (a.cellMinHeight !== b.cellMinHeight) return false
  if (!numArrEqual(a.colWidths, b.colWidths)) return false
  if (a.outline !== b.outline && !outlineEqual(a.outline, b.outline)) return false
  if (a.theme !== b.theme && !themeEqual(a.theme, b.theme)) return false
  if (!tableGridStructureEqual(a.data, b.data)) return false
  if (!tableGridTextEqual(a.data, b.data) && !isTableCellHtmlEcho(b.id, b.data)) return false
  return true
}
