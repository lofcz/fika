import { bindStyles } from '@/utils/cssm'
import styles from './StaticTable.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type MouseEvent as ReactMouseEvent, memo, useMemo } from 'react';

import type { PPTElementOutline, TableCell, TableTheme } from '@/types/slides';
import { getCellStyle, getTextStyle, formatText } from './utils';
import useHideCells from './useHideCells';
import useSubThemeColor from './useSubThemeColor';
import useMathReady from './useMathReady';

export type IStaticTableProps = {
  data: TableCell[][];
  width: number;
  height?: number;
  cellMinHeight: number;
  colWidths: number[];
  outline: PPTElementOutline;
  theme?: TableTheme;
  editable?: boolean;
  liveTable?: boolean;
  onMouseDown?: (e: ReactMouseEvent) => void;
};

const StaticTable = memo((props: IStaticTableProps) => {
  const { data, width, height, cellMinHeight, colWidths, outline, theme, liveTable, onMouseDown } = props;
  const colSizeList = useMemo(() => colWidths.map(item => item * width), [colWidths, width]);
  const totalWidth = useMemo(() => colSizeList.reduce((a, b) => a + b, 0), [colSizeList]);
  const { hideCells } = useHideCells(data);
  const hideSet = useMemo(() => (hideCells.length ? new Set(hideCells) : null), [hideCells]);
  const { themeColors } = useSubThemeColor(theme);
  const mathIsReady = useMathReady(data);
  const rowCount = Math.max(1, data.length);
  const trHeight = liveTable && height && height > 0
    ? Math.max(cellMinHeight, Math.floor(height / rowCount))
    : cellMinHeight;
  const minTableHeight = liveTable && height && height > 0 ? Math.max(height, trHeight * rowCount) : undefined;
  // Use uniform `trHeight = max(cellMinHeight, floor(height / rowCount))` so
  // unselected static tables distribute row height identically to EditableTable,
  // the canvas thumbnail painter, and PPTX export (never proportionally by content).
  // `floor` keeps `rowCount * trHeight <= height` so single-step `tallest * rows`
  // growth terminates in one store write without feedback oscillation.

  return <div className={cx('static-table')} data-live-table={liveTable ? '' : undefined} style={{ width: totalWidth + 'px' }} onMouseDown={onMouseDown}>
    <table
      className={cx({
        theme,
        'row-header': theme?.rowHeader,
        'row-footer': theme?.rowFooter,
        'col-header': theme?.colHeader,
        'col-footer': theme?.colFooter
      })}
      style={{
        ...(minTableHeight ? { height: minTableHeight + 'px' } : {}),
        '--themeColor': theme?.color,
        '--headerColor': themeColors.header,
        '--subThemeColor1': themeColors.stripe,
        '--subThemeColor2': themeColors.stripeAlt
      } as CSSProperties}
    >
      <colgroup>{colSizeList.map((colWidth, index) => <col span={1} key={index} width={colWidth} />)}</colgroup>
      <tbody>{data.map((rowCells, rowIndex) => <tr key={rowIndex} style={{ height: trHeight + 'px' }}>
        {rowCells.map((cell, colIndex) => <td
          className={cx('cell')}
          data-cell-index={`${rowIndex}_${colIndex}`}
          data-cell-fill={cell.style?.backcolor || undefined}
          data-cell-color={cell.style?.color || undefined}
          style={{
            ...getCellStyle(outline, cell.style),
            display: hideSet?.has(`${rowIndex}_${colIndex}`) ? 'none' : ''
          }}
          key={cell.id}
          rowSpan={cell.rowspan}
          colSpan={cell.colspan}
        >
          <div className={cx('cell-text')} style={getTextStyle(cellMinHeight, cell.style, cell.textFormat === 'html')} dangerouslySetInnerHTML={{ __html: formatText(cell.text, cell.textFormat, mathIsReady ? 1 : 0) }} />
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
});
export default StaticTable;
