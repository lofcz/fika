import MynaFramesHierarchy from './MynaFramesHierarchy'
import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Lock, Pencil, Search, Trash2, Unlock } from 'lucide-react'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useAddSlidesOrElements from '@/hooks/useAddSlidesOrElements'
import { collectOrderUnitIds, orderElementList } from '@/utils/elementOrder'
import { drainCommitQueue } from '@/utils/commitQueue'
import { bindStyles } from '@/utils/cssm'
import styles from './mynaPanels.module.scss'

const cx = bindStyles(styles)
export default function MynaLayersPanel() {
  const { LL } = useI18nContext()
  const t = LL.myna
  const slide = useSlidesStore(selectCurrentSlide)
  const selected = useMainStore(s => s.activeElementIdList)
  const hidden = useMainStore(s => s.hiddenElementIdList)
  const readOnly = useMainStore(s => s.readOnly)
  const { addHistorySnapshot } = useHistorySnapshot()
  const { addElementsFromData } = useAddSlidesOrElements()
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState('')
  const dragId = useRef<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const elements = slide?.elements ?? []
  const seen = new Set<string>()
  const rows = [...elements].reverse().filter(element => {
    const key = element.groupId ?? element.id
    if (seen.has(key)) return false
    seen.add(key); return true
  }).map(element => {
    const ids = collectOrderUnitIds(elements, [element.id])
    const members = elements.filter(item => ids.includes(item.id))
    const label = element.name || (members.length > 1 ? `${LL.editor.selectPanel.group()} · ${members.length}` : element.type === 'text' ? element.content.replace(/<[^>]*>/g, ' ').trim().slice(0, 70) || LL.editor.elementTypes.text() : LL.editor.elementTypes[element.type]())
    return { element, ids, label, members, locked: members.some(item => item.lock), invisible: ids.every(id => hidden.includes(id)) }
  })
  const filtered = rows.filter(row => row.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const select = (ids: string[]) => {
    drainCommitQueue()
    useMainStore.getState().setActiveElementIdList(ids)
  }
  const commit = (next: PPTElement[]) => {
    useSlidesStore.getState().updateSlide({ elements: next })
    addHistorySnapshot()
  }
  const order = (id: string, direction: 'up' | 'down') => {
    if (readOnly) return
    drainCommitQueue()
    const current = selectCurrentSlide(useSlidesStore.getState())
    if (!current) return
    const unit = collectOrderUnitIds(current.elements, [id])
    if (current.elements.some(element => unit.includes(element.id) && element.lock)) return
    const next = orderElementList(current.elements, [id], direction)
    if (next) commit(next)
  }
  const saveName = () => {
    if (!renaming) return
    const id = renaming
    setRenaming(null)
    if (readOnly) return
    drainCommitQueue()
    const current = selectCurrentSlide(useSlidesStore.getState())
    if (!current?.elements.some(element => element.id === id && !element.lock)) return
    commit(current.elements.map(element => element.id === id ? { ...element, name: name.trim() } : element))
  }
  return <div className={cx('panel')}><MynaFramesHierarchy />
    <p className={cx('hint')}>{t.layerHint()}</p>
    <label className={cx('search')}><Search size={16} /><input aria-label={t.searchLayers()} placeholder={t.searchLayers()} value={query} onChange={event => setQuery(event.target.value)} /></label>
    {!filtered.length && <p className={cx('empty')}>{elements.length ? t.noLayersFound() : LL.editor.selectPanel.emptyPage()}</p>}
    <div className={cx('layer-list')}>{filtered.map(({ element, ids, label, locked, invisible }) => <div key={element.id} className={cx('layer-card', { selected: ids.some(id => selected.includes(id)), dropping: dropId === element.id, invisible })}
      draggable={!readOnly && !locked && renaming !== element.id}
      onDragStart={event => { dragId.current = element.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/x-myna-layer', element.id) }}
      onDragEnd={() => { dragId.current = null; setDropId(null) }}
      onDragOver={event => { if (!readOnly && dragId.current && !ids.includes(dragId.current)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropId(element.id) } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropId(null) }}
      onDrop={event => {
        event.preventDefault()
        const source = dragId.current
        dragId.current = null; setDropId(null)
        if (readOnly || !source || event.dataTransfer.getData('text/x-myna-layer') !== source) return
        drainCommitQueue()
        const current = selectCurrentSlide(useSlidesStore.getState())
        if (!current) return
        const sourceIds = collectOrderUnitIds(current.elements, [source])
        const targetIds = collectOrderUnitIds(current.elements, [element.id])
        if (targetIds.some(id => sourceIds.includes(id))) return
        const moving = current.elements.filter(item => sourceIds.includes(item.id))
        if (!moving.length || moving.some(item => item.lock)) return
        const rest = current.elements.filter(item => !sourceIds.includes(item.id))
        const towardBack = current.elements.findIndex(item => item.id === source) > current.elements.findIndex(item => item.id === element.id)
        const target = towardBack ? rest.findIndex(item => targetIds.includes(item.id)) : rest.reduce((found, item, index) => targetIds.includes(item.id) ? index + 1 : found, -1)
        if (target >= 0) commit([...rest.slice(0, target), ...moving, ...rest.slice(target)])
      }}>
      <div className={cx('layer-title')}><GripVertical size={13} aria-hidden="true" />
        {renaming === element.id ? <input autoFocus value={name} aria-label={t.layerName()} onChange={event => setName(event.target.value)} onBlur={saveName} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); saveName() } if (event.key === 'Escape') { event.preventDefault(); setRenaming(null) } }} /> : <button type="button" className={cx('layer-name')} disabled={locked || invisible} onClick={() => select(ids)} onDoubleClick={() => { if (!readOnly) { setName(element.name ?? label); setRenaming(element.id) } }} onKeyDown={event => { if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); event.stopPropagation(); order(element.id, event.key === 'ArrowUp' ? 'up' : 'down') } }}>{label}</button>}
      </div>
      <div className={cx('layer-actions')}>
        <button type="button" disabled={readOnly} aria-label={invisible ? t.showLayer() : t.hideLayer()} title={invisible ? t.showLayer() : t.hideLayer()} onClick={() => { const main = useMainStore.getState(); main.setHiddenElementIdList(invisible ? main.hiddenElementIdList.filter(id => !ids.includes(id)) : [...new Set([...main.hiddenElementIdList, ...ids])]); main.setActiveElementIdList(main.activeElementIdList.filter(id => !ids.includes(id))) }}>{invisible ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button type="button" disabled={readOnly} aria-label={locked ? t.unlockLayer() : t.lockLayer()} title={locked ? t.unlockLayer() : t.lockLayer()} onClick={() => { drainCommitQueue(); const current = selectCurrentSlide(useSlidesStore.getState()); if (!current) return; commit(current.elements.map(item => ids.includes(item.id) ? { ...item, lock: !locked } : item)); useMainStore.getState().setActiveElementIdList([]) }}>{locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
        <button type="button" disabled={readOnly || locked} aria-label={t.renameLayer()} title={t.renameLayer()} onClick={() => { setName(element.name ?? label); setRenaming(element.id) }}><Pencil size={14} /></button>
        <button type="button" disabled={readOnly || locked || rows[0]?.element.id === element.id} aria-label={t.forward()} title={t.forward()} onClick={() => order(element.id, 'up')}><ArrowUp size={14} /></button>
        <button type="button" disabled={readOnly || locked || rows.at(-1)?.element.id === element.id} aria-label={t.backward()} title={t.backward()} onClick={() => order(element.id, 'down')}><ArrowDown size={14} /></button>
        <button type="button" disabled={readOnly || locked} aria-label={t.duplicateLayer()} title={t.duplicateLayer()} onClick={() => { drainCommitQueue(); const current = selectCurrentSlide(useSlidesStore.getState()); const members = current?.elements.filter(item => ids.includes(item.id)) ?? []; if (members.length) addElementsFromData(members) }}><Copy size={14} /></button>
        <button type="button" disabled={readOnly || locked} aria-label={t.deleteLayer()} title={t.deleteLayer()} onClick={() => { drainCommitQueue(); const current = selectCurrentSlide(useSlidesStore.getState()); if (!current) return; useMainStore.getState().setActiveElementIdList([]); useSlidesStore.getState().updateSlide({ elements: current.elements.filter(item => !ids.includes(item.id)), animations: current.animations?.filter(animation => !ids.includes(animation.elId)) }); addHistorySnapshot() }}><Trash2 size={14} /></button>
      </div>
    </div>)}</div>
  </div>
}
