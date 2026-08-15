export type RasterJob = () => Promise<void> | void

export const MAX_CONCURRENT_RASTERS = 3
export const RASTER_PRIORITY_LQ_CURRENT = 6
export const RASTER_PRIORITY_LQ_VISIBLE = 5
export const RASTER_PRIORITY_CURRENT = 3
export const RASTER_PRIORITY_VISIBLE = 2
const TIME_SLICE_MS = 8

type QueuedRaster = {
  priority: number
  run: RasterJob
  key?: string
}

type SchedulerYield = {
  yield?: () => Promise<void>
}

type NavigatorScheduling = Navigator & {
  scheduling?: {
    isInputPending?: (options?: { includeContinuous?: boolean }) => boolean
  }
}

const queue: QueuedRaster[] = []
const runningKeys = new Set<string>()
const runningSlideIds = new Set<string>()
let running = 0

const slideIdOf = (key?: string) => key?.split(':')[0]
let yieldAfter = false
let sliceStartedAt = 0

const globalScheduler = (): SchedulerYield | undefined => (
  (globalThis as typeof globalThis & { scheduler?: SchedulerYield }).scheduler
)

export const isInputPending = () => {
  if (typeof navigator === 'undefined') return false
  return (navigator as NavigatorScheduling).scheduling?.isInputPending?.({ includeContinuous: false }) === true
}

export const yieldToMain = async () => {
  const scheduler = globalScheduler()
  if (typeof scheduler?.yield === 'function') {
    await scheduler.yield()
    return
  }
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    return
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

/** SnapDOM / HTML booths should yield a frame; cheap Konva.Text paints should not. */
export const markRasterYield = () => {
  yieldAfter = true
}

export const yieldIfNeeded = async (force = false) => {
  if (!force && !yieldAfter && !isInputPending()) return
  yieldAfter = false
  await yieldToMain()
  sliceStartedAt = performance.now()
}

const sortQueue = () => {
  queue.sort((a, b) => b.priority - a.priority)
}

export const enqueueRaster = (run: RasterJob, priority = 0, key?: string) => {
  if (key) {
    const existing = queue.findIndex(job => job.key === key)
    if (existing >= 0) {
      const prev = queue[existing]
      queue[existing] = { priority: Math.max(prev.priority, priority), run, key }
      sortQueue()
      pump()
      return
    }
  }
  queue.push({ priority, run, key })
  sortQueue()
  pump()
}

const isBlocked = (job: QueuedRaster) => {
  if (job.key && runningKeys.has(job.key)) return true
  const slideId = slideIdOf(job.key)
  return !!(slideId && runningSlideIds.has(slideId))
}

const takeNext = (): QueuedRaster | undefined => {
  const lqWaiting = queue.some(job => job.priority >= RASTER_PRIORITY_LQ_VISIBLE && !isBlocked(job))
  const currentHqWaiting = queue.some(job => (
    job.priority >= RASTER_PRIORITY_CURRENT
    && job.priority < RASTER_PRIORITY_LQ_VISIBLE
    && !isBlocked(job)
  ))
  for (let i = 0; i < queue.length; i++) {
    const job = queue[i]
    if (isBlocked(job)) continue
    if (lqWaiting && job.priority < RASTER_PRIORITY_LQ_VISIBLE) continue
    if (currentHqWaiting && job.priority < RASTER_PRIORITY_CURRENT) continue
    queue.splice(i, 1)
    return job
  }
  return undefined
}

const pump = () => {
  while (running < MAX_CONCURRENT_RASTERS) {
    const job = takeNext()
    if (!job) break
    running += 1
    if (job.key) runningKeys.add(job.key)
    const slideId = slideIdOf(job.key)
    if (slideId) runningSlideIds.add(slideId)
    void runJob(job)
  }
}

const runJob = async (job: QueuedRaster) => {
  sliceStartedAt = performance.now()
  try {
    await job.run()
  }
  catch {
    // keep the rail alive if a single paint fails
  }
  const sliced = yieldAfter || (sliceStartedAt && performance.now() - sliceStartedAt >= TIME_SLICE_MS)
  await yieldIfNeeded(sliced)
  if (job.key) runningKeys.delete(job.key)
  const slideId = slideIdOf(job.key)
  if (slideId) runningSlideIds.delete(slideId)
  running -= 1
  pump()
}

export const resetRasterSchedulerForTests = () => {
  queue.length = 0
  runningKeys.clear()
  runningSlideIds.clear()
  running = 0
  yieldAfter = false
  sliceStartedAt = 0
}
