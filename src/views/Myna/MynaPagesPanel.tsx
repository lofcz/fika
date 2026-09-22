import { selectWorkspacePageSummaries } from './workspaceSelectors'
import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { ArrowUp, ArrowDown, Copy, Trash2, Plus, Search } from 'lucide-react'
import { useMainStore, useSlidesStore } from '@/store'
import MynaPageOutline from './MynaPageOutline'
import ThumbnailSlide from '@/views/components/ThumbnailSlide'
import useSlideHandler from '@/hooks/useSlideHandler'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { bindStyles } from '@/utils/cssm'
import styles from './mynaPanels.module.scss'

const cx = bindStyles(styles)
export interface MynaPageLabels {
  hint: string; search: string; empty: string; add: string; duplicate: string; delete: string; moveUp: string; moveDown: string
  page: (number: number) => string
}
export default function MynaPagesPanel({ labels }: { labels: MynaPageLabels }) {
  const slides = useSlidesStore(selectWorkspacePageSummaries)
  const active = useSlidesStore(s => s.slideIndex)
  const ratio = useSlidesStore(s => s.viewportRatio)
  const readOnly = useMainStore(s => s.readOnly)
  const [query, setQuery] = useState('')
  const dragId = useRef<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const { createSlideByTemplate, copyAndPasteSlide, deleteSlide } = useSlideHandler()
  const { addHistorySnapshot } = useHistorySnapshot()
  const goTo = (index: number) => {
    drainCommitQueue()
    const main = useMainStore.getState()
    main.setActiveElementIdList([])
    main.updateSelectedSlidesIndex([])
    useSlidesStore.getState().updateSlideIndex(index)
  }
  const move = (from: number, to: number) => {
    if (readOnly || to < 0 || to >= slides.length) return
    drainCommitQueue()
    useMainStore.getState().setActiveElementIdList([])
    useMainStore.getState().updateSelectedSlidesIndex([])
    useSlidesStore.getState().reorderSlides(from, to)
    addHistorySnapshot()
  }
  const filtered = slides.map((slide, index) => ({ slide, index, content: slide.summary }))
    .filter(({ index, content, slide }) => `${slide.canvasName || labels.page(index + 1)} ${content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <div className={cx('panel')}><MynaPageOutline />
    <p className={cx('hint')}>{labels.hint}</p>
    <label className={cx('search')}><Search size={16} /><input aria-label={labels.search} placeholder={labels.search} value={query} onChange={event => setQuery(event.target.value)} /></label>
    <button type="button" className={cx('add-page')} disabled={readOnly} onClick={() => { drainCommitQueue(); createSlideByTemplate({ id: nanoid(10), elements: [], background: { type: 'solid', color: '#ffffff' } }) }}><Plus size={17} />{labels.add}</button>
    {!filtered.length && <p className={cx('empty')}>{labels.empty}</p>}
    <div className={cx('page-grid')}>{filtered.map(({ slide, index, content }) => <div key={slide.id} className={cx('page-card', { selected: active === index, dropping: dropId === slide.id })}
      draggable={!readOnly}
      onDragStart={event => { dragId.current = slide.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/x-myna-page', slide.id) }}
      onDragEnd={() => { dragId.current = null; setDropId(null) }}
      onDragOver={event => { if (!readOnly && dragId.current && dragId.current !== slide.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropId(slide.id) } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropId(null) }}
      onDrop={event => {
        event.preventDefault()
        const source = dragId.current
        dragId.current = null; setDropId(null)
        if (!source || readOnly || event.dataTransfer.getData('text/x-myna-page') !== source) return
        const from = useSlidesStore.getState().slides.findIndex(page => page.id === source)
        if (from >= 0 && from !== index) move(from, index)
      }}>
      <button type="button" className={cx('page-preview')} aria-label={slide.canvasName || labels.page(index + 1)} aria-current={active === index ? 'page' : undefined} onClick={() => goTo(index)}>
        <ThumbnailSlide slide={slide} size={Math.min(230, 150 / ratio)} />
      </button>
      <div className={cx('page-caption')}><strong>{slide.canvasName || labels.page(index + 1)}</strong><span title={content}>{content}</span></div>
      <div className={cx('page-actions')}>
        <button type="button" disabled={readOnly || index === 0} aria-label={labels.moveUp} title={labels.moveUp} onClick={() => move(index, index - 1)}><ArrowUp size={15} /></button>
        <button type="button" disabled={readOnly || index === slides.length - 1} aria-label={labels.moveDown} title={labels.moveDown} onClick={() => move(index, index + 1)}><ArrowDown size={15} /></button>
        <button type="button" disabled={readOnly} aria-label={labels.duplicate} title={labels.duplicate} onClick={() => { goTo(index); copyAndPasteSlide() }}><Copy size={15} /></button>
        <button type="button" disabled={readOnly || slides.length === 1} aria-label={labels.delete} title={labels.delete} onClick={() => { drainCommitQueue(); useMainStore.getState().setActiveElementIdList([]); deleteSlide([slide.id]) }}><Trash2 size={15} /></button>
      </div>
    </div>)}</div>
  </div>
}
