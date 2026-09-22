import { memo, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { nanoid } from 'nanoid'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement, SlideGuide } from '@/types/slides'
import type { MynaViewState } from '@/views/Myna/viewStore'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useI18nContext } from '@/i18n/useI18nContext'
import { getElementListRange } from '@/utils/element'
import { validPageGuides } from '@/utils/pageGuides'
import { drainCommitQueue } from '@/utils/commitQueue'
import { bindStyles } from '@/utils/cssm'
import styles from './MynaRulers.module.scss'
const cx = bindStyles(styles)
const GUTTER = 24
const LIMIT = 1_000_000
const EMPTY_GUIDES: SlideGuide[] = []

type Props = {
  canvasRef: RefObject<HTMLDivElement | null>
  viewportStyles: { left: number; top: number; width: number; height: number }
  elementList: PPTElement[]
  view: MynaViewState
}
type GuideDrag = { guide: SlideGuide; original: SlideGuide | null; slideId: string; pointerId: number; startX: number; startY: number; moved: boolean }

// Keep labels around 70 screen pixels apart, at familiar 1/2/5 intervals.
function rulerTicks(origin: number, length: number, scale: number) {
  if (!Number.isFinite(scale) || scale <= 0 || length <= 0) return []
  const desired = 70 / scale
  const magnitude = 10 ** Math.floor(Math.log10(desired))
  const major = ([1, 2, 5, 10].find(n => n * magnitude >= desired) ?? 10) * magnitude
  const minor = major / 5
  const first = Math.ceil((GUTTER - origin) / scale / minor)
  const last = Math.floor((length - origin) / scale / minor)
  return Array.from({ length: Math.max(0, Math.min(2000, last - first + 1)) }, (_, index) => {
    const step = first + index
    const value = Number((step * minor).toPrecision(10))
    return { position: origin + value * scale, value, major: step % 5 === 0 }
  })
}

