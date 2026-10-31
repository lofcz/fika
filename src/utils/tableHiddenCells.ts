import type { TableCell } from '@/types/slides'

// Covered cells retain their content for unmerge, but are not displayed.
export const getHiddenTableCells = (cells: TableCell[][]): string[] => {
  const hideCells = [];
  for (let i = 0; i < cells.length; i++) {
    const rowCells = cells[i];
    for (let j = 0; j < rowCells.length; j++) {
      const cell = rowCells[j];
      if (cell.colspan > 1 || cell.rowspan > 1) {
        for (let row = i; row < i + cell.rowspan; row++) {
          for (let col = row === i ? j + 1 : j; col < j + cell.colspan; col++) {
            hideCells.push(`${row}_${col}`);
          }
        }
      }
    }
  }
  return hideCells;
}
