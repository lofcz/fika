import tinycolor from 'tinycolor2';
import { nanoid } from 'nanoid';
import { TABLE_PAPER, TABLE_PAPER_STRIPE } from '@/configs/table';
import type { LinePoint, PPTElement, PPTLineElement, Slide } from '@/types/slides';
interface RotatedElementData {
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
}
interface Point {
  x: number;
  y: number;
}
interface AbsoluteLinePoints {
  start: Point;
  end: Point;
  broken?: Point;
  broken2?: Point;
  curve?: Point;
  cubic?: [Point, Point];
}
interface IdMap {
  [id: string]: string;
}

/**
 * Bounding box of an element's rect after rotation on the canvas.
 * @param element Position, size, and rotation of the element
 */
export const getRectRotatedRange = (element: RotatedElementData) => {
  const {
    left,
    top,
    width,
    height,
    rotate = 0
  } = element;
  const radius = Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2)) / 2;
  const auxiliaryAngle = Math.atan(height / width) * 180 / Math.PI;
  const tlbraRadian = (180 - rotate - auxiliaryAngle) * Math.PI / 180;
  const trblaRadian = (auxiliaryAngle - rotate) * Math.PI / 180;
  const middleLeft = left + width / 2;
  const middleTop = top + height / 2;
  const xAxis = [middleLeft + radius * Math.cos(tlbraRadian), middleLeft + radius * Math.cos(trblaRadian), middleLeft - radius * Math.cos(tlbraRadian), middleLeft - radius * Math.cos(trblaRadian)];
  const yAxis = [middleTop - radius * Math.sin(tlbraRadian), middleTop - radius * Math.sin(trblaRadian), middleTop + radius * Math.sin(tlbraRadian), middleTop + radius * Math.sin(trblaRadian)];
  return {
    xRange: [Math.min(...xAxis), Math.max(...xAxis)],
    yRange: [Math.min(...yAxis), Math.max(...yAxis)]
  };
};

/**
 * Offset between an element's axis-aligned bounds before and after rotation.
 * @param element Position, size, and rotation of the element
 */
export const getRectRotatedOffset = (element: RotatedElementData) => {
  const {
    xRange: originXRange,
    yRange: originYRange
  } = getRectRotatedRange({
    left: element.left,
    top: element.top,
    width: element.width,
    height: element.height,
    rotate: 0
  });
  const {
    xRange: rotatedXRange,
    yRange: rotatedYRange
  } = getRectRotatedRange({
    left: element.left,
    top: element.top,
    width: element.width,
    height: element.height,
    rotate: element.rotate
  });
  return {
    offsetX: rotatedXRange[0] - originXRange[0],
    offsetY: rotatedYRange[0] - originYRange[0]
  };
};

/**
 * Local control points that define a line's painted path.
 * Includes elbows so a bent/curved stroke is never clipped to the start–end chord.
 */
export const getLineLocalPoints = (element: PPTLineElement): [number, number][] => {
  const points: [number, number][] = [element.start, element.end];
  if (element.broken) points.push(element.broken);
  if (element.broken2) points.push(element.broken2);
  if (element.curve) points.push(element.curve);
  if (element.cubic) points.push(element.cubic[0], element.cubic[1]);
  return points;
};

/**
 * Axis-aligned bounds of a single element on the canvas.
 * @param element Element data
 */
export const getElementRange = (element: PPTElement) => {
  let minX, maxX, minY, maxY;
  if (element.type === 'line') {
    const points = getLineLocalPoints(element);
    let minLocalX = Infinity;
    let maxLocalX = -Infinity;
    let minLocalY = Infinity;
    let maxLocalY = -Infinity;
    for (const point of points) {
      minLocalX = Math.min(minLocalX, point[0]);
      maxLocalX = Math.max(maxLocalX, point[0]);
      minLocalY = Math.min(minLocalY, point[1]);
      maxLocalY = Math.max(maxLocalY, point[1]);
    }
    minX = element.left + minLocalX;
    maxX = element.left + maxLocalX;
    minY = element.top + minLocalY;
    maxY = element.top + maxLocalY;
  } else if ('rotate' in element && element.rotate) {
    const {
      left,
      top,
      width,
      height,
      rotate
    } = element;
    const {
      xRange,
      yRange
    } = getRectRotatedRange({
      left,
      top,
      width,
      height,
      rotate
    });
    minX = xRange[0];
    maxX = xRange[1];
    minY = yRange[0];
    maxY = yRange[1];
  } else {
    minX = element.left;
    maxX = element.left + element.width;
    minY = element.top;
    maxY = element.top + element.height;
  }
  return {
    minX,
    maxX,
    minY,
    maxY
  };
};

