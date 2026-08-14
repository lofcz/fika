import type { ImageClipDataRange } from '@/types/slides';

export const PPTX_PX_PER_INCH = 96;
export const PPTX_POINTS_PER_INCH = 72;
export const PPTX_PX_PER_POINT = PPTX_PX_PER_INCH / PPTX_POINTS_PER_INCH;
export const getPPTXImportScale = (sourceWidth: number, targetViewportSize?: number) => {
  if (targetViewportSize !== undefined) return targetViewportSize / sourceWidth;
  return PPTX_PX_PER_POINT;
};

/**
 * Convert editor-px crop range (percentages) into PptxGenJS image crop sizing (inches).
 * `pxPerInch` defaults to 96; pass the export `ratioPx2Inch` when the deck viewport is scaled.
 */
export const getPPTXImageCrop = (width: number, height: number, range: ImageClipDataRange, pxPerInch: number = PPTX_PX_PER_INCH) => {
  const [[startX, startY], [endX, endY]] = range;
  const widthScale = (endX - startX) / 100;
  const heightScale = (endY - startY) / 100;
  const imageWidth = width / widthScale / pxPerInch;
  const imageHeight = height / heightScale / pxPerInch;
  return {
    imageWidth,
    imageHeight,
    sizing: {
      x: startX / 100 * imageWidth,
      y: startY / 100 * imageHeight,
      w: widthScale * imageWidth,
      h: heightScale * imageHeight
    }
  };
};
