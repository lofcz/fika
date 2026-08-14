import Clipboard from 'clipboard';
import { getLL } from '@/i18n/getLL';
import { decrypt } from '@/utils/crypto';
import { getFikaPortalTarget } from '@/utils/portal';

/**
 * Copy text to the clipboard.
 * @param text Text to copy
 */
export const copyText = (text: string) => {
  return new Promise((resolve, reject) => {
    const portalTarget = getFikaPortalTarget();
    const fakeElement = document.createElement('button');
    const clipboard = new Clipboard(fakeElement, {
      text: () => text,
      action: () => 'copy',
      container: portalTarget
    });
    clipboard.on('success', e => {
      clipboard.destroy();
      resolve(e);
    });
    clipboard.on('error', e => {
      clipboard.destroy();
      reject(e);
    });
    portalTarget.appendChild(fakeElement);
    fakeElement.click();
    portalTarget.removeChild(fakeElement);
  });
};

export const readClipboard = (): Promise<string> => {
  const LL = getLL();
  return new Promise((resolve, reject) => {
    if (navigator.clipboard?.readText) {
      navigator.clipboard.readText().then(text => {
        if (!text) reject(LL.common.clipboard.emptyOrNoText());
        return resolve(text);
      });
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
  const lines: string[] = text.split('\r\n');
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
  if (!table) return data;
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
    data.push(rowData);
  }
  return data;
};
