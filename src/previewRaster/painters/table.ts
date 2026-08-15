import type { PPTTableElement, TableCell, TableCellStyle, TableTheme } from '@/types/slides'
import { TABLE_ON_INK, TABLE_PAPER, TABLE_PAPER_STRIPE } from '@/configs/table'
import { getTableThemeColors } from '@/utils/element'
import { escapeBoothText, rasterHtml } from './booth'

const hiddenCells = (rows: TableCell[][]) => {
  const hide = new Set<string>()
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (cell.colspan > 1 || cell.rowspan > 1) {
        for (let rowIndex = r; rowIndex < r + cell.rowspan; rowIndex++) {
          for (let colIndex = rowIndex === r ? c + 1 : c; colIndex < c + cell.colspan; colIndex++) {
            hide.add(`${rowIndex}_${colIndex}`)
          }
        }
      }
    }
  }
  return hide
}

const cellTextStyle = (minHeight: number, style?: TableCellStyle, onHeader = false) => {
  const vAlign = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const
  const decoration = [style?.underline ? 'underline' : '', style?.strikethrough ? 'line-through' : ''].join(' ').trim()
  return [
    `min-height:${Math.max(0, minHeight - 16)}px`,
    'padding:8px 10px',
    'line-height:1.45',
    'display:flex',
    'flex-direction:column',
    `justify-content:${vAlign[style?.vAlign || 'top']}`,
    `text-align:${style?.align || 'left'}`,
    style?.bold || onHeader ? 'font-weight:600' : '',
    style?.em ? 'font-style:italic' : '',
    decoration ? `text-decoration:${decoration}` : '',
    `color:${escapeBoothText(style?.color || (onHeader ? TABLE_ON_INK : '#18181b'))}`,
    `font-size:${escapeBoothText(style?.fontsize || '14px')}`,
    style?.fontname ? `font-family:${escapeBoothText(style.fontname)}` : '',
  ].filter(Boolean).join(';')
}

const themeFill = (theme: TableTheme | undefined, row: number, col: number, rows: number, cols: number, colors: { header: string; stripe: string; stripeAlt: string }) => {
  if (!theme) return TABLE_PAPER
  if ((theme.rowHeader && row === 0) || (theme.rowFooter && row === rows - 1) || (theme.colHeader && col === 0) || (theme.colFooter && col === cols - 1)) {
    return colors.header
  }
  return row % 2 === 0 ? colors.stripeAlt : colors.stripe
}

const isThemeHeader = (theme: TableTheme | undefined, row: number, col: number, rows: number, cols: number) => (
  !!theme && (
    (theme.rowHeader && row === 0)
    || (theme.rowFooter && row === rows - 1)
    || (theme.colHeader && col === 0)
    || (theme.colFooter && col === cols - 1)
  )
)

const formatCellText = (text: string) => text.replace(/\n/g, '<br>')

export const paintTable = (element: PPTTableElement, captureScale = 1) => {
  const rows = element.data
  const hide = hiddenCells(rows)
  const colors = element.theme?.color ? getTableThemeColors(element.theme.color) : { header: '#18181b', stripe: TABLE_PAPER_STRIPE, stripeAlt: TABLE_PAPER }
  const borderW = element.outline?.width ?? 1
  const borderC = escapeBoothText(element.outline?.color || '#e4e4e7')
  const borderS = element.outline?.style || 'solid'
  const rowCount = rows.length
  const colCount = rows[0]?.length ?? 0
  const cols = element.colWidths.map(fraction => (
    `<col span="1" style="width:${(fraction * element.width).toFixed(2)}px">`
  )).join('')
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => {
      if (hide.has(`${rowIndex}_${colIndex}`)) return ''
      const header = isThemeHeader(element.theme, rowIndex, colIndex, rowCount, colCount)
      const fill = escapeBoothText(cell.style?.backcolor || themeFill(element.theme, rowIndex, colIndex, rowCount, colCount, colors))
      return `<td rowspan="${cell.rowspan || 1}" colspan="${cell.colspan || 1}" style="border:${borderW}px ${borderS} ${borderC};background:${fill};vertical-align:middle;word-wrap:break-word"><div style="${cellTextStyle(element.cellMinHeight, cell.style, header && !cell.style?.color)}">${formatCellText(cell.text || '')}</div></td>`
    }).join('')
    return `<tr style="height:${element.cellMinHeight}px">${cells}</tr>`
  }).join('')
  const html = `<table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;background:${TABLE_PAPER}"><colgroup>${cols}</colgroup><tbody>${body}</tbody></table>`
  return rasterHtml(html, element.width, element.height, captureScale)
}
