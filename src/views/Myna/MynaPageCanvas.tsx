import MynaPageOverflow from './MynaPageOverflow'
import { useAnimationFrameCallback } from '@/hooks/useAnimationFrameCallback'
import { recordRender } from '@/utils/renderMetrics'
import { useWorkspacePages } from './workspaceSelectors'
import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { WorkspaceLabelsCanvas } from './WorkspaceLabels'
import { useMynaViewStore } from './viewStore'
import { snapPageDrag } from './pageSnapping'
import { useEffect, useLayoutEffect, useRef, useState, useId, useMemo, type PointerEvent } from 'react'
import { useMainStore, useSlidesStore, useKeyboardStore } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import ThumbnailSlide from '@/views/components/ThumbnailSlide'
import { drainCommitQueue } from '@/utils/commitQueue'
import { resolvePagePositions } from './pageLayout'
import styles from './pageCanvas.module.scss'

export function useMynaPageOrigin(enabled: boolean, pan: (x: number, y: number) => void, viewport: { left: number; top: number }, canvas: { current: HTMLElement | null }) {
  const width = useSlidesStore(s => s.viewportSize)
  const ratio = useSlidesStore(s => s.viewportRatio)
  const point = useSlidesStore(useShallow(state => {
    if (!enabled) return { id: undefined as string | undefined, x: 0, y: 0 }
    const slide = state.slides[state.slideIndex]
    const position = slide?.canvasPosition || resolvePagePositions(state.slides, state.viewportSize, state.viewportSize * state.viewportRatio).get(slide?.id) || { x: 0, y: 0 }
    return { id: slide?.id, x: position.x, y: position.y }
  }))
  const previous = useRef(point)
  const previousId = useRef(point.id)
  useLayoutEffect(() => {
    if (enabled) {
      const scale = useMainStore.getState().canvasScale
      let dx = (point.x - previous.current.x) * scale, dy = (point.y - previous.current.y) * scale
      const host = canvas.current
      const x = viewport.left + dx, y = viewport.top + dy
      if (host && previousId.current !== point.id && (x + width * scale < 24 || y + width * ratio * scale < 24 || x > host.clientWidth - 24 || y > host.clientHeight - 24)) {
        dx = (host.clientWidth - width * scale) / 2 - viewport.left
        dy = (host.clientHeight - width * ratio * scale) / 2 - viewport.top
      }
      if (dx || dy) pan(dx, dy)
    }
    previous.current = point
    previousId.current = point.id
  }, [enabled, point.x, point.y, point.id, pan])
}

