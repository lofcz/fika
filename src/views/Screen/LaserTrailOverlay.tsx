import { bindStyles } from '@/utils/cssm'
import styles from './LaserTrailOverlay.module.scss'
const cx = bindStyles(styles)
import { useEffect, useRef } from 'react'
import { LASER_COLORS, type LaserColorId } from '@/configs/laser'
import {
  fillFreehandStroke,
  pointerStrokeSamples,
  shouldKeepFreehandPoint,
  type FreehandPoint,
  type FreehandStrokeOptions,
} from '@/utils/freehand'

type TrailPoint = FreehandPoint & { t: number }

/** Visible comet afterimage while the laser is live. */
const TRAIL_MS = 380
/** After release, squash the leftover ribbon so it is gone in this window. */
const DRAIN_MS = 100
const MAX_POINTS = 96
const UI_IGNORE = '.presenter-dock, .writing-board-tool, .presenter-view .rail'

const LASER_STROKE: FreehandStrokeOptions = {
  thinning: 0.62,
  smoothing: 0.65,
  streamline: 0.62,
  simulatePressure: true,
  last: true,
  start: { cap: true, taper: true },
  end: { cap: true, taper: 0 },
}

export type ILaserTrailOverlayProps = {
  active: boolean
  color?: LaserColorId
  trackPointer?: boolean
  remoteX?: number
  remoteY?: number
  slideWidth?: number
  slideHeight?: number
}

type LaserProps = {
  active: boolean
  color: LaserColorId
  trackPointer: boolean
  remoteX: number
  remoteY: number
  slideWidth: number
  slideHeight: number
}

/**
 * Trail points / head / rAF live in this closure, not React state.
 * Recreating pointer handlers each render would make removeEventListener miss.
 */
