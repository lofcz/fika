import type { PPTElement, Slide } from '@/types/slides';

export interface SlideCanvas { width: number; height: number }
type Bounds = { left: number; top: number; right: number; bottom: number };
type Interval = [number, number];

function bounds(el: PPTElement): Bounds {
  if (el.type === 'line') {
    const points = [el.start, el.end, el.broken, el.broken2, el.curve, ...(el.cubic ?? [])].filter((p): p is [number, number] => !!p);
    return { left: el.left + Math.min(...points.map(p => p[0])), right: el.left + Math.max(...points.map(p => p[0])), top: el.top + Math.min(...points.map(p => p[1])), bottom: el.top + Math.max(...points.map(p => p[1])) };
  }
  const angle = (el.rotate ?? 0) * Math.PI / 180;
  const w = Math.abs(el.width * Math.cos(angle)) + Math.abs(el.height * Math.sin(angle));
  const h = Math.abs(el.width * Math.sin(angle)) + Math.abs(el.height * Math.cos(angle));
  return { left: el.left + (el.width - w) / 2, right: el.left + (el.width + w) / 2, top: el.top + (el.height - h) / 2, bottom: el.top + (el.height + h) / 2 };
}
function union(a: Bounds, b: Bounds): Bounds {
  return { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
}
function isBackdrop(el: PPTElement, canvas: SlideCanvas) {
  return el.type === 'shape' && !el.text && !el.rotate && !el.fixedRatio && el.left <= 1 && el.top <= 1 && el.width >= canvas.width - 2 && el.height >= canvas.height - 2;
}
function isDecor(el: PPTElement, canvas: SlideCanvas) {
  return el.type === 'shape' && !el.text && !el.groupId && (el.name === 'Decor' || el.left < -1 || el.top < -1 || el.left + el.width > canvas.width + 1 || el.top + el.height > canvas.height + 1);
}

function edgeBand(el: PPTElement, canvas: SlideCanvas): 'vertical' | 'horizontal' | undefined {
  if (el.type !== 'shape' || el.text || el.groupId || el.rotate || el.fixedRatio) return;
  if (Math.abs(el.top) <= 1 && Math.abs(el.height - canvas.height) <= 2 && el.width < canvas.width * 0.3
    && (Math.abs(el.left) <= 1 || Math.abs(el.left + el.width - canvas.width) <= 1)) return 'vertical';
  if (Math.abs(el.left) <= 1 && Math.abs(el.width - canvas.width) <= 2 && el.height < canvas.height * 0.2
    && (Math.abs(el.top) <= 1 || Math.abs(el.top + el.height - canvas.height) <= 1)) return 'horizontal';
}

/** Piecewise affine map: occupied tracks retain their scale; only empty gutters expand.
 * Group bounds occupy a single track, so labels never detach from their diagram.
 */
function axisTracks(intervals: Interval[], source: number) {
  const merged: Interval[] = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    const lo = Math.max(0, start), hi = Math.min(source, end);
    if (hi <= lo) continue;
    const last = merged.at(-1);
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }
  const gaps: Interval[] = [];
  let cursor = 0;
  for (const [lo, hi] of merged) { if (lo > cursor) gaps.push([cursor, lo]); cursor = hi; }
  if (cursor < source) gaps.push([cursor, source]);
  const free = gaps.reduce((sum, [lo, hi]) => sum + hi - lo, 0);
  return { gaps, free };
}
function axisMap(intervals: Interval[], source: number, target: number, scale: number) {
  const { gaps, free } = axisTracks(intervals, source);
  const extra = target - source * scale;
  return (position: number) => position * scale + (free > 0
    ? extra * gaps.reduce((sum, [lo, hi]) => sum + Math.max(0, Math.min(position, hi) - lo), 0) / free
    : extra / 2);
}

/** Recognize a full-width heading above independent body columns. Each column
 * gets its own vertical tracks; a long item in the left column cannot prevent
 * the right column from distributing its rows through the available height.
 */
