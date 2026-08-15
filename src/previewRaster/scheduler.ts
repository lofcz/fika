export type RasterJob = () => Promise<void> | void

const queue: { priority: number; run: RasterJob }[] = []
let pumping = false
let yieldAfter = false

/** SnapDOM / HTML booths should yield a frame; cheap Konva.Text paints should not. */
export const markRasterYield = () => {
  yieldAfter = true
}

export const enqueueRaster = (run: RasterJob, priority = 0) => {
  queue.push({ priority, run })
  queue.sort((a, b) => b.priority - a.priority)
  if (!pumping) void pump()
}

const pump = async () => {
  pumping = true
  while (queue.length) {
    const job = queue.shift()
    if (!job) break
    yieldAfter = false
    try {
      await job.run()
    }
    catch {
      // keep the rail alive if a single paint fails
    }
    if (yieldAfter && typeof requestAnimationFrame === 'function') {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
  }
  pumping = false
}
