import type { PPTElementOutline, TableCellStyle } from '@/types/slides';
import { containsMath, tokenizeMath } from '@/utils/markdown';
import { ensureMathliveReady, mathReady, renderMathToHtml } from '@/utils/math';

/**
 * Compute table cell box styles from outline and optional cell style.
 */
export const getCellStyle = (outline: PPTElementOutline, style?: TableCellStyle): any => {
  return {
    backgroundColor: style?.backcolor || '',
    borderStyle: outline.style,
    borderColor: outline.color,
    borderWidth: outline.width + 'px'
  };
};

/**
 * Compute table cell text layout styles from optional cell style.
 */
export const getTextStyle = (cellMinHeight: number, style?: TableCellStyle): any => {
  if (!style) return {
    minHeight: cellMinHeight - 16 + 'px'
  };
  const {
    bold,
    em,
    underline,
    strikethrough,
    color,
    fontsize,
    fontname,
    align,
    vAlign
  } = style;
  const vAlignMap = {
    'top': 'flex-start',
    'middle': 'center',
    'bottom': 'flex-end'
  };
  let textDecoration = `${underline ? 'underline' : ''} ${strikethrough ? 'line-through' : ''}`;
  if (textDecoration === ' ') textDecoration = 'none';
  return {
    ...(bold !== undefined ? {
      fontWeight: bold ? 600 : 'normal'
    } : {}),
    fontStyle: em ? 'italic' : 'normal',
    textDecoration,
    color: color || '#000',
    fontSize: fontsize || '14px',
    fontFamily: fontname || '',
    justifyContent: vAlignMap[vAlign || 'top'],
    textAlign: align || 'left',
    minHeight: cellMinHeight - 16 + 'px'
  };
};
const escapeCellText = (text: string) => text.replace(/\n/g, '</br>').replace(/ /g, '&nbsp;');

/**
 * Render a table cell's stored source for display. Plain text keeps the legacy
 * newline/space escaping; cells whose source contains math (`$…$`, `$$…$$`,
 * `\(…\)`, …) get each formula typeset with MathLive into the canonical
 * `span.fika-math` wrapper while the surrounding text stays escaped.
 *
 * Reads the reactive {@link mathReady} flag so the cell re-renders the moment
 * MathLive finishes loading (kicked off lazily here on first math encounter);
 * until then math segments fall back to their literal LaTeX source.
 */
export const formatText = (text: string) => {
  if (!text) return '';
  if (!containsMath(text)) return escapeCellText(text);
  if (!mathReady.value) void ensureMathliveReady();
  return tokenizeMath(text).map(segment => segment.type === 'math' ? renderMathToHtml(segment.value, segment.display) : escapeCellText(segment.value)).join('');
};
