
import type { PPTElementOutline } from '@/types/slides';
import { clampOutlineRadius, roundedRectOutlinePath } from '@/utils/elementOutline';

export default (outline: any) => {
  const outlineWidth = outline?.width ?? 0;
  const outlineStyle = outline?.style || 'solid';
  const outlineColor = outline?.color || '#18181b';
  const outlineRadius = outline?.radius ?? 0;
  const strokeDashArray = (() => {
    const size = outlineWidth;
    if (outlineStyle === 'dashed') return size <= 6 ? `${size * 4.5} ${size * 2}` : `${size * 4} ${size * 1.5}`;
    if (outlineStyle === 'dotted') return size <= 6 ? `${size * 1.8} ${size * 1.6}` : `${size * 1.5} ${size * 1.2}`;
    return '0 0';
  })();
  return {
    outlineWidth,
    outlineStyle,
    outlineColor,
    outlineRadius,
    strokeDashArray
  };
};
export const useOutlinePath = (outline: any, width: any, height: any) => {
  return roundedRectOutlinePath(width, height, outline?.radius ?? 0)
}
export const useOutlineRadiusCss = (outline: any, width: any, height: any) => {
  const radius = outline?.radius
  if (!radius) return undefined
  return `${clampOutlineRadius(radius, width, height)}px`
}
