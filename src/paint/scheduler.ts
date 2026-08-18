export type PaintPriority = 'visible' | 'nearby' | 'background'

type PaintJob = {
  key: string
  priority: number
  paint: () => void
  enqueuedAt: number
}

const FRAME_BUDGET_MS = 4
const priorities: Record<PaintPriority, number> = {
  visible: 0,
  nearby: 1,
  background: 2,
}
const jobs = new Map<string, PaintJob>()
let frame = 0

export const canvasPaintStats = {
  paints: 0,
  cancelled: 0,
  maxQueue: 0,
  paintMs: [] as number[],
}

const requestDrain = () => {
  if (frame || typeof requestAnimationFrame === 'undefined') return
  frame = requestAnimationFrame(drain)
}

const drain = () => {
  frame = 0
  const started = performance.now()
  while (jobs.size) {
    const next = [...jobs.values()].sort((a, b) => (
      a.priority - b.priority || a.enqueuedAt - b.enqueuedAt
    ))[0]
    jobs.delete(next.key)
    const paintStarted = performance.now()
    try {
      next.paint()
    }
    finally {
      const elapsed = performance.now() - paintStarted
      canvasPaintStats.paints++
      canvasPaintStats.paintMs.push(elapsed)
      if (canvasPaintStats.paintMs.length > 300) canvasPaintStats.paintMs.shift()
    }
    if (performance.now() - started >= FRAME_BUDGET_MS) break
  }
  if (jobs.size) requestDrain()
}

export const scheduleSlidePaint = (
  key: string,
  paint: () => void,
  priority: PaintPriority = 'visible',
) => {
  jobs.set(key, {
    key,
    paint,
    priority: priorities[priority],
    enqueuedAt: performance.now(),
  })
  canvasPaintStats.maxQueue = Math.max(canvasPaintStats.maxQueue, jobs.size)
  requestDrain()
  return () => {
    if (jobs.delete(key)) canvasPaintStats.cancelled++
  }
}

export const readCanvasPaintReport = () => {
  const ms = canvasPaintStats.paintMs
  return {
    ...canvasPaintStats,
    paintMs: [...ms],
    paintMsAvg: ms.length ? +(ms.reduce((sum, value) => sum + value, 0) / ms.length).toFixed(2) : 0,
    paintMsMax: ms.length ? +Math.max(...ms).toFixed(2) : 0,
    queued: jobs.size,
  }
}

if (typeof window !== 'undefined' && import.meta.env.MODE === 'development') {
  Object.assign(window, {
    __FIKA_CANVAS_PAINT__: {
      read: readCanvasPaintReport,
      flush: drain,
    },
  })
}
