import { gradientToCss } from '@/configs/theme';
import type { Gradient } from '@/types/slides';
export type MagicalInkId = 'rainbow' | 'sunset' | 'aurora' | 'holographic';
export type InkPaint = {
  color: string;
  gradient?: Gradient;
  gradientId?: MagicalInkId;
};
export type MagicalInkGradient = {
  id: MagicalInkId;
  color: string;
  gradient: Gradient;
  css: string;
};
const stops = (...colors: string[]): Gradient['colors'] => colors.map((color, i) => ({
  pos: colors.length === 1 ? 0 : Math.round(i / (colors.length - 1) * 100),
  color
}));
const magical = (id: MagicalInkId, rotate: number, type: Gradient['type'], ...colors: string[]): MagicalInkGradient => {
  const gradient: Gradient = {
    type,
    rotate,
    colors: stops(...colors)
  };
  return {
    id,
    color: colors[0],
    gradient,
    css: gradientToCss(gradient)
  };
};

/** Compact marker palette: neutrals plus a full hue set (red → violet). */
export const INK_SOLID_SWATCHES = ['#18181b', '#ffffff', '#ff3b30', '#ff7a00', '#ffd60a', '#22c55e', '#0ea5e9', '#5b5bd6'];
export const MAGICAL_INK_GRADIENTS: MagicalInkGradient[] = [magical('rainbow', 45, 'linear', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#5856d6', '#af52de'), magical('sunset', 30, 'linear', '#ff006e', '#fb5607', '#ffbe0b', '#ff006e'), magical('aurora', 120, 'linear', '#00f5d4', '#00bbf9', '#9b5de5', '#f15bb5'), magical('holographic', 135, 'linear', '#ff71ce', '#01cdfe', '#05ffa1', '#b967ff')];
export const solidPaint = (color: string): InkPaint => ({
  color
});
export const paintFromPreset = (preset: MagicalInkGradient): InkPaint => ({
  color: preset.color,
  gradient: preset.gradient,
  gradientId: preset.id
});
const normalizeColor = (color: string) => color.replace(/ /g, '').toLowerCase();
export const samePaint = (a: InkPaint, b: InkPaint) => {
  if (a.gradientId || b.gradientId) return a.gradientId === b.gradientId;
  return normalizeColor(a.color) === normalizeColor(b.color);
};
export const paintKey = (paint: Pick<InkPaint, 'color' | 'gradientId'>) => paint.gradientId ? `g:${paint.gradientId}` : `c:${normalizeColor(paint.color)}`;
export const cloneGradient = (gradient: Gradient): Gradient => ({
  type: gradient.type,
  rotate: gradient.rotate,
  colors: gradient.colors.map(stop => ({
    ...stop
  }))
});
export const isLightColor = (color: string) => {
  const hex = color.trim();
  if (hex === '#fff' || hex === '#ffffff' || hex.toLowerCase() === 'white') return true;
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return false;
  const value = Number.parseInt(match[1], 16);
  const r = value >> 16 & 255;
  const g = value >> 8 & 255;
  const b = value & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 210;
};
export const boundsFromPoints = (points: Array<{
  x: number;
  y: number;
}>, pad = 0) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  if (!Number.isFinite(minX)) return {
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1
  };
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad
  };
};
export const createCanvasPaint = (ctx: CanvasRenderingContext2D, paint: Pick<InkPaint, 'color' | 'gradient'>, box: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): string | CanvasGradient => {
  const gradient = paint.gradient;
  if (!gradient) return paint.color;
  const width = Math.max(box.maxX - box.minX, 1);
  const height = Math.max(box.maxY - box.minY, 1);
  let canvasGradient: CanvasGradient;
  if (gradient.type === 'radial') {
    const cx = box.minX + width * 0.28;
    const cy = box.minY + height * 0.22;
    const r = Math.max(width, height) * 0.75;
    canvasGradient = ctx.createRadialGradient(cx, cy, 0, box.minX + width / 2, box.minY + height / 2, r);
  } else {
    const angle = (gradient.rotate + 90) * Math.PI / 180;
    const cx = box.minX + width / 2;
    const cy = box.minY + height / 2;
    const half = Math.hypot(width, height) / 2;
    const dx = Math.cos(angle) * half;
    const dy = Math.sin(angle) * half;
    canvasGradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  }
  for (const stop of gradient.colors) {
    canvasGradient.addColorStop(Math.min(Math.max(stop.pos / 100, 0), 1), stop.color);
  }
  return canvasGradient;
};
