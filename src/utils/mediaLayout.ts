export interface MediaBox {
  width: number;
  height: number;
}
export const DEFAULT_VIDEO_SIZE: MediaBox = {
  width: 500,
  height: 300
};
export const DEFAULT_AUDIO_SIZE: MediaBox = {
  width: 400,
  height: 88
};
export const COMPACT_AUDIO_MAX_PX = 96;
export const isCompactAudioBox = (width: number, height: number) => {
  return width <= COMPACT_AUDIO_MAX_PX && height <= COMPACT_AUDIO_MAX_PX;
};
export const mediaPlayerHostId = (elementId: string) => `media-player-host-${elementId}`;
export interface MediaPlacement extends MediaBox {
  left: number;
  top: number;
}

/**
 * Symmetric row counts that read as a simple shape on a slide:
 * pair, triangle, square, hexagon-like, etc.
 */
export const mediaRowPattern = (count: number): number[] => {
  if (count <= 1) return [count];
  switch (count) {
    case 2:
      return [2];
    case 3:
      return [1, 2];
    case 4:
      return [2, 2];
    case 5:
      return [2, 3];
    case 6:
      return [3, 3];
    case 7:
      return [2, 3, 2];
    case 8:
      return [3, 2, 3];
    case 9:
      return [3, 3, 3];
    case 10:
      return [3, 4, 3];
    case 11:
      return [4, 3, 4];
    case 12:
      return [4, 4, 4];
    default:
      {
        const cols = count > 16 ? 5 : 4;
        const rows: number[] = [];
        let remaining = count;
        while (remaining > 0) {
          rows.push(Math.min(cols, remaining));
          remaining -= cols;
        }
        return rows;
      }
  }
};
export const fitBox = (srcW: number, srcH: number, maxW: number, maxH: number): MediaBox => {
  if (srcW <= 0 || srcH <= 0) return {
    width: Math.max(1, maxW),
    height: Math.max(1, maxH)
  };
  const scale = Math.min(maxW / srcW, maxH / srcH, 1);
  return {
    width: Math.max(1, srcW * scale),
    height: Math.max(1, srcH * scale)
  };
};

/**
 * Place boxes in a centered, symmetric bouquet. Items keep their aspect
 * ratio and are not grouped — callers should select at most one afterwards.
 */
export const layoutMediaBoxes = (boxes: MediaBox[], canvasWidth: number, canvasHeight: number): MediaPlacement[] => {
  const count = boxes.length;
  if (!count) return [];
  if (count === 1) {
    const box = boxes[0];
    return [{
      ...box,
      left: (canvasWidth - box.width) / 2,
      top: (canvasHeight - box.height) / 2
    }];
  }
  const padding = Math.max(32, Math.min(canvasWidth, canvasHeight) * 0.07);
  const gap = Math.max(20, Math.min(canvasWidth, canvasHeight) * 0.035);
  const pattern = mediaRowPattern(count);
  const rowCount = pattern.length;
  const colCount = Math.max(...pattern);
  const innerW = Math.max(1, canvasWidth - padding * 2);
  const innerH = Math.max(1, canvasHeight - padding * 2);
  const cellW = (innerW - gap * (colCount - 1)) / colCount;
  const cellH = (innerH - gap * (rowCount - 1)) / rowCount;
  const fitted = boxes.map(box => fitBox(box.width, box.height, cellW, cellH));
  const rows: MediaBox[][] = [];
  const rowHeights: number[] = [];
  let cursor = 0;
  for (const size of pattern) {
    const row = fitted.slice(cursor, cursor + size);
    rows.push(row);
    rowHeights.push(Math.max(...row.map(item => item.height)));
    cursor += size;
  }
  const totalH = rowHeights.reduce((sum, height) => sum + height, 0) + gap * (rowCount - 1);
  let top = (canvasHeight - totalH) / 2;
  const placed: MediaPlacement[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const rowH = rowHeights[rowIndex];
    const rowW = row.reduce((sum, item) => sum + item.width, 0) + gap * (row.length - 1);
    let left = (canvasWidth - rowW) / 2;
    for (const item of row) {
      placed.push({
        width: item.width,
        height: item.height,
        left,
        top: top + (rowH - item.height) / 2
      });
      left += item.width + gap;
    }
    top += rowH + gap;
  }
  return placed;
};
