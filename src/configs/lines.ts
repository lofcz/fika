import type { LinePoint, LineStyleType } from '@/types/slides';
export interface LinePoolItem {
  path: string;
  style: LineStyleType;
  points: [LinePoint, LinePoint];
  isBroken?: boolean;
  isBroken2?: boolean;
  isCurve?: boolean;
  isCubic?: boolean;
}
export type LineCategoryKey = 'straight' | 'polyCurve';
interface PresetLine {
  type: LineCategoryKey;
  children: LinePoolItem[];
}

/**
 * Structural line presets. Category labels are resolved at render time via i18n
 * (see LinePool) so they follow the active locale — not the locale at module load.
 */
export const LINE_LIST: PresetLine[] = [{
  type: 'straight',
  children: [{
    path: 'M 0 0 L 20 20',
    style: 'solid',
    points: ['', '']
  }, {
    path: 'M 0 0 L 20 20',
    style: 'dashed',
    points: ['', '']
  }, {
    path: 'M 0 0 L 20 20',
    style: 'solid',
    points: ['', 'arrow']
  }, {
    path: 'M 0 0 L 20 20',
    style: 'dashed',
    points: ['', 'arrow']
  }, {
    path: 'M 0 0 L 20 20',
    style: 'solid',
    points: ['', 'dot']
  }]
}, {
  type: 'polyCurve',
  children: [{
    path: 'M 0 0 L 0 20 L 20 20',
    style: 'solid',
    points: ['', 'arrow'],
    isBroken: true
  }, {
    path: 'M 0 0 L 10 0 L 10 20 L 20 20',
    style: 'solid',
    points: ['', 'arrow'],
    isBroken2: true
  }, {
    path: 'M 0 0 Q 0 20 20 20',
    style: 'solid',
    points: ['', 'arrow'],
    isCurve: true
  }, {
    path: 'M 0 0 C 20 0 0 20 20 20',
    style: 'solid',
    points: ['', 'arrow'],
    isCubic: true
  }]
}];