function bodyColumns(boxes: Bounds[], from: SlideCanvas) {
  if (boxes.length < 3) return;
  const top = Math.min(...boxes.map(b => b.top));
  const headers = boxes.filter(b => Math.abs(b.top - top) < 1 && b.right - b.left >= from.width * 0.55 && b.bottom <= from.height * 0.26);
  if (!headers.length) return;
  const headerBottom = Math.max(...headers.map(b => b.bottom));
  const body = boxes.filter(b => !headers.includes(b));
  if (body.some(b => b.top < headerBottom)) return;
  const bodyTop = Math.min(...body.map(b => b.top));
  const ranges: { left: number; right: number; boxes: Bounds[] }[] = [];
  for (const box of [...body].sort((a, b) => a.left - b.left)) {
    const last = ranges.at(-1);
    if (last && box.left <= last.right + from.width * 0.025) { last.right = Math.max(last.right, box.right); last.boxes.push(box); }
    else ranges.push({ left: box.left, right: box.right, boxes: [box] });
  }
  if (ranges.length > 4) return;
  const margin = Math.min(from.height * 0.06, Math.max(top, from.height * 0.03));
  const columns = ranges.map(range => {
    const height = Math.max(...range.boxes.map(b => b.bottom)) - bodyTop;
    const intervals = range.boxes.map(b => [b.top - bodyTop, b.bottom - bodyTop] as Interval);
    const { free } = axisTracks(intervals, height);
    return { ...range, height, intervals, minHeight: height - free + Math.min(free, height * 0.08) };
  });
  return { bodyTop, margin, columns, minHeight: bodyTop + margin + Math.max(...columns.map(c => c.minHeight)) };
}

