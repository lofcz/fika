import { recordRender } from '@/utils/renderMetrics'
import { memo, useRef, useState, type PointerEvent } from 'react'
import { nanoid } from 'nanoid'
import { useMainStore, useSlidesStore, useKeyboardStore } from '@/store'
import type { WorkspaceLabel } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { resolvePagePositions } from './pageLayout'
import { useMynaViewStore } from './viewStore'
import styles from './WorkspaceLabels.module.scss'
import { useWorkspacePages, useWorkspaceAnnotations } from './workspaceSelectors'
import { workspaceObjectRect } from './workspaceLabels'
import { WorkspaceObjectsPanel, WorkspaceObject } from './WorkspaceObjects'

const messages = {
  en: { title: 'Workspace labels', text: 'Label text', add: 'Add label', remove: 'Delete label', size: 'Text size', hint: 'Labels live outside page artwork and are not exported. Drag to position; double-click to edit.', placeholder: 'Untitled label' },
  cs: { title: 'Popisky pracovní plochy', text: 'Text popisku', add: 'Přidat popisek', remove: 'Odstranit popisek', size: 'Velikost textu', hint: 'Popisky jsou mimo obsah stránek a neexportují se. Přetažením je přesunete, dvojklikem upravíte.', placeholder: 'Popisek bez názvu' },
  sk: { title: 'Popisy pracovnej plochy', text: 'Text popisu', add: 'Pridať popis', remove: 'Odstrániť popis', size: 'Veľkosť textu', hint: 'Popisy sú mimo obsahu stránok a neexportujú sa. Potiahnutím ich presuniete, dvojklikom upravíte.', placeholder: 'Popis bez názvu' },
  pl: { title: 'Etykiety obszaru roboczego', text: 'Tekst etykiety', add: 'Dodaj etykietę', remove: 'Usuń etykietę', size: 'Rozmiar tekstu', hint: 'Etykiety nie należą do zawartości stron i nie są eksportowane. Przeciągnij, aby przesunąć; kliknij dwukrotnie, aby edytować.', placeholder: 'Etykieta bez nazwy' },
}
function updateLabel(owner: string, id: string, patch: Partial<WorkspaceLabel> | null) {
  const store = useSlidesStore.getState()
  const slide = store.slides.find(page => page.id === owner)
  if (!slide || useMainStore.getState().readOnly) return
  store.updateSlide({ workspaceLabels: patch ? slide.workspaceLabels?.map(label => label.id === id ? { ...label, ...patch } : label) : slide.workspaceLabels?.filter(label => label.id !== id) }, owner)
}
export function WorkspaceLabelsPanel() {
  const { locale } = useI18nContext(), t = messages[locale as keyof typeof messages] || messages.en
  const slides = useWorkspaceAnnotations(), index = useSlidesStore(s => s.slideIndex)
  const readOnly = useMainStore(s => s.readOnly)
  const { addHistorySnapshot } = useHistorySnapshot()
  const [text, setText] = useState('')
  return <section className={styles.panel} data-myna-workspace-labels-panel>
    <WorkspaceObjectsPanel /><h3>{t.title}</h3><p>{t.hint}</p>
    <form onSubmit={event => {
      event.preventDefault(); if (readOnly || !slides.length) return
      drainCommitQueue()
      const store = useSlidesStore.getState()
      const origin = resolvePagePositions(store.slides, store.viewportSize, store.viewportSize * store.viewportRatio).get(slides[index]?.id) || { x: 0, y: 0 }
      const owner = store.slides[0]
      const label: WorkspaceLabel = { id: nanoid(10), text: text.trim() || t.placeholder, x: origin.x, y: origin.y - 100 - (owner.workspaceLabels?.length || 0) * 48, fontSize: 28 }
      store.updateSlide({ workspaceLabels: [...(owner.workspaceLabels || []), label] }, owner.id)
      addHistorySnapshot(); setText('')
    }}><input aria-label={t.text} maxLength={2000} placeholder={t.text} disabled={readOnly} value={text} onChange={event => setText(event.target.value)} /><button disabled={readOnly}>{t.add}</button></form>
    {slides.flatMap(page => (page.workspaceLabels || []).filter(label => !label.kind).map(label => <LabelFields key={page.id + label.id} label={label} owner={page.id} />))}
  </section>
}
function LabelFields({ label, owner }: { label: WorkspaceLabel; owner: string }) {
  const { locale } = useI18nContext(), t = messages[locale as keyof typeof messages] || messages.en
  const { addHistorySnapshot } = useHistorySnapshot()
  const readOnly = useMainStore(s => s.readOnly)
  return <div className={styles.fields}>
    <input aria-label={t.text} key={label.text} defaultValue={label.text} maxLength={2000} disabled={readOnly} onBlur={event => { const text = event.target.value.trim(); if (text && text !== label.text) { drainCommitQueue(); updateLabel(owner, label.id, { text }); addHistorySnapshot() } }} />
    <input aria-label={t.size} type="number" min={8} max={200} key={label.fontSize} defaultValue={label.fontSize} disabled={readOnly} onBlur={event => { const fontSize = Math.max(8, Math.min(200, Number(event.target.value))); if (Number.isFinite(fontSize) && fontSize !== label.fontSize) { drainCommitQueue(); updateLabel(owner, label.id, { fontSize }); addHistorySnapshot() } }} />
    <button aria-label={t.remove} disabled={readOnly} onClick={() => { drainCommitQueue(); updateLabel(owner, label.id, null); addHistorySnapshot() }}>×</button>
  </div>
}
export const WorkspaceLabelsCanvas = memo(function WorkspaceLabelsCanvas({ left, top, originX, originY, scale }: { left: number; top: number; originX: number; originY: number; scale: number }) {
  // Keep annotation geometry in world space. Rebasing the active page must not
  // repeatedly quantize its labels through opposing CSS layout/transform offsets.
  const x = +(left - originX * scale).toFixed(6)
  const y = +(top - originY * scale).toFixed(6)
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transform: `translate(${x}px, ${y}px)` }}><WorkspaceAnnotationsScene /></div>
})
const WorkspaceAnnotationsScene = memo(function WorkspaceAnnotationsScene() {
  recordRender('WorkspaceLabelsCanvas')
  const pages = useWorkspacePages(), owners = useWorkspaceAnnotations()
  const width = useSlidesStore(s => s.viewportSize), ratio = useSlidesStore(s => s.viewportRatio)
  const scale = useMainStore(s => s.canvasScale)
  return <>{owners.flatMap(page => (page.workspaceLabels || []).map(label => workspaceObjectRect(label, pages, width, width * ratio)).map(label => <CanvasLabel key={page.id + label.id} label={label} owner={page.id} scale={scale} x={label.x * scale} y={label.y * scale} />))}</>
})

