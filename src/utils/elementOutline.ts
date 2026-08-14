import type { LineStyleType, PPTElementOutline } from '@/types/slides';

/** Clamp corner radius to half the shorter box side. */
export const clampOutlineRadius = (radius: number, width: number, height: number): number => {
  const max = Math.min(width, height) / 2;
  return Math.max(0, Math.min(radius, max));
};
export const outlineRadiusCss = (radius: number | undefined, width: number, height: number): string | undefined => {
  if (!radius) return undefined;
  return `${clampOutlineRadius(radius, width, height)}px`;
};

/** SVG path for a rectangular outline (optionally rounded). */
export const roundedRectOutlinePath = (width: number, height: number, radius = 0): string => {
  const r = clampOutlineRadius(radius, width, height);
  if (r <= 0) {
    return `M0,0 L${width},0 L${width},${height} L0,${height} Z`;
  }
  return [`M${r},0`, `L${width - r},0`, `Q${width},0 ${width},${r}`, `L${width},${height - r}`, `Q${width},${height} ${width - r},${height}`, `L${r},${height}`, `Q0,${height} 0,${height - r}`, `L0,${r}`, `Q0,0 ${r},0`, 'Z'].join(' ');
};

/** pptxgenjs `rectRadius` is 0–1 relative to the shorter side. */
export const outlineRadiusToPptxRectRadius = (radius: number, width: number, height: number): number => {
  const min = Math.min(width, height);
  if (min <= 0 || radius <= 0) return 0;
  return Math.min(0.5, clampOutlineRadius(radius, width, height) / min);
};

/** pptxtojson emits border colors as a structured solid/gradient object. */
export type PptxBorderColor = string | {
  type: 'color';
  value: string;
} | {
  type: 'gradient';
  value: {
    colors: {
      color: string;
      pos: string;
    }[];
    path: string;
    rot: number;
  };
};

/**
 * Flatten a pptxtojson border color to the single CSS color Fika outlines
 * and lines support. Gradient strokes fall back to their first stop.
 */
export const pptxBorderColorToString = (borderColor?: PptxBorderColor): string | undefined => {
  if (!borderColor) return undefined;
  if (typeof borderColor === 'string') return borderColor;
  if (borderColor.type === 'color') return borderColor.value;
  return borderColor.value.colors[0]?.color;
};
interface PptxOutlineSource {
  borderColor?: PptxBorderColor;
  borderWidth?: number;
  borderType?: LineStyleType;
  shapType?: string;
  keypoints?: Record<string, number>;
  width: number;
  height: number;
}
export const importOutlineFromPptx = (el: PptxOutlineSource, ratio: number, options: {
  includeCornerRadius?: boolean;
} = {}): PPTElementOutline => {
  const outline: PPTElementOutline = {
    color: pptxBorderColorToString(el.borderColor),
    width: +((el.borderWidth || 0) * ratio).toFixed(2),
    style: el.borderType
  };
  const adj = el.keypoints?.adj;
  if (options.includeCornerRadius !== false && el.shapType === 'roundRect' && adj !== undefined) {
    const minSide = Math.min(el.width, el.height);
    outline.radius = +(minSide * adj * 0.5).toFixed(2);
  }
  return outline;
};
