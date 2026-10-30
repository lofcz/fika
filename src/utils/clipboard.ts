import { getLL } from '@/i18n/getLL';
import { decrypt } from '@/utils/crypto';
import { getFikaPortalTarget } from '@/utils/portal';

/**
 * Copy text to the clipboard.
 * @param text Text to copy
 */
export const copyText = (text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const previousFocus = document.activeElement;
    const selection = window.getSelection();
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    try {
      getFikaPortalTarget().appendChild(textarea);
      textarea.select();
      // Clipboard helpers may report selected text as success even when the
      // browser rejects the write. Cut must observe the actual command result.
      if (document.execCommand('copy')) resolve();
      else reject(getLL().common.clipboard.unsupportedOrDenied());
    } catch {
      reject(getLL().common.clipboard.unsupportedOrDenied());
    } finally {
      textarea.remove();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      if (selection) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
      }
    }
  });
};

export const readClipboard = (): Promise<string> => {
  const LL = getLL();
  return new Promise((resolve, reject) => {
    if (navigator.clipboard?.readText) {
      navigator.clipboard.readText().then(text => {
        if (!text) reject(LL.common.clipboard.emptyOrNoText());
        return resolve(text);
      }).catch(() => reject(LL.common.clipboard.unsupportedOrDenied()));
    } else reject(LL.common.clipboard.unsupportedOrDenied());
  });
};

export const pasteCustomClipboardString = (text: string) => {
  let clipboardData;
  try {
    clipboardData = JSON.parse(decrypt(text));
  } catch {
    clipboardData = text;
  }
  return clipboardData;
};

export const pasteExcelClipboardString = (text: string, allowSingleColumn = false): string[][] | null => {
  // Spreadsheet clipboard TSV quotes cells containing tabs, newlines, or
  // quotes. Splitting on separators first destroys those cell boundaries.
  const source = text.replace(/\r\n?/g, '\n');
  const data: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (source[i + 1] === '"') { cell += '"'; i++; }
      else if (i + 1 === source.length || source[i + 1] === '\t' || source[i + 1] === '\n') quoted = false;
      else return null;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === '\t') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); data.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) return null;
  if (cell || row.length || (source.length && !source.endsWith('\n'))) {
    row.push(cell);
    data.push(row);
  }
  const colCount = data[0]?.length ?? 0;
  const isGrid = colCount >= 2 || (allowSingleColumn && colCount === 1 && data.length > 1);
  if (!isGrid || data.some(cells => cells.length !== colCount)) return null;
  return data;
};

// Parsed clipboard HTML is detached, so innerText cannot supply rendered breaks.
// Preserve explicit breaks and boundaries between common block containers.
const cellBlockTags = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const htmlCellText = (cell: HTMLElement): string => {
  let text = '';
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'BR') {
      text += '\n';
      return;
    }
    const block = cellBlockTags.has(node.tagName);
    if (block && text && !text.endsWith('\n')) text += '\n';
    for (const child of Array.from(node.childNodes)) visit(child);
    if (block && text && !text.endsWith('\n')) text += '\n';
  };
  for (const child of Array.from(cell.childNodes)) visit(child);
  return text.trim();
};

export const pasteHTMLTableClipboardString = (text: string): string[][] | null => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  const data: string[][] = [];
  if (!table) return null;
  const rows = Array.from(table.rows);
  for (const [rowIndex, row] of rows.entries()) {
    data[rowIndex] ??= [];
    let column = 0;
    for (const cell of Array.from(row.cells)) {
      while (data[rowIndex][column] !== undefined) column++;
      const text = htmlCellText(cell);
      const rowSpan = Math.min(cell.rowSpan || rows.length - rowIndex, rows.length - rowIndex);
      for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
        data[r] ??= [];
        for (let c = column; c < column + cell.colSpan; c++) data[r][c] = text;
      }
      column += cell.colSpan;
    }
  }
  const width = data.reduce((max, row) => Math.max(max, row.length), 0);
  if (!width) return null;
  return data.map(row => Array.from({ length: width }, (_, column) => row[column] ?? ''));
};
