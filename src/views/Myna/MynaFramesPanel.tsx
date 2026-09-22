import { selectInsertedElements } from '@/utils/selectInsertedElements'
import { useRef, useState } from 'react'
import { useMainStore, useSlidesStore } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { loadPhotoFrameImage } from './photoFrameUpload'
import type { PPTImageElement } from '@/types/slides'
import { FRAME_LAYOUTS, FRAME_PLACEHOLDER, createPhotoFrames, frameCells, fillPhotoFrame, layoutPhotoFrames, type FrameLayout } from './photoFrames'
import { photoFrameLabels } from './photoFrameLabels'
import styles from './MynaFramesPanel.module.scss'

/** Native clipped images keep all existing render/export/crop/group operations available. */
export default function MynaFramesPanel({ query = '', kind = 'all', compact = false }: { query?: string; kind?: 'all' | 'frames' | 'grids'; compact?: boolean }) {
  const { locale } = useI18nContext()
  const t = photoFrameLabels[locale] || photoFrameLabels.en
  const slides = useSlidesStore(s => s.slides), index = useSlidesStore(s => s.slideIndex)
  const selected = useMainStore(s => s.activeElementIdList), readOnly = useMainStore(s => s.readOnly)
  const [cellId, setCellId] = useState(''), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const { addHistorySnapshot } = useHistorySnapshot()
  const page = slides[index]
  const selectedFrames = page?.elements.filter((e): e is PPTImageElement => e.type === 'image' && !!e.photoFrame && selected.includes(e.id) && (kind === 'all' || (kind === 'frames' ? ['rect', 'roundRect', 'ellipse'].includes(e.photoFrame.layout) : !['rect', 'roundRect', 'ellipse'].includes(e.photoFrame.layout)))) || []
  const first = selectedFrames[0]
  const cells = first?.groupId ? page.elements.filter((e): e is PPTImageElement => e.type === 'image' && !!e.photoFrame && e.groupId === first.groupId) : selectedFrames
  const current = cells.find(e => e.id === cellId) || first
  const locked = readOnly || cells.some(e => e.lock) || busy
  const commit = (updates: PPTImageElement[], pageId = page?.id) => {
    if (useMainStore.getState().readOnly || !pageId) return
    const latest = useSlidesStore.getState().slides.find(s => s.id === pageId)
    if (!latest || updates.some(u => latest.elements.find(e => e.id === u.id)?.lock)) return
    drainCommitQueue()
    useSlidesStore.getState().updateSlide({ elements: latest.elements.map(e => updates.find(u => u.id === e.id) || e) }, pageId)
    addHistorySnapshot()
  }
  const insert = (layout: FrameLayout) => {
    if (readOnly) return
    drainCommitQueue()
    const state = useSlidesStore.getState()
    const elements = createPhotoFrames(layout, state.viewportSize, state.viewportSize * state.viewportRatio, 12, t[layout])
    state.addElement(elements); selectInsertedElements(elements.map(e => e.id)); setCellId(elements[0].id); addHistorySnapshot()
  }
  const fill = async (srcOrFile: string | File, target = current) => {
    if (!target || locked) return
    const pageId = page.id, oldSrc = target.src
    setBusy(true); setFailed(false)
    try {
      const { src, ...size } = await loadPhotoFrameImage(srcOrFile)
      const latest = useSlidesStore.getState().slides.find(s => s.id === pageId)?.elements.find(e => e.id === target.id)
      // An asynchronous upload must not undo deletion, replacement, or newer geometry edits.
      if (latest?.type === 'image' && latest.photoFrame && latest.src === oldSrc && !latest.lock) commit([fillPhotoFrame(latest, src, size.width, size.height)], pageId)
    } catch { setFailed(true) }
    finally { setBusy(false) }
  }
  const assets = [...new Set(slides.flatMap(s => s.elements.filter((e): e is PPTImageElement => e.type === 'image' && !e.photoFrame?.empty).map(e => e.src)))].filter(src => src !== FRAME_PLACEHOLDER)
  const layouts = FRAME_LAYOUTS.filter(layout => (kind === 'all' || (kind === 'frames' ? frameCells(layout).length === 1 : frameCells(layout).length > 1)) && t[layout].toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))
  if (!layouts.length && !current) return null
  return <section className={styles.panel} aria-label={t.title} data-myna-frames={kind}>
    {!compact && <h3>{t.title}</h3>}
    <div className={styles.presets}>{layouts.map(layout => <button type="button" key={layout} disabled={readOnly} onClick={() => insert(layout)}>
      <span className={styles.preview}><svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><pattern id={`frame-preview-${layout}`} width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="#e4e4e7"/><path d="M0 80L32 42 58 67 76 49 100 78V100H0Z" fill="#a1a1aa"/><circle cx="72" cy="28" r="9" fill="#b8b8c0"/></pattern></defs>
        {layout === 'ellipse' ? <circle cx="50" cy="50" r="43" fill={`url(#frame-preview-${layout})`} /> : frameCells(layout).map(([x,y,w,h],i) => <rect key={i} x={x*88+6+2} y={y*88+6+2} width={w*88-4} height={h*88-4} rx={layout === 'roundRect' ? 12 : 2} fill={`url(#frame-preview-${layout})`} />)}
      </svg></span><span>{t[layout]}</span></button>)}</div>
    {current && <><p>{t.hint}</p>
      <div className={styles.cells}>{cells.map((cell, i) => <button key={cell.id} disabled={locked} aria-label={`${t.cell} ${i + 1}`} aria-pressed={current.id === cell.id} onClick={() => { setCellId(cell.id); useMainStore.getState().setActiveElementIdList([cell.id]) }} onDragOver={e => { if (!locked) e.preventDefault() }} onDrop={e => { e.preventDefault(); e.stopPropagation(); setCellId(cell.id); const file = e.dataTransfer.files[0]; if (file) void fill(file, cell) }}><img src={cell.src} alt={cell.photoFrame?.empty ? t.empty : `${t.cell} ${i + 1}`} /></button>)}</div>
      <input ref={picker} type="file" accept="image/*" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void fill(file); e.target.value = '' }} />
      <div className={styles.actions}>
        <button disabled={locked} onClick={() => picker.current?.click()}>{t.fill}</button>
        <button disabled={locked || current.photoFrame?.empty} onClick={() => { useMainStore.getState().setActiveElementIdList([current.id]); useMainStore.getState().setClipingImageElementId(current.id) }}>{t.crop}</button>
        <button disabled={locked || current.photoFrame?.empty} onClick={() => commit([{ ...current, src: FRAME_PLACEHOLDER, clip: { shape: current.clip?.shape || 'rect', range: [[0, 0], [100, 100]] }, photoFrame: { ...current.photoFrame!, empty: true, sourceWidth: undefined, sourceHeight: undefined } }])}>{t.clear}</button>
        {cells.length > 1 && <button disabled={locked} onClick={() => {
          const next = cells[(cells.indexOf(current) + 1) % cells.length]
          const swap = (a: PPTImageElement, b: PPTImageElement) => ({ ...fillPhotoFrame(a, b.src, b.photoFrame?.sourceWidth || b.width, b.photoFrame?.sourceHeight || b.height), photoFrame: { ...a.photoFrame!, empty: b.photoFrame!.empty, sourceWidth: b.photoFrame?.sourceWidth, sourceHeight: b.photoFrame?.sourceHeight } })
          commit([swap(current, next), swap(next, current)])
        }}>{t.swap}</button>}
      </div>
      {cells.length > 1 && <label className={styles.gutter}>{t.gutter}<input type="number" min="0" max="100" disabled={locked || cells.some(e => e.rotate !== 0)} value={current.photoFrame?.gutter || 0} onChange={e => commit(layoutPhotoFrames(cells, Number(e.target.value)))} /></label>}
      {assets.length > 0 && <><p>{t.document}</p><div className={styles.assets}>{assets.map((src, i) => <button key={src} disabled={locked} aria-label={`${t.document} ${i + 1}`} onClick={() => void fill(src)}><img src={src} alt="" /></button>)}</div></>}
    </>}
    {busy && <p role="status">{t.busy}</p>}{failed && <p role="alert">{t.error}</p>}
  </section>
}
