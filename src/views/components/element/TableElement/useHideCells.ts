import type { TableCell } from '@/types/slides'
import { getHiddenTableCells } from '@/utils/tableHiddenCells'

export default (cells: TableCell[][]) => ({ hideCells: getHiddenTableCells(cells) })