/** Editor-only measurement chrome. Guides live in slide coordinates, never export pixels. */
const MynaRulers = memo(({ canvasRef, viewportStyles, elementList, view }: Props) => {
  const { LL, locale } = useI18nContext()
  const t = LL.myna
  const scale = useMainStore(s => s.canvasScale)
  const selectedIds = useMainStore(s => s.activeElementIdList)
  const readOnly = useMainStore(s => s.readOnly)
  const slideId = useSlidesStore(s => selectCurrentSlide(s)?.id)
  const guides = useSlidesStore(s => selectCurrentSlide(s)?.guides ?? EMPTY_GUIDES)
  const { addHistorySnapshot } = useHistorySnapshot()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [drag, setDrag] = useState<GuideDrag | null>(null)
  const dragRef = useRef<GuideDrag | null>(null)
  const [focusedGuide, setFocusedGuide] = useState<string | null>(null)
  const focusAfterCommit = useRef<string | null>(null)
  const patternId = useId().replaceAll(':', '')
  const helpId = useId()
  const enabled = !readOnly && !view.guidesLocked
  const formatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale])
  const ticksX = rulerTicks(viewportStyles.left, size.width, scale)
  const ticksY = rulerTicks(viewportStyles.top, size.height, scale)
  const selectedRange = useMemo(() => {
    const elements = elementList.filter(element => selectedIds.includes(element.id))
    return elements.length ? getElementListRange(elements) : null
  }, [elementList, selectedIds])

  useEffect(() => {
    const node = canvasRef.current
    if (!node) return
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [canvasRef])
  useEffect(() => {
    dragRef.current = null
    setDrag(null)
    setFocusedGuide(null)
  }, [slideId, readOnly, view.guidesLocked, view.showGuides, view.showRulers])

  useEffect(() => {
    const id = focusAfterCommit.current
    if (!id) return
    const element = canvasRef.current?.querySelector<HTMLElement>(`[data-myna-guide="${id}"]`)
    if (element) { element.focus(); focusAfterCommit.current = null }
  }, [guides, canvasRef])

  const currentPosition = (event: PointerEvent, axis: SlideGuide['axis']) => {
    const bounds = canvasRef.current!.getBoundingClientRect()
    const coordinate = axis === 'x' ? event.clientX - bounds.left - viewportStyles.left : event.clientY - bounds.top - viewportStyles.top
    return Math.max(-LIMIT, Math.min(LIMIT, Math.round(coordinate / scale)))
  }
  const commit = (guide: SlideGuide, remove = false, targetSlide = slideId) => {
    if (!enabled || useMainStore.getState().readOnly || !targetSlide) return
    drainCommitQueue()
    const state = useSlidesStore.getState()
    const slide = state.slides.find(item => item.id === targetSlide)
    if (!slide || selectCurrentSlide(state)?.id !== targetSlide) return
    const previous = validPageGuides(slide.guides)
    const existing = previous.find(item => item.id === guide.id)
    if (remove && !existing) return
    if (!remove && existing?.position === guide.position && existing.axis === guide.axis) return
    const next = remove ? previous.filter(item => item.id !== guide.id)
      : existing ? previous.map(item => item.id === guide.id ? guide : item) : [...previous, guide]
    if (!remove && !view.showGuides) view.setPreference('showGuides', true)
    state.updateSlide({ guides: next }, targetSlide)
    addHistorySnapshot()
  }
  const begin = (event: PointerEvent<HTMLElement>, axis: SlideGuide['axis'], original: SlideGuide | null = null) => {
    if (!enabled || event.button !== 0 || !slideId || !canvasRef.current) return
    event.preventDefault(); event.stopPropagation()
    drainCommitQueue()
    useMainStore.getState().setEditorareaFocus(true)
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const next: GuideDrag = {
      guide: original ?? { id: nanoid(10), axis, position: currentPosition(event, axis) },
      original, slideId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false,
    }
    dragRef.current = next
    setDrag(next)
    if (original) setFocusedGuide(original.id)
  }
  const move = (event: PointerEvent) => {
    const active = dragRef.current
    if (!active || event.pointerId !== active.pointerId || !canvasRef.current) return
    event.preventDefault(); event.stopPropagation()
    const next = { ...active,
      moved: active.moved || Math.hypot(event.clientX-active.startX, event.clientY-active.startY) > 3,
      guide: { ...active.guide, position: currentPosition(event, active.guide.axis) },
    }
    dragRef.current = next
    setDrag(next)
  }
  const cancel = () => { dragRef.current = null; setDrag(null) }
  const finish = (event: PointerEvent) => {
    const active = dragRef.current
    if (!active || event.pointerId !== active.pointerId || !canvasRef.current) return
    event.preventDefault(); event.stopPropagation()
    const bounds = canvasRef.current.getBoundingClientRect()
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top
    const gutter = view.showRulers ? GUTTER : 0
    const onRuler = active.guide.axis === 'x' ? x < gutter : y < gutter
    const outside = x < 0 || y < 0 || x > bounds.width || y > bounds.height
    if (active.moved) {
      const guide = { ...active.guide, position: currentPosition(event, active.guide.axis) }
      if (onRuler || outside) { if (active.original) commit(guide, true, active.slideId) }
      else { focusAfterCommit.current = guide.id; commit(guide, false, active.slideId); setFocusedGuide(guide.id) }
    }
    cancel()
  }
  const onRulerKey = (event: KeyboardEvent, axis: SlideGuide['axis']) => {
    if (!['Enter', ' '].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault(); event.stopPropagation()
    if (!enabled || event.repeat || !slideId) return
    const guide: SlideGuide = { id: nanoid(10), axis, position: Math.round((axis === 'x' ? viewportStyles.width : viewportStyles.height) / 2) }
    useMainStore.getState().setEditorareaFocus(true)
    focusAfterCommit.current = guide.id
    commit(guide)
  }
  const onGuideKey = (event: KeyboardEvent, guide: SlideGuide) => {
    // Let document undo/redo work while a guide has focus.
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) return
    // Guide keyboard commands must never also move or delete selected artwork.
    event.stopPropagation()
    if (event.key === 'Escape') { cancel(); (event.currentTarget as HTMLElement).blur(); return }
    if (!enabled) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); commit(guide, true); setFocusedGuide(null); return
    }
    const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0
    if (delta) {
      event.preventDefault()
      commit({ ...guide, position: Math.max(-LIMIT, Math.min(LIMIT, guide.position + delta * (event.shiftKey ? 10 : 1))) })
    }
  }
  const gridStep = Math.max(1, view.gridSize) * scale
  const visibleGridStep = gridStep < 8 ? gridStep * Math.ceil(8 / gridStep) : gridStep
  const gutter = view.showRulers ? GUTTER : 0
  const validGuides = validPageGuides(guides)
  const guidePosition = (guide: SlideGuide) => guide.position * scale + (guide.axis === 'x' ? viewportStyles.left : viewportStyles.top)

  return <div className={cx('myna-measurements')} data-myna-rulers
    onKeyDown={event => { if (event.key === 'Escape' && dragRef.current) { event.stopPropagation(); cancel() } }}
    onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
    <span className={cx('sr-only')} id={helpId}>{t.guideHelp()}</span>
    {view.showGrid && scale > 0 ? <svg className={cx('page-grid')} aria-hidden="true" data-myna-grid
      style={{ left: viewportStyles.left, top: viewportStyles.top, width: viewportStyles.width*scale, height: viewportStyles.height*scale }}>
      <defs><pattern id={patternId} width={visibleGridStep} height={visibleGridStep} patternUnits="userSpaceOnUse"><path d={`M ${visibleGridStep} 0 L 0 0 0 ${visibleGridStep}`} fill="none" stroke="currentColor" strokeWidth=".65" /></pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg> : null}
    {view.showGuides ? validGuides.map(guide => {
      const position = guidePosition(guide)
      const active = focusedGuide === guide.id
      return <div key={guide.id} role="slider" tabIndex={enabled ? 0 : -1}
        aria-label={guide.axis === 'x' ? t.verticalGuide({ position: guide.position }) : t.horizontalGuide({ position: guide.position })}
        aria-orientation={guide.axis === 'x' ? 'horizontal' : 'vertical'} aria-valuenow={guide.position} aria-valuemin={-LIMIT} aria-valuemax={LIMIT}
        aria-disabled={!enabled} aria-describedby={helpId} title={t.guideHelp()} data-myna-guide={guide.id} data-axis={guide.axis}
        className={cx('guide', guide.axis === 'x' ? 'vertical-guide' : 'horizontal-guide', { active, locked: !enabled, moving: drag?.guide.id === guide.id })}
        style={guide.axis === 'x' ? { left: position-4, top: gutter } : { top: position-4, left: gutter }}
        onFocus={() => { setFocusedGuide(guide.id); useMainStore.getState().setEditorareaFocus(true) }} onBlur={() => setFocusedGuide(null)}
        onPointerDown={event => begin(event, guide.axis, guide)} onKeyDown={event => onGuideKey(event, guide)}>
        <span className={cx('guide-label')}>{t.guidePosition({ position: guide.position })}</span>
      </div>
    }) : null}
    {drag && drag.moved ? <div aria-hidden="true" className={cx('guide', 'preview', drag.guide.axis === 'x' ? 'vertical-guide' : 'horizontal-guide')}
      style={drag.guide.axis === 'x' ? { left: guidePosition(drag.guide)-4, top:gutter } : { top:guidePosition(drag.guide)-4, left:gutter }}>
      <span className={cx('guide-label')}>{t.guidePosition({ position: drag.guide.position })}</span>
    </div> : null}
    {view.showRulers ? <>
      <button type="button" className={cx('ruler', 'ruler-x')} data-myna-ruler="horizontal" aria-label={t.horizontalRuler()} title={t.horizontalRuler()} disabled={!enabled}
        onPointerDown={event => begin(event, 'y')} onKeyDown={event => onRulerKey(event, 'y')}>
        <svg width={size.width} height={GUTTER} aria-hidden="true">
          {selectedRange ? <rect className={cx('selection-span')} x={viewportStyles.left+selectedRange.minX*scale} y="0" width={(selectedRange.maxX-selectedRange.minX)*scale} height={GUTTER} /> : null}
          {ticksX.map(tick => <g key={tick.value}><line x1={tick.position} x2={tick.position} y1={tick.major ? 15 : 20} y2={GUTTER} />{tick.major ? <text x={tick.position+3} y="11">{formatter.format(tick.value)}</text> : null}</g>)}
        </svg>
      </button>
      <button type="button" className={cx('ruler', 'ruler-y')} data-myna-ruler="vertical" aria-label={t.verticalRuler()} title={t.verticalRuler()} disabled={!enabled}
        onPointerDown={event => begin(event, 'x')} onKeyDown={event => onRulerKey(event, 'x')}>
        <svg width={GUTTER} height={size.height} aria-hidden="true">
          {selectedRange ? <rect className={cx('selection-span')} x="0" y={viewportStyles.top+selectedRange.minY*scale} height={(selectedRange.maxY-selectedRange.minY)*scale} width={GUTTER} /> : null}
          {ticksY.map(tick => <g key={tick.value}><line x1={tick.major ? 15 : 20} x2={GUTTER} y1={tick.position} y2={tick.position} />{tick.major ? <text transform={`translate(11 ${tick.position-3}) rotate(-90)`}>{formatter.format(tick.value)}</text> : null}</g>)}
        </svg>
      </button>
      <div className={cx('ruler-corner')} aria-hidden="true">{t.rulerUnit()}</div>
    </> : null}
  </div>
})
export default MynaRulers