export type ElementRangeAlign = {
  minX?: number
  maxX?: number
  centerX?: number
  minY?: number
  maxY?: number
  centerY?: number
}

/**
 * Shift left/top so the element's painted AABB matches the given edges or centers.
 * Lines use control-point bounds, not the start–end chord.
 */
export const alignElementToRange = (element: PPTElement, target: ElementRangeAlign) => {
  const range = getElementRange(element);
  let dx = 0;
  let dy = 0;
  if (target.minX !== undefined) dx = target.minX - range.minX;
  else if (target.maxX !== undefined) dx = target.maxX - range.maxX;
  else if (target.centerX !== undefined) dx = target.centerX - (range.minX + range.maxX) / 2;
  if (target.minY !== undefined) dy = target.minY - range.minY;
  else if (target.maxY !== undefined) dy = target.maxY - range.maxY;
  else if (target.centerY !== undefined) dy = target.centerY - (range.minY + range.maxY) / 2;
  element.left += dx;
  element.top += dy;
};

/**
 * Combined axis-aligned bounds of multiple elements on the canvas.
 * @param elementList Elements to measure
 */
export const getElementListRange = (elementList: PPTElement[]) => {
  const leftValues: number[] = [];
  const topValues: number[] = [];
  const rightValues: number[] = [];
  const bottomValues: number[] = [];
  elementList.forEach(element => {
    const {
      minX,
      maxX,
      minY,
      maxY
    } = getElementRange(element);
    leftValues.push(minX);
    topValues.push(minY);
    rightValues.push(maxX);
    bottomValues.push(maxY);
  });
  const minX = Math.min(...leftValues);
  const maxX = Math.max(...rightValues);
  const minY = Math.min(...topValues);
  const maxY = Math.max(...bottomValues);
  return {
    minX,
    maxX,
    minY,
    maxY
  };
};
const ROTATABLE_GROUP_ELEMENT_TYPES = ['text', 'image', 'shape', 'line'];

/**
 * Whether the selection is the full membership of a single group.
 * @param elements Selected elements
 */
export const isSingleGroupSelection = (elements: PPTElement[]) => {
  if (elements.length < 2) return false;
  const groupId = elements[0].groupId;
  if (!groupId) return false;
  return elements.every(element => element.groupId === groupId);
};

/**
 * Whether the group can be rotated as a unit.
 * @param elements Group members
 */
export const canRotateGroupElements = (elements: PPTElement[]) => {
  if (!isSingleGroupSelection(elements)) return false;
  return elements.every(element => {
    if (!ROTATABLE_GROUP_ELEMENT_TYPES.includes(element.type)) return false;
    return true;
  });
};

/**
 * Center of the combined bounds of a set of elements.
 * @param elements Elements in the group
 * @param rotate Reference rotation: bounds are aligned to this angle before computing the center
 */
export const getGroupElementCenter = (elements: PPTElement[], rotate = 0) => {
  const {
    minX,
    maxX,
    minY,
    maxY
  } = getElementListRangeByRotate(elements, rotate);
  const alignedCenter = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2
  };
  if (!rotate) return alignedCenter;
  return rotatePoint(alignedCenter, {
    x: 0,
    y: 0
  }, rotate);
};

/**
 * Absolute canvas coordinates of the four corners of a rect-like element.
 * @param element Rect-like element (non-line)
 */
const getRectElementPoints = (element: Exclude<PPTElement, PPTLineElement>) => {
  const center = {
    x: element.left + element.width / 2,
    y: element.top + element.height / 2
  };
  const points = [{
    x: center.x - element.width / 2,
    y: center.y - element.height / 2
  }, {
    x: center.x + element.width / 2,
    y: center.y - element.height / 2
  }, {
    x: center.x + element.width / 2,
    y: center.y + element.height / 2
  }, {
    x: center.x - element.width / 2,
    y: center.y + element.height / 2
  }];
  if (!element.rotate) return points;
  return points.map(point => rotatePoint(point, center, element.rotate));
};

/**
 * Absolute points of a line element used for bounds calculation.
 * @param element Line element
 */
const getAbsoluteLinePointList = (element: PPTLineElement) => {
  return getLineLocalPoints(element).map(point => ({
    x: element.left + point[0],
    y: element.top + point[1],
  }));
};

/**
 * Combined bounds of elements after aligning to a reference rotation.
 * @param elements Elements to measure
 * @param rotate Reference rotation angle for the group
 */
