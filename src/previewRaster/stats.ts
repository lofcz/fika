export type RasterStats = {
  fullPaints: number
  patchPaints: number
  elementInvalidations: number
  backgroundInvalidations: number
  booths: number
  boothHits: number
  lqPaints: number
  hqPaints: number
}

export type RasterPhase =
  | 'slide'
  | 'bg'
  | 'text'
  | 'shape'
  | 'image'
  | 'booth'
  | 'other'
  | 'snapshot'

export type RasterPhaseMs = Record<RasterPhase, number>

export type RasterSlideSample = {
  id: string
  quality: string
  ms: number
  elements: number
}

export type RasterTimings = {
  sessionStartedAt: number
  firstBlitAt: number
  viewportReadyAt: number
  currentHqAt: number
  phaseMs: RasterPhaseMs
  slides: RasterSlideSample[]
}

const emptyPhaseMs = (): RasterPhaseMs => ({
  slide: 0,
  bg: 0,
  text: 0,
  shape: 0,
  image: 0,
  booth: 0,
  other: 0,
  snapshot: 0,
})

export const rasterStats: RasterStats = {
  fullPaints: 0,
  patchPaints: 0,
  elementInvalidations: 0,
  backgroundInvalidations: 0,
  booths: 0,
  boothHits: 0,
  lqPaints: 0,
  hqPaints: 0,
}

export const rasterTimings: RasterTimings = {
  sessionStartedAt: 0,
  firstBlitAt: 0,
  viewportReadyAt: 0,
  currentHqAt: 0,
  phaseMs: emptyPhaseMs(),
  slides: [],
}

export const resetRasterStats = () => {
  rasterStats.fullPaints = 0
  rasterStats.patchPaints = 0
  rasterStats.elementInvalidations = 0
  rasterStats.backgroundInvalidations = 0
  rasterStats.booths = 0
  rasterStats.boothHits = 0
  rasterStats.lqPaints = 0
  rasterStats.hqPaints = 0
  rasterTimings.sessionStartedAt = 0
  rasterTimings.firstBlitAt = 0
  rasterTimings.viewportReadyAt = 0
  rasterTimings.currentHqAt = 0
  rasterTimings.phaseMs = emptyPhaseMs()
  rasterTimings.slides = []
}

export const markRasterSession = () => {
  resetRasterStats()
  rasterTimings.sessionStartedAt = performance.now()
}

export const addPhaseMs = (phase: RasterPhase, ms: number) => {
  rasterTimings.phaseMs[phase] += ms
}

export const timePhase = async <T>(phase: RasterPhase, run: () => Promise<T> | T): Promise<T> => {
  const started = performance.now()
  try {
    return await run()
  }
  finally {
    addPhaseMs(phase, performance.now() - started)
  }
}

export const timePhaseSync = <T>(phase: RasterPhase, run: () => T): T => {
  const started = performance.now()
  try {
    return run()
  }
  finally {
    addPhaseMs(phase, performance.now() - started)
  }
}

export const markFirstBlit = () => {
  if (!rasterTimings.firstBlitAt) rasterTimings.firstBlitAt = performance.now()
}

export const markViewportReady = () => {
  if (!rasterTimings.viewportReadyAt) rasterTimings.viewportReadyAt = performance.now()
}

export const markCurrentHq = () => {
  if (!rasterTimings.currentHqAt) rasterTimings.currentHqAt = performance.now()
}

export const recordSlidePaint = (sample: RasterSlideSample) => {
  rasterTimings.slides.push(sample)
}

const sinceSession = (at: number) => (
  at > 0 && rasterTimings.sessionStartedAt > 0 ? Math.round(at - rasterTimings.sessionStartedAt) : null
)

export const readRasterStats = (): RasterStats & {
  timings: RasterPhaseMs
  firstBlitMs: number | null
  viewportReadyMs: number | null
  currentHqMs: number | null
  slideSamples: RasterSlideSample[]
} => ({
  ...rasterStats,
  timings: { ...rasterTimings.phaseMs },
  firstBlitMs: sinceSession(rasterTimings.firstBlitAt),
  viewportReadyMs: sinceSession(rasterTimings.viewportReadyAt),
  currentHqMs: sinceSession(rasterTimings.currentHqAt),
  slideSamples: rasterTimings.slides.slice(-40),
})