const createLaserEngine = (
  canvasRef: { current: HTMLCanvasElement | null },
  propsRef: { current: LaserProps },
) => {
  const points: TrailPoint[] = []
  let head = { x: 0, y: 0 }
  let hasHead = false
  let ctx: CanvasRenderingContext2D | null = null
  let cssWidth = 0
  let cssHeight = 0
  let raf = 0
  let running = false
  let listening = false

  const deviceRatio = () => window.devicePixelRatio || 1

  const paint = () => LASER_COLORS[propsRef.current.color] ?? LASER_COLORS.red

  const syncCanvasSize = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    cssWidth = rect.width
    cssHeight = rect.height
    const ratio = deviceRatio()
    const nextW = Math.max(1, Math.round(cssWidth * ratio))
    const nextH = Math.max(1, Math.round(cssHeight * ratio))
    if (canvas.width !== nextW) canvas.width = nextW
    if (canvas.height !== nextH) canvas.height = nextH
    ctx = canvas.getContext('2d', { alpha: true })
  }

  const remoteToLocal = (nx: number, ny: number) => {
    const { slideWidth, slideHeight } = propsRef.current
    const x = cssWidth / 2 - slideWidth / 2 + nx * slideWidth
    const y = cssHeight / 2 - slideHeight / 2 + ny * slideHeight
    return { x, y }
  }

  const addPoint = (x: number, y: number) => {
    const now = performance.now()
    head = { x, y }
    hasHead = true
    const next: TrailPoint = { x, y, t: now, pressure: 0.5 }
    const last = points[points.length - 1]
    if (last && !shouldKeepFreehandPoint(last, next, true)) return
    points.push(next)
    if (points.length > MAX_POINTS) points.splice(0, points.length - MAX_POINTS)
  }

  const prune = (now: number) => {
    const life = propsRef.current.active ? TRAIL_MS : DRAIN_MS
    while (points.length && now - points[0].t > life) points.shift()
    if (!propsRef.current.active || !points.length) hasHead = false
  }

  const squashTrailForDrain = () => {
    hasHead = false
    if (!points.length) return
    const now = performance.now()
    const newest = points[points.length - 1].t
    const oldest = points[0].t
    const span = Math.max(1, newest - oldest)
    for (const point of points) {
      const u = (point.t - oldest) / span
      point.t = now - (1 - u) * DRAIN_MS
    }
  }

  const trailPoints = (): FreehandPoint[] => {
    const stroke: FreehandPoint[] = points.map(({ x, y, pressure }) => ({ x, y, pressure }))
    if (!hasHead) return stroke
    const last = stroke[stroke.length - 1]
    if (!last || last.x !== head.x || last.y !== head.y) {
      stroke.push({ x: head.x, y: head.y, pressure: 0.5 })
    }
    return stroke
  }

  const drawHead = (x: number, y: number, rgb: [number, number, number]) => {
    if (!ctx) return
    const [r, g, b] = rgb

    const bloom = ctx.createRadialGradient(x, y, 0, x, y, 14)
    bloom.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
    bloom.addColorStop(0.12, `rgba(${r}, ${g}, ${b}, 1)`)
    bloom.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, 0.45)`)
    bloom.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
    ctx.fillStyle = bloom
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.beginPath()
    ctx.arc(x, y, 3.1, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x - 0.4, y - 0.5, 1.35, 0, Math.PI * 2)
    ctx.fill()
  }

  const draw = () => {
    if (!ctx) return

    const ratio = deviceRatio()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    if (!hasHead && !points.length) return

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const { rgb } = paint()
    const [r, g, b] = rgb
    const stroke = trailPoints()
    if (stroke.length) {
      fillFreehandStroke(ctx, stroke, 18, `rgba(${r}, ${g}, ${b}, 0.42)`, {
        ...LASER_STROKE,
        composite: 'lighter',
      })
      fillFreehandStroke(ctx, stroke, 7, `rgba(${r}, ${g}, ${b}, 0.85)`, {
        ...LASER_STROKE,
        composite: 'lighter',
      })
      fillFreehandStroke(ctx, stroke, 3.2, 'rgba(255, 255, 255, 0.92)', {
        ...LASER_STROKE,
        composite: 'lighter',
      })
    }

    if (hasHead) drawHead(head.x, head.y, rgb)
  }

  const tick = () => {
    const now = performance.now()
    prune(now)
    if (!propsRef.current.active && !points.length && !hasHead) {
      running = false
      raf = 0
      draw()
      return
    }
    draw()
    raf = requestAnimationFrame(tick)
  }

  const ensureLoop = () => {
    if (running) return
    running = true
    raf = requestAnimationFrame(tick)
  }

  const handlePointerMove = (e: PointerEvent) => {
    const props = propsRef.current
    if (!props.active || !props.trackPointer || !canvasRef.current) return
    if ((e.target as HTMLElement | null)?.closest?.(UI_IGNORE)) return
    const rect = canvasRef.current.getBoundingClientRect()
    for (const sample of pointerStrokeSamples(e)) {
      const x = sample.clientX - rect.left
      const y = sample.clientY - rect.top
      if (x < -8 || y < -8 || x > rect.width + 8 || y > rect.height + 8) continue
      addPoint(x, y)
    }
    ensureLoop()
  }

  const bindPointer = (on: boolean) => {
    if (on === listening) return
    listening = on
    if (on) window.addEventListener('pointermove', handlePointerMove, { passive: true })
    else window.removeEventListener('pointermove', handlePointerMove)
  }

  const addRemotePoint = () => {
    const props = propsRef.current
    if (props.trackPointer || !props.active) return
    if (!cssWidth || !cssHeight) syncCanvasSize()
    const { x, y } = remoteToLocal(props.remoteX, props.remoteY)
    addPoint(x, y)
    ensureLoop()
  }

  const clearTrail = () => {
    points.length = 0
    hasHead = false
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
  }

  const resizeObserver = new ResizeObserver(() => {
    syncCanvasSize()
    if (propsRef.current.active || points.length) ensureLoop()
  })

  const observe = (canvas: HTMLCanvasElement) => {
    resizeObserver.observe(canvas)
  }

  const teardown = () => {
    resizeObserver.disconnect()
    bindPointer(false)
    window.removeEventListener('resize', syncCanvasSize)
    if (raf) cancelAnimationFrame(raf)
  }

  return {
    bindPointer,
    syncCanvasSize,
    ensureLoop,
    squashTrailForDrain,
    addRemotePoint,
    clearTrail,
    observe,
    teardown,
  }
}

export default function LaserTrailOverlay({
  active,
  color = 'red',
  trackPointer = false,
  remoteX = 0,
  remoteY = 0,
  slideWidth = 0,
  slideHeight = 0,
}: ILaserTrailOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const propsRef = useRef<LaserProps>({
    active,
    color,
    trackPointer,
    remoteX,
    remoteY,
    slideWidth,
    slideHeight,
  })
  propsRef.current = { active, color, trackPointer, remoteX, remoteY, slideWidth, slideHeight }

  const engineRef = useRef<ReturnType<typeof createLaserEngine> | null>(null)
  if (!engineRef.current) engineRef.current = createLaserEngine(canvasRef, propsRef)
  const engine = engineRef.current

  const remoteReady = useRef(false)
  const colorReady = useRef(false)
  const pointerReady = useRef(false)
  const activeReady = useRef(false)

  useEffect(() => {
    if (!remoteReady.current) {
      remoteReady.current = true
      return
    }
    engine.addRemotePoint()
  }, [engine, remoteX, remoteY, active, trackPointer])

  useEffect(() => {
    if (!colorReady.current) {
      colorReady.current = true
      return
    }
    engine.clearTrail()
  }, [engine, color])

  useEffect(() => {
    if (!pointerReady.current) {
      pointerReady.current = true
      return
    }
    engine.bindPointer(active && trackPointer)
  }, [engine, active, trackPointer])

  useEffect(() => {
    if (!activeReady.current) {
      activeReady.current = true
      return
    }
    if (active) {
      engine.syncCanvasSize()
      engine.ensureLoop()
      return
    }
    engine.squashTrailForDrain()
    engine.ensureLoop()
  }, [engine, active])

  useEffect(() => {
    if (canvasRef.current) engine.observe(canvasRef.current)
    engine.syncCanvasSize()
    engine.bindPointer(active && trackPointer)
    window.addEventListener('resize', engine.syncCanvasSize)
    return () => engine.teardown()
  }, [engine])

  return <canvas ref={canvasRef} className={cx('laser-trail')} />
}