function scalePixels(html: string, scale: number) {
  // CSS lengths only: do not rewrite lesson text containing quantities in px.
  return html.replace(/style=(['"])(.*?)\1/gi, (_, quote: string, css: string) => `style=${quote}${css.replace(/(-?\d+(?:\.\d+)?)px\b/g, (_m, n: string) => `${Number((Number(n) * scale).toFixed(4))}px`)}${quote}`);
}
function scaleNumber(record: object, key: string, scale: number) {
  const obj = record as Record<string, unknown>;
  if (typeof obj[key] === 'number') obj[key] = obj[key] * scale;
}
function scaleTypography(el: PPTElement, scale: number) {
  if (scale === 1) return;
  const text = el.type === 'text' ? el : el.type === 'shape' ? el.text : undefined;
  if (text) {
    text.content = scalePixels(text.content, scale);
    text.inset = (text.inset ?? [10, 10, 10, 10]).map(v => v * scale) as [number, number, number, number];
    text.paragraphSpace = (text.paragraphSpace ?? 5);
    for (const key of ['wordSpace', 'paragraphSpace', 'placeholderFontSize', 'placeholderLayoutHeight']) scaleNumber(text, key, scale);
    if (el.type === 'text' && el.structuredText) {
      // HTML is the source of truth; discard the stale import cache.
      delete el.structuredText;
    }
  }
  if (el.type === 'table') {
    el.cellMinHeight *= scale;
    for (const row of el.data) for (const cell of row) {
      cell.text = scalePixels(cell.text, scale);
      if (cell.style?.fontsize) cell.style.fontsize = cell.style.fontsize.replace(/^(\d+(?:\.\d+)?)(px|pt)$/i, (_, value: string, unit: string) => `${Number(value) * scale}${unit}`);
    }
  }
  if (el.type === 'chart') el.options = { ...el.options, fontSize: (el.options?.fontSize ?? 12) * scale };
  if (el.type === 'code') el.fontSize *= scale;
  if (el.type === 'latex') el.strokeWidth *= scale;
  if ('outline' in el && el.outline) scaleNumber(el.outline, 'width', scale);
  if ('shadow' in el && el.shadow) for (const key of ['h', 'v', 'blur']) scaleNumber(el.shadow, key, scale);
}

/** Resize a deck without distorting media or changing reading order.
 * Uniformly scale content and typography, redistribute available space through
 * empty tracks, and keep decorative edge shapes attached to their canvas edge.
 * Overlaps, rotations, z-order and grouped compositions remain intact.
 */
export function resizeDeckSlides(slides: readonly Slide[], from: SlideCanvas, to: SlideCanvas): Slide[] {
  for (const n of [from.width, from.height, to.width, to.height]) {
    if (!Number.isFinite(n) || n <= 0) throw new Error('Canvas dimensions must be finite and positive.');
  }
  const result = structuredClone(slides) as Slide[];
  if (from.width === to.width && from.height === to.height) return result;
  for (const slide of result) {
    const groups = new Map<string, Bounds>();
    for (const el of slide.elements) {
      if ((el.type === 'line' && !el.groupId) || isBackdrop(el, from) || isDecor(el, from) || edgeBand(el, from)) continue;
      const key = el.groupId ?? el.id, box = bounds(el);
      groups.set(key, groups.has(key) ? union(groups.get(key)!, box) : box);
    }
    const boxes = [...groups.values()];
    const vertical = boxes.map(b => [b.top, b.bottom] as Interval);
    const { free } = axisTracks(vertical, from.height);
    // Width sets the preferred type size. Consume spare vertical gutters before
    // shrinking text; reversing a ratio change should not progressively shrink it.
    const minHeight = from.height - free + Math.min(free, from.height * 0.08);
    const body = bodyColumns(boxes, from);
    const scale = Math.min(to.width / from.width, to.height / Math.max(1, body?.minHeight ?? minHeight));
    const x = axisMap(boxes.map(b => [b.left, b.right]), from.width, to.width, scale);
    const y = axisMap(boxes.map(b => [b.top, b.bottom]), from.height, to.height, scale);
    const columnMaps = body?.columns.map(column => ({ ...column,
      map: axisMap(column.intervals, column.height, Math.max(1, to.height - (body.bodyTop + body.margin) * scale), scale),
    }));
    const mapY = (px: number, py: number) => {
      if (!body || !columnMaps) return y(py);
      if (py < body.bodyTop - 1) return py * scale;
      const column = columnMaps.find(c => px >= c.left - 1 && px <= c.right + 1);
      return column ? body.bodyTop * scale + column.map(py - body.bodyTop) : y(py);
    };
    for (const el of slide.elements) {
      if (el.type === 'shape' && isBackdrop(el, from)) { el.left = 0; el.top = 0; el.width = to.width; el.height = to.height; continue; }
      const band = edgeBand(el, from);
      if (el.type === 'shape' && band) {
        if (band === 'vertical') {
          el.width *= scale; el.height = to.height; el.top = 0;
          el.left = el.left < from.width / 2 ? 0 : to.width - el.width;
        } else {
          el.height *= scale; el.width = to.width; el.left = 0;
          el.top = el.top < from.height / 2 ? 0 : to.height - el.height;
        }
        scaleTypography(el, scale);
        continue;
      }
      const left = el.left, top = el.top;
      if (el.type === 'line') {
        // Remap connector geometry with the same tracks as its attached objects.
        const group = el.groupId ? groups.get(el.groupId) : undefined;
        const lineX = group ? (v: number) => x(group.left) + (v - group.left) * scale : x;
        const lineY = group ? (_px: number, v: number) => mapY(group.left, group.top) + (v - group.top) * scale : mapY;
        el.left = lineX(left); el.top = lineY(left, top); el.width *= scale;
        const point = (p: [number, number]): [number, number] => [lineX(left + p[0]) - el.left, lineY(left + p[0], top + p[1]) - el.top];
        el.start = point(el.start); el.end = point(el.end);
        if (el.broken) el.broken = point(el.broken);
        if (el.broken2) el.broken2 = point(el.broken2);
        if (el.curve) el.curve = point(el.curve);
        if (el.cubic) el.cubic = [point(el.cubic[0]), point(el.cubic[1])];
      } else if (isDecor(el, from)) {
        const cx = left + el.width / 2, cy = top + el.height / 2;
        el.left = cx > from.width / 2 ? to.width - (from.width - left) * scale : left * scale;
        el.top = cy > from.height / 2 ? to.height - (from.height - top) * scale : top * scale;
        el.width *= scale; el.height *= scale;
      } else {
        const box = groups.get(el.groupId ?? el.id)!;
        el.left = x(box.left) + (left - box.left) * scale;
        el.top = mapY(box.left, box.top) + (top - box.top) * scale;
        el.width *= scale; el.height *= scale;
      }
      scaleTypography(el, scale);
    }
  }
  return result;
}
