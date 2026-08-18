import { DEFAULT_TURNING_MODE } from '@/configs/animation'
import { TURNING_MODES } from '@/configs/transitions'
import type { Slide, TurningMode } from '@/types/slides'

const TURNING_MODE_SET = new Set<string>(TURNING_MODES)

export const isTurningMode = (value: unknown): value is TurningMode => (
  typeof value === 'string' && TURNING_MODE_SET.has(value)
)

/** One mode for every slide, or a per-slide list / index map. */
export type ImportTurningModeInput =
  | TurningMode
  | Array<TurningMode | null | undefined>
  | Record<number, TurningMode>

export type ImportTransitionOptions = {
  turningMode?: ImportTurningModeInput
  /** Used when a slide has no file transition and no per-slide override. */
  defaultTurningMode?: TurningMode
}

export type AppliedImportTransitions = {
  slides: Slide[]
  /** Set when every imported slide received the same explicit override. */
  uniformMode?: TurningMode
}

const parseMode = (value: unknown, path: string): TurningMode => {
  if (isTurningMode(value)) return value
  throw new Error(`Invalid turningMode${path}: ${String(value)}`)
}

/**
 * Accept a single mode, an index-aligned array, or a 0- or 1-based index map.
 */
export const parseImportTurningMode = (value: unknown): ImportTurningModeInput | undefined => {
  if (value === undefined || value === null || value === 'keep') return undefined
  if (isTurningMode(value)) return value
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item === undefined || item === null || item === 'keep') return null
      return parseMode(item, `[${index}]`)
    })
  }
  if (typeof value === 'object') {
    const record: Record<number, TurningMode> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (!/^\d+$/.test(key)) throw new Error(`Invalid turningMode key: ${key}`)
      if (item === undefined || item === null || item === 'keep') continue
      record[Number(key)] = parseMode(item, `[${key}]`)
    }
    return record
  }
  throw new Error(`Invalid turningMode: ${String(value)}`)
}

const overrideForIndex = (
  input: ImportTurningModeInput | undefined,
  index: number,
  length: number,
): TurningMode | undefined => {
  if (input === undefined) return undefined
  if (typeof input === 'string') return input
  if (Array.isArray(input)) {
    const item = input[index]
    return item ?? undefined
  }
  if (input[index] !== undefined) return input[index]
  const oneBased = index + 1
  if (input[0] === undefined && oneBased <= length && input[oneBased] !== undefined) {
    return input[oneBased]
  }
  return undefined
}

export const applyImportTransitions = (
  slides: Slide[],
  options: ImportTransitionOptions = {},
): AppliedImportTransitions => {
  const fallback = options.defaultTurningMode ?? DEFAULT_TURNING_MODE
  const uniformOverride = typeof options.turningMode === 'string' ? options.turningMode : undefined
  const next = slides.map((slide, index) => {
    const override = overrideForIndex(options.turningMode, index, slides.length)
    const turningMode = override ?? slide.turningMode ?? fallback
    if (slide.turningMode === turningMode) return slide
    return { ...slide, turningMode }
  })
  return {
    slides: next,
    ...(uniformOverride ? { uniformMode: uniformOverride } : {}),
  }
}