const getElementListRangeByRotate = (elements: PPTElement[], rotate: number) => {
  const xValues: number[] = [];
  const yValues: number[] = [];
  elements.forEach(element => {
    const points = element.type === 'line' ? getAbsoluteLinePointList(element) : getRectElementPoints(element);
    const rotatedPoints = rotate ? points.map(point => rotatePoint(point, {
      x: 0,
      y: 0
    }, -rotate)) : points;
    xValues.push(...rotatedPoints.map(point => point.x));
    yValues.push(...rotatedPoints.map(point => point.y));
  });
  return {
    minX: Math.min(...xValues),
    maxX: Math.max(...xValues),
    minY: Math.min(...yValues),
    maxY: Math.max(...yValues)
  };
};

/**
 * Normalize an angle to the [-180, 180] range.
 * @param angle Angle in degrees
 */
export const normalizeAngle = (angle: number) => {
  let result = angle;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return result;
};

/**
 * Rotate a point around a center by the given angle.
 * @param point Point to rotate
 * @param center Rotation center
 * @param angle Rotation in degrees
 */
export const rotatePoint = (point: Point, center: Point, angle: number): Point => {
  const radian = angle * Math.PI / 180;
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;
  return {
    x: center.x + deltaX * Math.cos(radian) - deltaY * Math.sin(radian),
    y: center.y + deltaX * Math.sin(radian) + deltaY * Math.cos(radian)
  };
};

/**
 * Rotate a rect-like element by rotating its center and adding to `rotate`.
 * @param element Element to rotate
 * @param center Group rotation center
 * @param angle Rotation in degrees
 */
export const rotateRectLikeElement = (element: Exclude<PPTElement, PPTLineElement>, center: Point, angle: number) => {
  const elementCenter = {
    x: element.left + element.width / 2,
    y: element.top + element.height / 2
  };
  const nextCenter = rotatePoint(elementCenter, center, angle);
  return {
    ...element,
    left: nextCenter.x - element.width / 2,
    top: nextCenter.y - element.height / 2,
    rotate: normalizeAngle(element.rotate + angle)
  };
};

/**
 * Convert a line element's control points to absolute canvas coordinates.
 * @param element Line element
 */
const getAbsoluteLinePoints = (element: PPTLineElement): AbsoluteLinePoints => {
  const toAbsolutePoint = (point: [number, number]) => ({
    x: element.left + point[0],
    y: element.top + point[1]
  });
  const points: AbsoluteLinePoints = {
    start: toAbsolutePoint(element.start),
    end: toAbsolutePoint(element.end)
  };
  if (element.broken) points.broken = toAbsolutePoint(element.broken);
  if (element.broken2) points.broken2 = toAbsolutePoint(element.broken2);
  if (element.curve) points.curve = toAbsolutePoint(element.curve);
  if (element.cubic) {
    points.cubic = [toAbsolutePoint(element.cubic[0]), toAbsolutePoint(element.cubic[1])];
  }
  return points;
};

/**
 * Rotate all absolute control points of a line around a center.
 * @param points Absolute line control points
 * @param center Group rotation center
 * @param angle Rotation in degrees
 */
const rotateAbsoluteLinePoints = (points: AbsoluteLinePoints, center: Point, angle: number): AbsoluteLinePoints => {
  const rotated: AbsoluteLinePoints = {
    start: rotatePoint(points.start, center, angle),
    end: rotatePoint(points.end, center, angle)
  };
  if (points.broken) rotated.broken = rotatePoint(points.broken, center, angle);
  if (points.broken2) rotated.broken2 = rotatePoint(points.broken2, center, angle);
  if (points.curve) rotated.curve = rotatePoint(points.curve, center, angle);
  if (points.cubic) {
    rotated.cubic = [rotatePoint(points.cubic[0], center, angle), rotatePoint(points.cubic[1], center, angle)];
  }
  return rotated;
};

/**
 * Rebuild a line element from rotated absolute control points.
 * @param element Original line element
 * @param points Rotated absolute control points
 */
const rebuildLineElement = (element: PPTLineElement, points: AbsoluteLinePoints): PPTLineElement => {
  const allPoints = [points.start, points.end];
  if (points.broken) allPoints.push(points.broken);
  if (points.broken2) allPoints.push(points.broken2);
  if (points.curve) allPoints.push(points.curve);
  if (points.cubic) allPoints.push(...points.cubic);
  const left = Math.min(...allPoints.map(point => point.x));
  const top = Math.min(...allPoints.map(point => point.y));
  const toRelativePoint = (point: Point): [number, number] => [point.x - left, point.y - top];
  const nextElement: PPTLineElement = {
    ...element,
    left,
    top,
    start: toRelativePoint(points.start),
    end: toRelativePoint(points.end)
  };
  if (points.broken) nextElement.broken = toRelativePoint(points.broken);else delete nextElement.broken;
  if (points.broken2) nextElement.broken2 = toRelativePoint(points.broken2);else delete nextElement.broken2;
  if (points.curve) nextElement.curve = toRelativePoint(points.curve);else delete nextElement.curve;
  if (points.cubic) {
    nextElement.cubic = [toRelativePoint(points.cubic[0]), toRelativePoint(points.cubic[1])];
  } else delete nextElement.cubic;
  return nextElement;
};

