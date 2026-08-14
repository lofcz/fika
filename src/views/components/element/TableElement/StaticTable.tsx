import { bindStyles } from '@/utils/cssm'
import styles from './StaticTable.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, memo, useState, useEffect } from 'react';

import type { PPTElementOutline, TableCell, TableTheme } from '@/types/slides';
import { getCellStyle, getTextStyle, formatText } from './utils';
import useHideCells from './useHideCells';
import useSubThemeColor from './useSubThemeColor';
import useMathReady from './useMathReady';

export type IStaticTableProps = {
  data: TableCell[][];
  width: number;
  cellMinHeight: number;
  colWidths: number[];
  outline: PPTElementOutline;
  theme?: TableTheme;
  editable?: boolean;
};

const StaticTable = memo((props: IStaticTableProps) => {
  const { data, width, cellMinHeight, colWidths, outline, theme } = props;
  const [colSizeList, setColSizeList] = useState(() => colWidths.map(item => item * width));
  const totalWidth = colSizeList.reduce((a, b) => a + b, 0);
  useEffect(() => {
    setColSizeList(colWidths.map(item => item * width));
  }, [colWidths, width]);
  const { hideCells } = useHideCells(data);
  const { themeColors } = useSubThemeColor(theme);
  useMathReady(data);
  return <div className={cx('static-table')} style={{ width: totalWidth + 'px' }}>
    <table
      className={cx({
        theme,
        'row-header': theme?.rowHeader,
        'row-footer': theme?.rowFooter,
        'col-header': theme?.colHeader,
        'col-footer': theme?.colFooter
      })}
      style={{
        '--themeColor': theme?.color,
        '--headerColor': themeColors.header,
        '--subThemeColor1': themeColors.stripe,
        '--subThemeColor2': themeColors.stripeAlt
      } as CSSProperties}
    >
      <colgroup>{colSizeList.map((colWidth, index) => <col span={1} key={index} width={colWidth} />)}</colgroup>
      <tbody>{data.map((rowCells, rowIndex) => <tr key={rowIndex} style={{ height: cellMinHeight + 'px' }}>
        {rowCells.map((cell, colIndex) => <td
          className={cx('cell')}
          style={{
            ...getCellStyle(outline, cell.style),
            display: !hideCells.includes(`${rowIndex}_${colIndex}`) ? '' : 'none'
          }}
          key={cell.id}
          rowSpan={cell.rowspan}
          colSpan={cell.colspan}
        >
          <div className={cx('cell-text')} style={getTextStyle(cellMinHeight, cell.style)} dangerouslySetInnerHTML={{ __html: formatText(cell.text) }} />
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
});
export default StaticTable;
