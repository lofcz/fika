import type { LineStyleType, PPTElementOutline } from '@/types/slides';

/** Values `<= 1` are a 0–1 fraction of max rounding (ECMA-376 / pptxgenjs `rectRadius`). Values `> 1` are legacy px. */
const isOutlineRadiusFraction = (radius: number) => radius <= 1;

/** Clamp a resolved pixel corner radius to half the shorter box side. */
export const clampOutlineRadius = (radius: number, width: number, height: number): number => {
  const max = Math.min(width, height) / 2;
  return Math.max(0, Math.min(radius, max));
};

/** Pixel radius for paint/CSS. `radius` is 0–1 of max rounding, or legacy px when `> 1`. */
export const resolveOutlineRadiusPx = (radius: number | undefined, width: number, height: number): number => {
  if (!radius) return 0;
  const max = Math.min(width, height) / 2;
  if (max <= 0) return 0;
  if (isOutlineRadiusFraction(radius)) return clampOutlineRadius(radius * max, width, height);
  return clampOutlineRadius(radius, width, height);
};

/** Slider / label percent (0–100) for an authored outline radius. */
export const outlineRadiusToPercent = (radius: number | undefined, width: number, height: number): number => {
  if (!radius) return 0;
  if (isOutlineRadiusFraction(radius)) return Math.round(radius * 100);
  const max = Math.min(width, height) / 2;
  if (max <= 0) return 0;
  return Math.round(Math.min(100, radius / max * 100));
};

export const percentToOutlineRadius = (percent: number): number => (
  Math.max(0, Math.min(100, percent)) / 100
);

export const outlineRadiusCss = (radius: number | undefined, width: number, height: number): string | undefined => {
  const px = resolveOutlineRadiusPx(radius, width, height);
  if (!px) return undefined;
  return `${px}px`;
};

/** SVG path for a rectangular outline (optionally rounded). */
export const roundedRectOutlinePath = (width: number, height: number, radius = 0): string => {
  const r = resolveOutlineRadiusPx(radius, width, height);
  if (r <= 0) {
    return `M0,0 L${width},0 L${width},${height} L0,${height} Z`;
  }
  return [`M${r},0`, `L${width - r},0`, `Q${width},0 ${width},${r}`, `L${width},${height - r}`, `Q${width},${height} ${width - r},${height}`, `L${r},${height}`, `Q0,${height} 0,${height - r}`, `L0,${r}`, `Q0,0 ${r},0`, 'Z'].join(' ');
};

/**
 * pptxgenjs-plus `rectRadius` (ECMA-376 `a:gd name="adj"` / 50000).
 * 0 = sharp corners, 1 = maximum rounding, 0.2 = 20%.
 */
export const outlineRadiusToPptxRectRadius = (radius: number, width: number, height: number): number => {
  if (radius <= 0) return 0;
  if (isOutlineRadiusFraction(radius)) return Math.min(1, radius);
  const max = Math.min(width, height) / 2;
  if (max <= 0) return 0;
  return Math.min(1, radius / max);
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
    outline.radius = +Math.min(1, Math.max(0, adj)).toFixed(4);
  }
  return outline;
};