function PlainCanvasLabel({ label, owner, x, y, scale }: { label: WorkspaceLabel; owner: string; x: number; y: number; scale: number }) {
  const { locale } = useI18nContext(), t = messages[locale as keyof typeof messages] || messages.en
  const readOnly = useMainStore(s => s.readOnly)
  const { addHistorySnapshot, undo, redo } = useHistorySnapshot()
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState('')
  const drag = useRef<{ x: number; y: number; start: WorkspaceLabel; moved: boolean } | null>(null)
  const cancelEdit = useRef(false)
  const finish = (cancel = false) => { const current = drag.current; drag.current = null; if (!current?.moved) return; if (cancel) updateLabel(owner, label.id, { x: current.start.x, y: current.start.y }); else addHistorySnapshot() }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current; if (!current) return
    let dx = (event.clientX - current.x) / scale, dy = (event.clientY - current.y) / scale
    if (!current.moved && Math.hypot(dx, dy) * scale < 3) return
    current.moved = true
    const lockX = event.shiftKey && Math.abs(dx) <= Math.abs(dy), lockY = event.shiftKey && !lockX
    if (lockX) dx = 0
    if (lockY) dy = 0
    const view = useMynaViewStore.getState()
    const grid = view.snapPagesToGrid && !event.altKey ? view.gridSize : 0
    const snap = (value: number) => grid ? Math.round(value / grid) * grid : value
    updateLabel(owner, label.id, { x: lockX ? current.start.x : snap(current.start.x + dx), y: lockY ? current.start.y : snap(current.start.y + dy) })
  }
  const save = () => { setEditing(false); if (cancelEdit.current) { cancelEdit.current = false; return } if (draft.trim() && draft.trim() !== label.text && !readOnly) { drainCommitQueue(); updateLabel(owner, label.id, { text: draft.trim() }); addHistorySnapshot() } }
  return <div data-myna-page-chrome data-myna-workspace-label={label.id} className={styles.label} style={{ left: x, top: y, fontSize: label.fontSize * scale, maxWidth: 800 * scale }} onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation()
    if (!editing && !readOnly && (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); addHistorySnapshot.flush()
      if (event.key.toLowerCase() === 'y' || event.shiftKey) redo(); else undo()
    }
  }}>
    {editing && !readOnly ? <textarea autoFocus aria-label={t.text} maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} onBlur={save} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelEdit.current = true; setEditing(false) } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save() } }} /> : <button aria-label={label.text} onDoubleClick={() => { if (!readOnly) { cancelEdit.current = false; setDraft(label.text); setEditing(true) } }} onPointerDown={event => { if (readOnly || event.button !== 0 || useKeyboardStore.getState().spaceKeyState) return; event.preventDefault(); event.stopPropagation(); drainCommitQueue(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, start: { ...label }, moved: false } }} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onKeyDown={event => {
      if (event.key === 'Escape') { finish(true); return }
      if (readOnly) return
      if (event.key === 'Enter') { event.preventDefault(); cancelEdit.current = false; setDraft(label.text); setEditing(true); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); updateLabel(owner, label.id, null); addHistorySnapshot(); return }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault(); const step = event.shiftKey ? 10 : 1
      updateLabel(owner, label.id, { x: label.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: label.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) }); addHistorySnapshot()
    }}>{label.text}</button>}
  </div>
}

const CanvasLabel = memo(function CanvasLabel(props: { label: WorkspaceLabel; owner: string; x: number; y: number; scale: number }) {
  return props.label.kind ? <WorkspaceObject {...props} /> : <PlainCanvasLabel {...props} />
})
