import { ShapePathFormulasKeys, type LineStyleType, type PPTElementOutline, type PPTShapeElement } from '@/types/slides';
import { isAxisAlignedRectPath } from '@/utils/simpleShape';

/** Values `<= 1` are a 0–1 fraction of max rounding (ECMA-376 / pptxgenjs `rectRadius`). Values `> 1` are legacy px. */
const isOutlineRadiusFraction = (radius: number) => radius <= 1;

const RECT_FAMILY_FORMULAS = new Set<string>([
  ShapePathFormulasKeys.ROUND_RECT,
  ShapePathFormulasKeys.ROUND_RECT_DIAGONAL,
  ShapePathFormulasKeys.ROUND_RECT_SINGLE,
  ShapePathFormulasKeys.ROUND_RECT_SAMESIDE,
  ShapePathFormulasKeys.CUT_RECT_DIAGONAL,
  ShapePathFormulasKeys.CUT_RECT_SINGLE,
  ShapePathFormulasKeys.CUT_RECT_SAMESIDE,
  ShapePathFormulasKeys.CUT_ROUND_RECT,
]);

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

const pathNum = (n: number) => {
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/**
 * Rounded rect in local units. `rx`/`ry` are elliptical radii of that space
 * (circular after a matching non-uniform scale). Skips zero-length edges so
 * 100% rounding is a pill/circle instead of collapsed quadratic chamfers.
 */
export const roundedRectEllipsePath = (width: number, height: number, rx: number, ry: number): string => {
  const x = Math.max(0, Math.min(rx, width / 2));
  const y = Math.max(0, Math.min(ry, height / 2));
  if (x <= 0 || y <= 0) return `M 0 0 L ${pathNum(width)} 0 L ${pathNum(width)} ${pathNum(height)} L 0 ${pathNum(height)} Z`;
  const right = width - x;
  const bottom = height - y;
  const horiz = width - 2 * x;
  const vert = height - 2 * y;
  const arc = (px: number, py: number) => `A ${pathNum(x)} ${pathNum(y)} 0 0 1 ${pathNum(px)} ${pathNum(py)}`;
  const parts = [`M ${pathNum(x)} 0`];
  if (horiz > 0.001) parts.push(`L ${pathNum(right)} 0`);
  parts.push(arc(width, y));
  if (vert > 0.001) parts.push(`L ${pathNum(width)} ${pathNum(bottom)}`);
  parts.push(arc(right, height));
  if (horiz > 0.001) parts.push(`L ${pathNum(x)} ${pathNum(height)}`);
  parts.push(arc(0, bottom));
  if (vert > 0.001) parts.push(`L 0 ${pathNum(y)}`);
  parts.push(arc(x, 0));
  parts.push('Z');
  return parts.join(' ');
};

/** Circular-corner rounded rect in pixel space. 100% radius → pill / circle. */
export const roundedRectArcPath = (width: number, height: number, radiusPx: number): string => {
  const r = clampOutlineRadius(radiusPx, width, height);
  return roundedRectEllipsePath(width, height, r, r);
};

/** SVG path for a rectangular outline (optionally rounded). */
export const roundedRectOutlinePath = (width: number, height: number, radius = 0): string => (
  roundedRectArcPath(width, height, resolveOutlineRadiusPx(radius, width, height))
);

/** Rectangles and rectangle-family formulas the border-radius slider can round. */
export const isRoundableRectShape = (el: Pick<PPTShapeElement, 'path' | 'viewBox' | 'pathFormula'>): boolean => {
  if (!el.pathFormula) return isAxisAlignedRectPath(el.path, el.viewBox);
  return RECT_FAMILY_FORMULAS.has(el.pathFormula);
};

/**
 * Path the editor / painter / hit-test should use. Outline radius is a 0–1
 * fraction of max rounding; viewBox scale keeps the corners circular.
 */
export const resolveShapePaintPath = (el: PPTShapeElement): string => {
  if (!el.outline?.radius || !isRoundableRectShape(el)) return el.path;
  const rPx = resolveOutlineRadiusPx(el.outline.radius, el.width, el.height);
  if (rPx <= 0) return el.path;
  const [vw, vh] = el.viewBox;
  if (!vw || !vh) return roundedRectArcPath(el.width, el.height, rPx);
  return roundedRectEllipsePath(vw, vh, rPx * vw / el.width, rPx * vh / el.height);
};

/** Keep ROUND_RECT keypoints / path in sync when the radius slider moves. */
export const shapePropsForOutlineRadius = (el: PPTShapeElement, radius: number): Partial<PPTShapeElement> => {
  if (!isRoundableRectShape(el)) return {};
  const rPx = resolveOutlineRadiusPx(radius, el.width, el.height);
  if (rPx <= 0) {
    return {
      pathFormula: undefined,
      keypoints: undefined,
      viewBox: [el.width, el.height],
      path: roundedRectArcPath(el.width, el.height, 0),
    };
  }
  const minSide = Math.min(el.width, el.height);
  return {
    pathFormula: ShapePathFormulasKeys.ROUND_RECT,
    keypoints: [minSide > 0 ? rPx / minSide : 0],
    viewBox: [el.width, el.height],
    path: roundedRectArcPath(el.width, el.height, rPx),
  };
};

export const outlineElementPatch = (
  el: { type: string },
  outline: PPTElementOutline,
  radiusChanged = false,
): { outline: PPTElementOutline } & Partial<PPTShapeElement> => {
  if (!radiusChanged || el.type !== 'shape') return { outline };
  return { outline, ...shapePropsForOutlineRadius(el as PPTShapeElement, outline.radius ?? 0) };
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
