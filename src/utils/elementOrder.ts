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
  return elementList.filter(el => unit.has(el.id)).map(el => el.id);
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
function nextUnitLength(list: PPTElement[], startIndex: number): number {
  const el = list[startIndex];
  if (!el) return 0;
  if (!el.groupId) return 1;
  let count = 0;
  for (let i = startIndex; i < list.length; i++) {
    if (list[i].groupId === el.groupId) count++;else break;
  }
  return count;
}
function prevUnitLength(list: PPTElement[], endIndex: number): number {
  const el = list[endIndex];
  if (!el) return 0;
  if (!el.groupId) return 1;
  let count = 0;
  for (let i = endIndex; i >= 0; i--) {
    if (list[i].groupId === el.groupId) count++;else break;
  }
  return count;
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
    if (last === elementList.length - 1) return null;
    const {
      rest,
      unit
    } = extractUnit(elementList, unitIds);
    return [...rest, ...unit];
  }
  if (command === 'bottom') {
    if (first === 0) return null;
    const {
      rest,
      unit
    } = extractUnit(elementList, unitIds);
    return [...unit, ...rest];
  }
  if (command === 'up') {
    if (last === elementList.length - 1) return null;
    const nextStart = last + 1;
    const skip = nextUnitLength(elementList, nextStart);
    const nextFirst = elementList[nextStart];
    const {
      rest,
      unit
    } = extractUnit(elementList, unitIds);
    const insertAt = rest.findIndex(el => el.id === nextFirst.id) + skip;
    return [...rest.slice(0, insertAt), ...unit, ...rest.slice(insertAt)];
  }
  if (command === 'down') {
    if (first === 0) return null;
    const prevEnd = first - 1;
    const skip = prevUnitLength(elementList, prevEnd);
    const prevStart = elementList[prevEnd - skip + 1];
    const {
      rest,
      unit
    } = extractUnit(elementList, unitIds);
    const insertAt = rest.findIndex(el => el.id === prevStart.id);
    return [...rest.slice(0, insertAt), ...unit, ...rest.slice(insertAt)];
  }
  return null;
}
