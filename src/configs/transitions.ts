import type { TurningGroup, TurningMode } from '@/types/slides'

export type SlideTransitionExport = {
  type: string
  direction?: string
  duration?: number
  thruBlk?: boolean
}

export type SlideTransitionDef = {
  value: TurningMode
  group: TurningGroup
  /** Shown in the Transition panel. Legacy modes stay playable/exportable. */
  picker: boolean
  /** Included when turningMode is `random`. */
  randomPool: boolean
  duration: number
  export?: SlideTransitionExport
}

const fade = (duration: number, extra: Partial<SlideTransitionExport> = {}): SlideTransitionExport => ({
  type: 'fade',
  duration,
  ...extra,
})

/** Curated ink-style transitions first; legacy keys remain for existing decks. */
export const SLIDE_TRANSITION_DEFS: SlideTransitionDef[] = [
  { value: 'no', group: 'atmosphere', picker: true, randomPool: false, duration: 0 },
  { value: 'fade', group: 'atmosphere', picker: true, randomPool: true, duration: 700, export: fade(700) },
  { value: 'throughInk', group: 'atmosphere', picker: true, randomPool: true, duration: 1100, export: fade(1100, { thruBlk: true }) },
  { value: 'dissolve', group: 'atmosphere', picker: true, randomPool: true, duration: 950, export: { type: 'dissolve', duration: 950 } },
  { value: 'slideX', group: 'motion', picker: true, randomPool: true, duration: 700, export: { type: 'push', direction: 'l', duration: 700 } },
  { value: 'slideY', group: 'motion', picker: true, randomPool: true, duration: 700, export: { type: 'push', direction: 'u', duration: 700 } },
  { value: 'wipe', group: 'motion', picker: true, randomPool: true, duration: 750, export: { type: 'wipe', direction: 'l', duration: 750 } },
  { value: 'reveal', group: 'motion', picker: true, randomPool: true, duration: 750, export: { type: 'reveal', direction: 'r', duration: 750 } },
  { value: 'scale', group: 'depth', picker: true, randomPool: true, duration: 800, export: { type: 'zoom', direction: 'in', duration: 800 } },
  { value: 'morph', group: 'depth', picker: true, randomPool: true, duration: 900, export: { type: 'morph', duration: 900 } },
  { value: 'ripple', group: 'depth', picker: true, randomPool: true, duration: 950, export: { type: 'ripple', duration: 950 } },
  { value: 'doors', group: 'depth', picker: true, randomPool: true, duration: 800, export: { type: 'doors', direction: 'vert', duration: 800 } },
  { value: 'flythrough', group: 'depth', picker: true, randomPool: true, duration: 1000, export: { type: 'flythrough', direction: 'in', duration: 1000 } },
  { value: 'random', group: 'depth', picker: true, randomPool: false, duration: 700, export: { type: 'random' } },
  { value: 'scaleReverse', group: 'classic', picker: false, randomPool: false, duration: 800, export: { type: 'zoom', direction: 'out', duration: 800 } },
  { value: 'slideX3D', group: 'classic', picker: false, randomPool: false, duration: 850, export: { type: 'flip', direction: 'r', duration: 850 } },
  { value: 'slideY3D', group: 'classic', picker: false, randomPool: false, duration: 850, export: { type: 'flip', direction: 'u', duration: 850 } },
  { value: 'rotate', group: 'classic', picker: false, randomPool: false, duration: 800, export: { type: 'ferris', direction: 'l', duration: 800 } },
  { value: 'scaleX', group: 'classic', picker: false, randomPool: false, duration: 700, export: { type: 'warp', direction: 'in', duration: 700 } },
  { value: 'scaleY', group: 'classic', picker: false, randomPool: false, duration: 700, export: { type: 'split', direction: 'vert', duration: 700 } },
]

const DEF_BY_MODE = new Map(SLIDE_TRANSITION_DEFS.map(def => [def.value, def]))

export const TURNING_MODES = SLIDE_TRANSITION_DEFS.map(def => def.value)

export const SLIDE_ANIMATION_PICKER: TurningMode[] = SLIDE_TRANSITION_DEFS
  .filter(def => def.picker)
  .map(def => def.value)

export const SLIDE_ANIMATION_GROUPS: TurningGroup[] = ['atmosphere', 'motion', 'depth']

export const RANDOM_TURNING_MODES = SLIDE_TRANSITION_DEFS
  .filter(def => def.randomPool)
  .map(def => def.value) as Exclude<TurningMode, 'random' | 'no'>[]

export const getTransitionDef = (mode?: TurningMode) => (mode ? DEF_BY_MODE.get(mode) : undefined)

export const getTurningDurationMs = (mode?: TurningMode) => getTransitionDef(mode)?.duration ?? 700

export const turningDurationVars = (mode?: TurningMode): Record<string, string> => ({
  '--turning-duration': `${getTurningDurationMs(mode)}ms`,
})

export const transitionExportForMode = (mode?: TurningMode): SlideTransitionExport | undefined => {
  if (!mode || mode === 'no') return undefined
  return getTransitionDef(mode)?.export
}

export const pickerModesForGroup = (group: TurningGroup): TurningMode[] => (
  SLIDE_TRANSITION_DEFS.filter(def => def.picker && def.group === group).map(def => def.value)
)
