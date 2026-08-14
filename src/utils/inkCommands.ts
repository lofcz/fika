import type { MagicalInkId } from '@/configs/inkPaint';
import type { Gradient } from '@/types/slides';
import type { Command } from '@/utils/commandHistory';
export type ShapeType = 'rect' | 'circle' | 'arrow' | 'line' | 'triangle';
export type InkStrokePaint = {
  color: string;
  gradient?: Gradient;
  gradientId?: MagicalInkId;
};
export type PenStroke = InkStrokePaint & {
  kind: 'pen';
  size: number;
  points: Array<{
    x: number;
    y: number;
    pressure?: number;
  }>;
  simulatePressure?: boolean;
};
export type MarkStroke = InkStrokePaint & {
  kind: 'mark';
  size: number;
  points: Array<{
    x: number;
    y: number;
    pressure?: number;
  }>;
  simulatePressure?: boolean;
};
export type EraserStroke = {
  kind: 'eraser';
  size: number;
  points: Array<{
    x: number;
    y: number;
  }>;
};
export type ShapeStroke = InkStrokePaint & {
  kind: 'shape';
  shapeType: ShapeType;
  size: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};
export type Stroke = PenStroke | MarkStroke | EraserStroke | ShapeStroke;
export interface DrawingSurface {
  strokes: Stroke[];
  baseline: HTMLImageElement | null;
  redraw: () => void;
}
export const strokeHasInk = (stroke: Stroke) => {
  if (stroke.kind === 'shape') {
    return stroke.startX !== stroke.endX || stroke.startY !== stroke.endY;
  }
  return stroke.points.length >= 1;
};
export class AddStrokeCommand implements Command {
  constructor(private readonly surface: DrawingSurface, private readonly stroke: Stroke) {}
  do() {
    if (!this.surface.strokes.includes(this.stroke)) this.surface.strokes.push(this.stroke);
    this.surface.redraw();
  }
  undo() {
    const index = this.surface.strokes.indexOf(this.stroke);
    if (index >= 0) this.surface.strokes.splice(index, 1);
    this.surface.redraw();
  }
}
export class ClearInkCommand implements Command {
  private removedStrokes: Stroke[] = [];
  private removedBaseline: HTMLImageElement | null = null;
  constructor(private readonly surface: DrawingSurface) {}
  do() {
    this.removedStrokes = this.surface.strokes.slice();
    this.removedBaseline = this.surface.baseline;
    this.surface.strokes.length = 0;
    this.surface.baseline = null;
    this.surface.redraw();
  }
  undo() {
    this.surface.strokes.length = 0;
    this.surface.strokes.push(...this.removedStrokes);
    this.surface.baseline = this.removedBaseline;
    this.surface.redraw();
  }
}
