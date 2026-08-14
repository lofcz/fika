import { boundsFromPoints, createCanvasPaint } from '@/configs/inkPaint';
import { fillFreehandStroke } from '@/utils/freehand';
import type { EraserStroke, MarkStroke, PenStroke, ShapeStroke, Stroke } from '@/utils/inkCommands';
export const appendEraserPoint = (points: Array<{
  x: number;
  y: number;
}>, x: number, y: number, size: number, force = false) => {
  const last = points[points.length - 1];
  if (!last) {
    points.push({
      x,
      y
    });
    return true;
  }
  if (!force) {
    const min = Math.max(1.25, size * 0.12);
    const dx = x - last.x;
    const dy = y - last.y;
    if (dx * dx + dy * dy < min * min) return false;
  } else if (last.x === x && last.y === y) {
    return false;
  }
  points.push({
    x,
    y
  });
  return true;
};
const drawPenStroke = (ctx: CanvasRenderingContext2D, stroke: PenStroke, last = true) => {
  fillFreehandStroke(ctx, stroke.points, stroke.size, stroke.color, {
    last,
    simulatePressure: stroke.simulatePressure,
    gradient: stroke.gradient
  });
};
const drawMarkStroke = (ctx: CanvasRenderingContext2D, stroke: MarkStroke, last = true) => {
  fillFreehandStroke(ctx, stroke.points, stroke.size, stroke.color, {
    last,
    thinning: 0,
    alpha: 0.5,
    composite: 'xor',
    simulatePressure: false,
    gradient: stroke.gradient
  });
};
const drawEraserStroke = (ctx: CanvasRenderingContext2D, _canvas: HTMLCanvasElement, stroke: EraserStroke) => {
  const points = stroke.points;
  if (!points.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.size;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
};
export const drawShapeStroke = (ctx: CanvasRenderingContext2D, stroke: ShapeStroke) => {
  const {
    startX,
    startY,
    endX,
    endY
  } = stroke;
  const paint = createCanvasPaint(ctx, stroke, boundsFromPoints([{
    x: startX,
    y: startY
  }, {
    x: endX,
    y: endY
  }], stroke.size));
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = paint;
  ctx.lineWidth = stroke.size;
  ctx.beginPath();
  if (stroke.shapeType === 'rect') {
    ctx.rect(startX, startY, endX - startX, endY - startY);
  } else if (stroke.shapeType === 'circle') {
    const width = endX - startX;
    const height = endY - startY;
    ctx.arc(startX + width / 2, startY + height / 2, Math.min(Math.abs(width), Math.abs(height)) / 2, 0, Math.PI * 2);
  } else if (stroke.shapeType === 'line' || stroke.shapeType === 'arrow') {
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);
    const inset = stroke.shapeType === 'arrow' ? Math.max(stroke.size, 4) * 2 : 0;
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX - Math.cos(angle) * inset, endY - Math.sin(angle) * inset);
  } else if (stroke.shapeType === 'triangle') {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    ctx.moveTo((minX + maxX) / 2, minY);
    ctx.lineTo(maxX, maxY);
    ctx.lineTo(minX, maxY);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
  if (stroke.shapeType !== 'arrow') return;
  const dx = endX - startX;
  const dy = endY - startY;
  const angle = Math.atan2(dy, dx);
  const arrowLength = Math.max(stroke.size, 4) * 2.6;
  const arrowWidth = Math.max(stroke.size, 4) * 1.6;
  const arrowBaseX = endX - Math.cos(angle) * arrowLength;
  const arrowBaseY = endY - Math.sin(angle) * arrowLength;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(arrowBaseX + arrowWidth * Math.cos(angle + Math.PI / 2), arrowBaseY + arrowWidth * Math.sin(angle + Math.PI / 2));
  ctx.lineTo(arrowBaseX + arrowWidth * Math.cos(angle - Math.PI / 2), arrowBaseY + arrowWidth * Math.sin(angle - Math.PI / 2));
  ctx.closePath();
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.restore();
};
export const renderStroke = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, stroke: Stroke, last = true) => {
  if (stroke.kind === 'pen') drawPenStroke(ctx, stroke, last);else if (stroke.kind === 'mark') drawMarkStroke(ctx, stroke, last);else if (stroke.kind === 'eraser') drawEraserStroke(ctx, canvas, stroke);else drawShapeStroke(ctx, stroke);
};
