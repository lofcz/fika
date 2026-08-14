import type { PPTElementOutline, TableTheme } from '@/types/slides';

/** Charcoal header fill and default table theme color. */
export const TABLE_INK = '#18181b';
/** Light gray type on ink headers. */
export const TABLE_ON_INK = '#fafafa';
/** Cool zinc paper body. */
export const TABLE_PAPER = '#fafafa';
/** Cool zinc stripe. */
export const TABLE_PAPER_STRIPE = '#f4f4f5';
export const DEFAULT_TABLE_OUTLINE: PPTElementOutline = {
  width: 1,
  style: 'solid',
  color: '#e4e4e7'
};
export const DEFAULT_TABLE_THEME: TableTheme = {
  color: TABLE_INK,
  rowHeader: true,
  rowFooter: false,
  colHeader: false,
  colFooter: false
};
export const DEFAULT_TABLE_CELL_WIDTH = 108;
export const DEFAULT_TABLE_CELL_MIN_HEIGHT = 44;
export const DEFAULT_TABLE_ROW_COUNT = 2;
export const DEFAULT_TABLE_COL_COUNT = 2;
