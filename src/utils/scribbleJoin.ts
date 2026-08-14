import { cloneGradient, paintKey, type MagicalInkId } from '@/configs/inkPaint';
import type { Gradient } from '@/types/slides';
import { nanoid } from 'nanoid';
import { getFreehandOutline, joinFreehandOutlines, type FreehandPoint } from '@/utils/freehand';
export type ScribbleInkStroke = {
  points: FreehandPoint[];
  size: number;
  color: string;
  gradient?: Gradient;
  gradientId?: MagicalInkId;
  simulatePressure?: boolean;
};
export type JoinedScribbleShape = {
  path: string;
  viewBox: [number, number];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  color: string;
  gradient?: Gradient;
  groupId?: string;
};
type BBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
const bboxFromOutline = (outline: number[][]): BBox | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outline) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY
  };
};
const overlapWithPad = (a: BBox, aPad: number, b: BBox, bPad: number) => {
  return !(a.maxX + aPad < b.minX - bPad || b.maxX + bPad < a.minX - aPad || a.maxY + aPad < b.minY - bPad || b.maxY + bPad < a.minY - aPad);
};
const joinPad = (size: number) => Math.max(size * 1.75, 16);

/**
 * Nearby strokes become one shape. Same-paint strokes in a cluster are merged
 * into a compound path; different colors/gradients in the same cluster share a groupId.
 */
export const joinScribbleInk = (strokes: ScribbleInkStroke[]): JoinedScribbleShape[] => {
  const prepared = strokes.flatMap(stroke => {
    const outline = getFreehandOutline(stroke.points, stroke.size, {
      simulatePressure: stroke.simulatePressure
    });
    const bbox = outline.length ? bboxFromOutline(outline) : null;
    if (!bbox) return [];
    return [{
      stroke,
      outline,
      bbox
    }];
  });
  if (!prepared.length) return [];
  const parent = prepared.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      if (overlapWithPad(prepared[i].bbox, joinPad(prepared[i].stroke.size), prepared[j].bbox, joinPad(prepared[j].stroke.size))) {
        unite(i, j);
      }
    }
  }
  const clusters = new Map<number, typeof prepared>();
  for (let i = 0; i < prepared.length; i++) {
    const root = find(i);
    const members = clusters.get(root);
    if (members) members.push(prepared[i]);else clusters.set(root, [prepared[i]]);
  }
  const shapes: JoinedScribbleShape[] = [];
  for (const members of clusters.values()) {
    const byPaint = new Map<string, typeof members>();
    for (const member of members) {
      const key = paintKey(member.stroke);
      const bucket = byPaint.get(key);
      if (bucket) bucket.push(member);else byPaint.set(key, [member]);
    }
    const groupId = byPaint.size > 1 ? nanoid(10) : undefined;
    for (const paintMembers of byPaint.values()) {
      const geometry = joinFreehandOutlines(paintMembers.map(member => member.outline));
      if (!geometry) continue;
      const first = paintMembers[0].stroke;
      shapes.push({
        ...geometry,
        color: first.color,
        gradient: first.gradient ? cloneGradient(first.gradient) : undefined,
        groupId
      });
    }
  }
  return shapes;
};
