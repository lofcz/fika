import { DEFAULT_TURNING_MODE } from '@/configs/animation'
import { RANDOM_TURNING_MODES } from '@/configs/transitions'
import type { TurningMode } from '@/types/slides'

/** Neighbors kept in the turning window (current ± 1). */
export const SCREEN_PRELOAD_RADIUS = 1
/** Filmstrip / bottom-rail thumbs that keep a raster attached. */
export const SCREEN_THUMB_RADIUS = 6

export const screenWindowRange = (current: number, length: number, radius = SCREEN_PRELOAD_RADIUS) => ({
  start: Math.max(0, current - radius),
  end: Math.min(length - 1, current + radius),
})

export const isInScreenWindow = (index: number, current: number, radius = SCREEN_PRELOAD_RADIUS) => (
  Math.abs(current - index) <= radius
)

const RANDOM_MODES = RANDOM_TURNING_MODES

const randomById = new Map<string, TurningMode>()

export const resolveTurningMode = (slideId: string, turningMode?: TurningMode): TurningMode => {
  const mode = turningMode ?? DEFAULT_TURNING_MODE
  if (mode !== 'random') return mode
  const cached = randomById.get(slideId)
  if (cached) return cached
  const picked = RANDOM_MODES[Math.floor(Math.random() * RANDOM_MODES.length)]
  randomById.set(slideId, picked)
  return picked
}