/**
 * Rotate a line element by rotating all control points and rebuilding line data.
 * @param element Line element
 * @param center Group rotation center
 * @param angle Rotation in degrees
 */
export const rotateLineElement = (element: PPTLineElement, center: Point, angle: number) => {
  const absolutePoints = getAbsoluteLinePoints(element);
  const rotatedPoints = rotateAbsoluteLinePoints(absolutePoints, center, angle);
  return rebuildLineElement(element, rotatedPoints);
};
export const getLineElementLength = (element: PPTLineElement) => {
  const deltaX = element.end[0] - element.start[0];
  const deltaY = element.end[1] - element.start[1];
  const len = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  return len;
};
export const getBroken2LineDirection = (element: PPTLineElement) => {
  if (element.broken2Direction) return element.broken2Direction;
  const {
    minX,
    maxX,
    minY,
    maxY
  } = getElementRange(element);
  return maxX - minX >= maxY - minY ? 'horizontal' : 'vertical';
};
export interface AlignLine {
  value: number;
  range: [number, number];
}

/**
 * Deduplicate alignment snap lines at the same position; merge their ranges to min/max.
 * @param lines Alignment snap lines
 */
export const uniqAlignLines = (lines: AlignLine[]) => {
  const uniqLines: AlignLine[] = [];
  lines.forEach(line => {
    const index = uniqLines.findIndex(_line => _line.value === line.value);
    if (index === -1) uniqLines.push(line);else {
      const uniqLine = uniqLines[index];
      const rangeMin = Math.min(uniqLine.range[0], line.range[0]);
      const rangeMax = Math.max(uniqLine.range[1], line.range[1]);
      const range: [number, number] = [rangeMin, rangeMax];
      const _line = {
        value: line.value,
        range
      };
      uniqLines[index] = _line;
    }
  });
  return uniqLines;
};

/**
 * Map each slide id to a new id (used when duplicating slides to preserve references).
 * @param slides Slide list
 */
export const createSlideIdMap = (slides: Slide[]) => {
  const slideIdMap: IdMap = {};
  for (const slide of slides) {
    slideIdMap[slide.id] = nanoid(10);
  }
  return slideIdMap;
};

/**
   * Map each element (and group) id to a new id when copying elements.
   * e.g. two grouped elements keep the same new groupId after copy.
   * @param elements Element list
   */
export const createElementIdMap = (elements: PPTElement[]) => {
  const groupIdMap: IdMap = {};
  const elIdMap: IdMap = {};
  for (const element of elements) {
    const groupId = element.groupId;
    if (groupId && !groupIdMap[groupId]) {
      groupIdMap[groupId] = nanoid(10);
    }
    elIdMap[element.id] = nanoid(10);
  }
  return {
    groupIdMap,
    elIdMap
  };
};

/**
 * Header is the opaque theme color (ink by default). Body stripes are a fixed
 * zinc paper pair so a blue accent can never wash the grid.
 */
export const getTableThemeColors = (themeColor: string) => {
  const header = tinycolor(themeColor);
  if (!header.isValid()) {
    return {
      header: '#18181b',
      stripe: TABLE_PAPER_STRIPE,
      stripeAlt: TABLE_PAPER
    };
  }
  return {
    header: header.clone().setAlpha(1).toHexString(),
    stripe: TABLE_PAPER_STRIPE,
    stripeAlt: TABLE_PAPER
  };
};

/**
 * SVG path `d` attribute for a line element (logical geometry).
 * @param element Line element
 */
export const getLineElementPath = (element: PPTLineElement) => {
  const start = element.start.join(',');
  const end = element.end.join(',');
  if (element.broken) {
    const mid = element.broken.join(',');
    return `M${start} L${mid} L${end}`;
  } else if (element.broken2) {
    const direction = getBroken2LineDirection(element);
    if (direction === 'horizontal') return `M${start} L${element.broken2[0]},${element.start[1]} L${element.broken2[0]},${element.end[1]} ${end}`;
    return `M${start} L${element.start[0]},${element.broken2[1]} L${element.end[0]},${element.broken2[1]} ${end}`;
  } else if (element.curve) {
    const mid = element.curve.join(',');
    return `M${start} Q${mid} ${end}`;
  } else if (element.cubic) {
    const [c1, c2] = element.cubic;
    const p1 = c1.join(',');
    const p2 = c2.join(',');
    return `M${start} C${p1} ${p2} ${end}`;
  }
  return `M${start} L${end}`;
};

