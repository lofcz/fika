import { workspaceLabelsBounds } from './workspaceLabels'
import { resolvePagePositions, pageLayoutBounds } from './pageLayout'
import { useLayoutEffect, useRef } from 'react'
import { Minus, Plus, Focus } from 'lucide-react'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore, selectActiveElementList } from '@/store'
import useScaleCanvas from '@/hooks/useScaleCanvas'
import { getElementListRange } from '@/utils/element'
import { queryFika } from '@/utils/portal'
import { FIT_CANVAS_BOUNDS_EVENT, type CanvasFitRequest } from '@/utils/canvasFit'
import { CANVAS_ZOOM_PRESETS } from '@/utils/canvasZoom'
import { useMynaViewStore } from './viewStore'
import styles from './zoom.module.scss'
const labels = {
  en: { all: 'Fit all pages', selection: 'Selection', fitSelection: 'Fit selection', zoom: 'Zoom' },
  cs: { all: 'Zobrazit všechny stránky', selection: 'Výběr', fitSelection: 'Přizpůsobit výběru', zoom: 'Přiblížení' },
  sk: { all: 'Zobraziť všetky stránky', selection: 'Výber', fitSelection: 'Prispôsobiť výberu', zoom: 'Priblíženie' },
  pl: { all: 'Dopasuj wszystkie strony', selection: 'Zaznaczenie', fitSelection: 'Dopasuj zaznaczenie', zoom: 'Powiększenie' },
}
export function fitMynaSelection() {
  const selected = selectActiveElementList(useMainStore.getState())
  const canvas = queryFika<HTMLElement>('.canvas')
  if (!selected.length || !canvas) return
  const rect = canvas.getBoundingClientRect()
  const gutter = useMynaViewStore.getState().showRulers ? 24 : 0
  const bounds: CanvasFitRequest = { ...getElementListRange(selected), leftInset: gutter, topInset: gutter }
  // Pinned drawers already reduce the canvas size. Overlay drawers need explicit insets.
  for (const id of ['myna-library', 'myna-properties']) {
    const drawer = queryFika<HTMLElement>(`#${id}`)
    if (!drawer || getComputedStyle(drawer).position !== 'absolute') continue
    const box = drawer.getBoundingClientRect()
    if (box.bottom <= rect.top || box.top >= rect.bottom) continue
    if (id === 'myna-library' && box.left <= rect.left + 1 && box.right > rect.left) bounds.leftInset = Math.max(gutter, box.right - rect.left)
    if (id === 'myna-properties' && box.right >= rect.right - 1 && box.left < rect.right) bounds.rightInset = rect.right - box.left
  }
  canvas.dispatchEvent(new CustomEvent(FIT_CANVAS_BOUNDS_EVENT, { detail: bounds }))
}
export function fitMynaPages() {
  const state = useSlidesStore.getState()
  const canvas = queryFika<HTMLElement>('.canvas')
  if (!canvas || !state.slides.length) return
  const positions = resolvePagePositions(state.slides, state.viewportSize, state.viewportSize * state.viewportRatio)
  const origin = positions.get(state.slides[state.slideIndex]?.id) || { x: 0, y: 0 }
  const bounds = pageLayoutBounds(state.slides, state.viewportSize, state.viewportSize * state.viewportRatio, positions)
  const request: CanvasFitRequest = { minX: bounds.x - origin.x, minY: bounds.y - origin.y, maxX: bounds.x + bounds.width - origin.x, maxY: bounds.y + bounds.height - origin.y, topInset: 56, leftInset: 24 }
  const annotations = workspaceLabelsBounds(state.slides, state.viewportSize, state.viewportSize * state.viewportRatio)
  if (annotations) {
    request.minX = Math.min(request.minX, annotations.minX - origin.x); request.maxX = Math.max(request.maxX, annotations.maxX - origin.x)
    request.minY = Math.min(request.minY, annotations.minY - origin.y); request.maxY = Math.max(request.maxY, annotations.maxY - origin.y)
  }
  const rect = canvas.getBoundingClientRect()
  for (const id of ['myna-library', 'myna-properties']) {
    const drawer = queryFika<HTMLElement>(`#${id}`)
    if (!drawer || getComputedStyle(drawer).position !== 'absolute') continue
    const box = drawer.getBoundingClientRect()
    if (id === 'myna-library' && box.left <= rect.left + 1 && box.right > rect.left) request.leftInset = Math.max(24, box.right - rect.left)
    if (id === 'myna-properties' && box.right >= rect.right - 1 && box.left < rect.right) request.rightInset = rect.right - box.left
  }
  canvas.dispatchEvent(new CustomEvent(FIT_CANVAS_BOUNDS_EVENT, { detail: request }))
}
export default function MynaZoomControl() {
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const footer = rootRef.current?.closest('footer')
    const workspace = rootRef.current?.closest<HTMLElement>('[data-myna-workspace]')
    if (!footer || !workspace) return
    const update = () => workspace.style.setProperty('--myna-footer-height', `${footer.getBoundingClientRect().height}px`)
    const observer = new ResizeObserver(update)
    observer.observe(footer); update()
    return () => { observer.disconnect(); workspace.style.removeProperty('--myna-footer-height') }
  }, [])
  const { LL, locale } = useI18nContext()
  const t = labels[locale as keyof typeof labels] ?? labels.en
  const activeCount = useMainStore(s => s.activeElementIdList.length)
  const { canvasScalePercentage, scaleCanvas, resetCanvas, setCanvasScalePercentage } = useScaleCanvas()
  const current = Number.parseInt(canvasScalePercentage)
  const values = [...new Set([...CANVAS_ZOOM_PRESETS, current])].sort((a, b) => a - b)
  return <div ref={rootRef} className={styles.zoom} data-myna-zoom>
    <button aria-label={LL.myna.zoomOut()} onClick={() => scaleCanvas('-')}><Minus size={14} /></button>
    <select aria-label={t.zoom} value={current} onChange={event => setCanvasScalePercentage(Number(event.target.value))}>{values.map(value => <option key={value} value={value}>{value}%</option>)}</select>
    <button aria-label={LL.myna.zoomIn()} onClick={() => scaleCanvas('+')}><Plus size={14} /></button>
    <button aria-label={t.all} onClick={fitMynaPages}>{t.all}</button>
    <button onClick={resetCanvas}>{LL.myna.fit()}</button>
    <button aria-label={t.fitSelection} title={t.fitSelection} disabled={!activeCount} onClick={fitMynaSelection}><Focus size={14} /><span>{t.selection}</span></button>
  </div>
}
