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

export const pasteExcelClipboardString = (text: string): string[][] | null => {
  const lines: string[] = text.split(/\r\n|\n|\r/);
  if (lines[lines.length - 1] === '') lines.pop();
  let colCount = -1;
  const data: string[][] = [];
  for (const index in lines) {
    data[index] = lines[index].split('\t');
    if (data[index].length === 1) return null;
    if (colCount === -1) colCount = data[index].length;else if (colCount !== data[index].length) return null;
  }
  return data;
};

export const pasteHTMLTableClipboardString = (text: string): string[][] | null => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const table = doc.querySelector('table');
  const data: string[][] = [];
  if (!table) return null;
  const rows = table.querySelectorAll('tr');
  for (const row of rows) {
    const rowData = [];
    const cells = row.querySelectorAll('td, th');
    for (const cell of cells) {
      const text = cell.textContent ? cell.textContent.trim() : '';
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
      for (let i = 0; i < colspan; i++) {
        rowData.push(text);
      }
    }
    if (rowData.length) data.push(rowData);
  }
  return data.length ? data : null;
};