/**
 * Inset distance for the visible stroke at a line endpoint (by cap type and width).
 * @param point Line endpoint style
 * @param width Line width
 */
const getLinePointRetractionOffset = (point: LinePoint, width: number) => {
  const size = width < 2 ? 2 : width;
  if (point === 'arrow') return size;
  if (point === 'dot') return size / 2;
  return 0;
};

/**
 * Distance between two line control points.
 * @param p1 First point
 * @param p2 Second point
 */
const getLinePointDistance = (p1: [number, number], p2: [number, number]) => {
  const deltaX = p2[0] - p1[0];
  const deltaY = p2[1] - p1[1];
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

/**
 * Move a line control point toward a target by a fixed offset distance.
 * @param point Current point
 * @param target Target point
 * @param offset Distance to move
 */
const getLinePointByOffset = (point: [number, number], target: [number, number], offset: number) => {
  const distance = getLinePointDistance(point, target);
  if (!distance) return point;
  const ratio = offset / distance;
  return [point[0] + (target[0] - point[0]) * ratio, point[1] + (target[1] - point[1]) * ratio] as [number, number];
};

/**
 * Adjacent control points at the start/end of a line path (for endpoint inset direction).
 * @param element Line element
 */
const getLinePathTurningPoints = (element: PPTLineElement) => {
  if (element.broken) return [element.broken];
  if (element.broken2) {
    const direction = getBroken2LineDirection(element);
    if (direction === 'horizontal') {
      return [[element.broken2[0], element.start[1]], [element.broken2[0], element.end[1]]] as [number, number][];
    }
    return [[element.start[0], element.broken2[1]], [element.end[0], element.broken2[1]]] as [number, number][];
  }
  if (element.curve) return [element.curve];
  if (element.cubic) return [element.cubic[0], element.cubic[1]];
  return [];
};

/**
 * SVG path for rendering a line: markers stay at original start/end; stroke is inset at caps.
 * @param element Line element
 */
export const getLineElementRenderPath = (element: PPTLineElement) => {
  const turningPoints = getLinePathTurningPoints(element);
  let start = element.start;
  let end = element.end;
  const startOffset = getLinePointRetractionOffset(element.points[0], element.width);
  const endOffset = getLinePointRetractionOffset(element.points[1], element.width);
  if (startOffset) {
    const nextPoint = turningPoints[0] || element.end;
    const offset = Math.min(startOffset, getLinePointDistance(element.start, nextPoint) / 2);
    start = getLinePointByOffset(element.start, nextPoint, offset);
  }
  if (endOffset) {
    const prevPoint = turningPoints[turningPoints.length - 1] || element.start;
    const offset = Math.min(endOffset, getLinePointDistance(prevPoint, element.end) / 2);
    end = getLinePointByOffset(element.end, prevPoint, offset);
  }
  const startPoint = start.join(',');
  const endPoint = end.join(',');
  if (element.broken) {
    const mid = element.broken.join(',');
    return `M${startPoint} L${mid} L${endPoint}`;
  } else if (element.broken2) {
    const direction = getBroken2LineDirection(element);
    if (direction === 'horizontal') return `M${startPoint} L${element.broken2[0]},${element.start[1]} L${element.broken2[0]},${element.end[1]} ${endPoint}`;
    return `M${startPoint} L${element.start[0]},${element.broken2[1]} L${element.end[0]},${element.broken2[1]} ${endPoint}`;
  } else if (element.curve) {
    const mid = element.curve.join(',');
    return `M${startPoint} Q${mid} ${endPoint}`;
  } else if (element.cubic) {
    const [c1, c2] = element.cubic;
    const p1 = c1.join(',');
    const p2 = c2.join(',');
    return `M${startPoint} C${p1} ${p2} ${endPoint}`;
  }
  return `M${startPoint} L${endPoint}`;
};

/**
 * Whether an element is fully visible within a scroll parent's viewport (vertical).
 * @param element DOM element
 * @param parent Scroll container
 */
export const isElementInViewport = (element: HTMLElement, parent: HTMLElement): boolean => {
  const elementRect = element.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return elementRect.top >= parentRect.top && elementRect.bottom <= parentRect.bottom;
};