/** Other pages share the native editor's camera. Only the active page mounts editing chrome. */
const MynaPageCanvas = memo(function MynaPageCanvas({ left, top, canvasWidth, canvasHeight }: { left: number; top: number; canvasWidth: number; canvasHeight: number }) {
  recordRender('MynaPageCanvas')
  const { LL } = useI18nContext()
  const slides = useWorkspacePages()
  const index = useSlidesStore(s => s.slideIndex)
  const width = useSlidesStore(s => s.viewportSize)
  const ratio = useSlidesStore(s => s.viewportRatio)
  const scale = useMainStore(s => s.canvasScale)
  const readOnly = useMainStore(s => s.readOnly)
  const { addHistorySnapshot } = useHistorySnapshot()
  const view = useMynaViewStore()
  const gridId = useId().replace(/:/g, '')
  const [snap, setSnap] = useState<ReturnType<typeof snapPageDrag> | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const drag = useRef<{ x: number; y: number; scale: number; positions: Map<string, { x: number; y: number }>; moved: boolean } | null>(null)
  useEffect(() => { if (!drag.current) setSelected(slides[index] ? [slides[index].id] : []) }, [slides[index]?.id])
  const positions = useMemo(() => resolvePagePositions(slides, width, width * ratio), [slides, width, ratio])
  const origin = positions.get(slides[index]?.id) || { x: 0, y: 0 }
  // Materialize defaults so reordering the document never rearranges the workspace.
  useEffect(() => {
    if (readOnly) return
    const state = useSlidesStore.getState()
    const resolved = resolvePagePositions(state.slides, state.viewportSize, state.viewportSize * state.viewportRatio)
    for (const slide of state.slides) if (!slide.canvasPosition || !Number.isFinite(slide.canvasPosition.x) || !Number.isFinite(slide.canvasPosition.y)) state.updateSlide({ canvasPosition: resolved.get(slide.id) }, slide.id)
  }, [slides, readOnly])
  const activate = (id: string) => {
    drainCommitQueue()
    const main = useMainStore.getState()
    main.setActiveElementIdList([])
    main.setEditingElementId('')
    main.setEditorareaFocus(true)
    const state = useSlidesStore.getState()
    state.updateSlideIndex(state.slides.findIndex(s => s.id === id))
  }
  const begin = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || useKeyboardStore.getState().spaceKeyState) return
    event.stopPropagation(); event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const ids = event.shiftKey ? [...new Set([...selected, slides[index]?.id, id].filter(Boolean))] : selected.includes(id) ? selected : [id]
    setSelected(ids); activate(id)
    if (readOnly) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, scale, moved: false, positions: new Map(ids.map(key => [key, positions.get(key)!])) }
  }
  const moveNow = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || useMainStore.getState().readOnly) return
    let dx = (event.clientX - current.x) / current.scale, dy = (event.clientY - current.y) / current.scale
    if (!current.moved && Math.hypot(dx, dy) * current.scale < 3) return
    current.moved = true
    const axis = event.shiftKey ? Math.abs(dx) > Math.abs(dy) ? 'x' : 'y' : undefined
    if (axis === 'x') dy = 0
    if (axis === 'y') dx = 0
    const result = !event.altKey && (view.snapPages || view.snapPagesToGrid || view.snapToGuides) ? snapPageDrag({
      moving: [...current.positions].map(([id, position]) => ({ id, ...position, width, height: width * ratio })),
      stationary: view.snapPages ? [...positions].filter(([id]) => !current.positions.has(id)).map(([id, position]) => ({ id, ...position, width, height: width * ratio })) : [],
      customGuides: view.snapToGuides ? slides.filter(slide => !current.positions.has(slide.id)).flatMap(slide => {
        const p = positions.get(slide.id)!
        return (slide.guides || []).map(guide => ({ axis: guide.axis, position: guide.position + (guide.axis === 'x' ? p.x : p.y), start: guide.axis === 'x' ? p.y : p.x, end: guide.axis === 'x' ? p.y + width * ratio : p.x + width }))
      }) : [],
      dx, dy, scale: current.scale, axis, gridSize: view.snapPagesToGrid ? view.gridSize : undefined,
    }) : null
    setSnap(result)
    if (result) { dx = result.dx; dy = result.dy }
    useSlidesStore.getState().updateWorkspace({ positions: Object.fromEntries([...current.positions].map(([id, start]) => [id, { x: +(start.x + dx).toFixed(4), y: +(start.y + dy).toFixed(4) }])) })
  }
  const movement = useAnimationFrameCallback(moveNow)
  const move = movement.schedule
  const end = (cancel = false) => {
    if (cancel) movement.cancel(); else movement.flush()
    const current = drag.current; drag.current = null; setSnap(null)
    if (!current?.moved) return
    if (cancel) useSlidesStore.getState().updateWorkspace({ positions: Object.fromEntries(current.positions) })
    else addHistorySnapshot()
  }
  const screenX = (value: number) => left + (value - origin.x) * scale
  const screenY = (value: number) => top + (value - origin.y) * scale
  const gridStep = Math.max(1, view.gridSize) * scale
  const visibleStep = gridStep < 8 ? gridStep * Math.ceil(8 / gridStep) : gridStep
  return <>
    <WorkspaceLabelsCanvas left={left} top={top} originX={origin.x} originY={origin.y} scale={scale} />
    {view.showGrid && <svg className={styles.grid} data-myna-workspace-grid aria-hidden="true"><defs><pattern id={gridId} width={visibleStep} height={visibleStep} patternUnits="userSpaceOnUse" x={screenX(0)} y={screenY(0)}><circle cx="0" cy="0" r=".8" fill="currentColor" /></pattern></defs><rect width="100%" height="100%" fill={`url(#${gridId})`} /></svg>}
    {snap && view.showGuides && <svg className={styles.guides} data-myna-page-snapping aria-hidden="true">
      {snap.guides.map((guide, i) => <line key={i} data-myna-page-snap data-axis={guide.axis} x1={screenX(guide.axis === 'x' ? guide.position : guide.start)} x2={screenX(guide.axis === 'x' ? guide.position : guide.end)} y1={screenY(guide.axis === 'y' ? guide.position : guide.start)} y2={screenY(guide.axis === 'y' ? guide.position : guide.end)} />)}
      {snap.spacing.map((gap, i) => {
        const x1 = screenX(gap.axis === 'x' ? gap.from : gap.cross), x2 = screenX(gap.axis === 'x' ? gap.to : gap.cross)
        const y1 = screenY(gap.axis === 'y' ? gap.from : gap.cross), y2 = screenY(gap.axis === 'y' ? gap.to : gap.cross)
        return <g key={i} data-myna-page-spacing><line x1={x1} y1={y1} x2={x2} y2={y2} /><line x1={x1 - (gap.axis === 'y' ? 4 : 0)} x2={x1 + (gap.axis === 'y' ? 4 : 0)} y1={y1 - (gap.axis === 'x' ? 4 : 0)} y2={y1 + (gap.axis === 'x' ? 4 : 0)} /><line x1={x2 - (gap.axis === 'y' ? 4 : 0)} x2={x2 + (gap.axis === 'y' ? 4 : 0)} y1={y2 - (gap.axis === 'x' ? 4 : 0)} y2={y2 + (gap.axis === 'x' ? 4 : 0)} /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6}>{Math.round(gap.distance)}</text></g>
      })}
    </svg>}
    {slides.filter(slide => slide.id !== slides[index]?.id).map(slide => {
      const position = positions.get(slide.id)!
      return <MynaPageOverflow key={slide.id} id={slide.id} x={screenX(position.x)} y={screenY(position.y)} scale={scale} activate={activate} />
    })}
    {slides.map((slide, pageIndex) => {
    const position = positions.get(slide.id)!
    const x = left + (position.x - origin.x) * scale, y = top + (position.y - origin.y) * scale
    const w = width * scale, h = width * ratio * scale
    const previewWidth = Math.min(w, 2048, 2048 / ratio)
    if (x + w < -200 || y + h < -200 || x > canvasWidth + 200 || y > canvasHeight + 200) return null
    const active = pageIndex === index
    return <div key={slide.id} data-myna-page-chrome className={styles.page} style={{ left: x, top: y, width: w, height: h, zIndex: active ? 3 : 1 }}>
      {!active && <div data-myna-page-id={slide.id} className={styles.preview} onMouseDown={event => { if (event.button !== 0) return; event.stopPropagation(); if (!useKeyboardStore.getState().spaceKeyState) { setSelected([slide.id]); activate(slide.id) } }}><div style={{ transform: `scale(${w / previewWidth})`, transformOrigin: '0 0' }}><ThumbnailSlide slide={slide} size={previewWidth} /></div></div>}
      <button data-myna-page-handle={slide.id} className={styles.handle} style={{ fontSize: 11, transform: `scale(${Math.min(1, scale / .2)})`, transformOrigin: 'left bottom' }} aria-pressed={active || selected.includes(slide.id)} onPointerDown={event => begin(event, slide.id)} onPointerMove={move} onPointerUp={() => end()} onPointerCancel={() => end(true)} onMouseDown={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key === 'Escape') { end(true); return }
        if (readOnly || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const step = event.shiftKey ? 10 : 1
        useSlidesStore.getState().updateSlide({ canvasPosition: { x: position.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: position.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) } }, slide.id)
        addHistorySnapshot()
      }} onClick={event => { if (event.detail === 0) activate(slide.id) }}>{slide.canvasName || LL.myna.page({ number: pageIndex + 1 })}</button>
      {(active || selected.includes(slide.id)) && <div className={styles.outline} />}
    </div>
  })}</>
})
export default MynaPageCanvas
