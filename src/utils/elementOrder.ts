import { frameAncestors, frameDescendantIds } from './nestedFrames'
import type { PPTElement } from '@/types/slides';
export type ElementOrderCommand = 'up' | 'down' | 'top' | 'bottom';

/**
 * Excel-style z-order: a group (or multi-selection) moves as one block,
 * keeping members' relative order. Neighboring groups are skipped as a unit.
 */
export function collectOrderUnitIds(elementList: PPTElement[], seedIds: string[]): string[] {
  const seed = new Set(seedIds);
  const groupIds = new Set<string>();
  for (const el of elementList) {
    if (seed.has(el.id) && el.groupId) groupIds.add(el.groupId);
  }
  const unit = new Set<string>();
  for (const el of elementList) {
    if (seed.has(el.id) || el.groupId && groupIds.has(el.groupId)) unit.add(el.id);
  }
  const expanded = new Set(frameDescendantIds(elementList, [...unit]));
  return elementList.filter(el => expanded.has(el.id)).map(el => el.id);
}
function extractUnit(list: PPTElement[], unitIds: string[]): {
  rest: PPTElement[];
  unit: PPTElement[];
} {
  const idSet = new Set(unitIds);
  const unit: PPTElement[] = [];
  const rest: PPTElement[] = [];
  for (const el of list) {
    if (idSet.has(el.id)) unit.push(el);else rest.push(el);
  }
  return {
    rest,
    unit
  };
}
function neighboringUnitIds(list: PPTElement[], neighbor: PPTElement, movingIds: string[]): string[] {
  const moving = new Set(movingIds);
  const sharedFrames = new Set(list.filter(el => moving.has(el.id)).flatMap(el => frameAncestors(el, list).map(frame => frame.id)));
  const ancestors = frameAncestors(neighbor, list).filter(frame => !sharedFrames.has(frame.id));
  const root = ancestors.at(-1) || neighbor;
  // A shared parent is not a neighboring frame unit.
  if (sharedFrames.has(root.id)) return [root.id];
  return collectOrderUnitIds(list, [root.id]);
}
function unitIndexRange(list: PPTElement[], unitIds: string[]): {
  first: number;
  last: number;
} {
  const idSet = new Set(unitIds);
  let first = -1;
  let last = -1;
  for (let i = 0; i < list.length; i++) {
    if (!idSet.has(list[i].id)) continue;
    if (first === -1) first = i;
    last = i;
  }
  return {
    first,
    last
  };
}
export function orderElementList(elementList: PPTElement[], seedIds: string[], command: ElementOrderCommand): PPTElement[] | null {
  const unitIds = collectOrderUnitIds(elementList, seedIds);
  if (!unitIds.length) return null;
  const {
    first,
    last
  } = unitIndexRange(elementList, unitIds);
  if (first < 0) return null;
  if (command === 'top') {
    if (first === elementList.length - unitIds.length) return null;
    const {
      rest,
      unit
    } = extractUnit(elementList, unitIds);
    return [...rest, ...unit];
  }
  if (command === 'bottom') {
    if (last === unitIds.length - 1) return null;
    const {
      rest,
      unit
    } = extractUnit(elementList, unitIds);
    return [...unit, ...rest];
  }
  if (command === 'up') {
    if (last === elementList.length - 1) return null;
    const nextStart = last + 1;
    const nextIds = neighboringUnitIds(elementList, elementList[nextStart], unitIds);
    const {
      rest,
      unit
    } = extractUnit(elementList, unitIds);
    const insertAt = unitIndexRange(rest, nextIds).last + 1;
    return [...rest.slice(0, insertAt), ...unit, ...rest.slice(insertAt)];
  }
  if (command === 'down') {
    if (first === 0) return null;
    const prevEnd = first - 1;
    const prevIds = neighboringUnitIds(elementList, elementList[prevEnd], unitIds);
    const {
      rest,
      unit
    } = extractUnit(elementList, unitIds);
    const insertAt = unitIndexRange(rest, prevIds).first;
    return [...rest.slice(0, insertAt), ...unit, ...rest.slice(insertAt)];
  }
  return null;
}
