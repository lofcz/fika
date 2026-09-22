import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Frame, Plus, ChevronRight, ChevronDown } from 'lucide-react'
import { useMainStore, useSlidesStore } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { createFrameFromSelection, frameAncestors, frameDescendantIds, isFrame, normalizeFrameOrder, reparentFrameElements } from '@/utils/nestedFrames'
import type { PPTElement } from '@/types/slides'
import styles from './framesHierarchy.module.scss'
const messages = {
  en: { title: 'Frames', empty: 'Add a frame to organize artwork inside other frames.', add: 'Add frame', selection: 'Frame selection', frame: 'Frame', parent: 'Parent frame', root: 'Page', clip: 'Clip content', release: 'Release children', name: 'Frame name', expand: 'Expand frame', collapse: 'Collapse frame', text: 'Text', shape: 'Shape', image: 'Image', line: 'Line', chart: 'Chart', table: 'Table', latex: 'Formula', video: 'Video', audio: 'Audio' },
  cs: { title: 'Rámce', empty: 'Přidejte rámec a uspořádejte obsah do vnořených rámců.', add: 'Přidat rámec', selection: 'Rámec z výběru', frame: 'Rámec', parent: 'Nadřazený rámec', root: 'Stránka', clip: 'Oříznout obsah', release: 'Vyjmout obsah z rámce', name: 'Název rámce', expand: 'Rozbalit rámec', collapse: 'Sbalit rámec', text: 'Text', shape: 'Tvar', image: 'Obrázek', line: 'Čára', chart: 'Graf', table: 'Tabulka', latex: 'Vzorec', video: 'Video', audio: 'Zvuk' },
  sk: { title: 'Rámce', empty: 'Pridajte rámec a usporiadajte obsah do vnorených rámcov.', add: 'Pridať rámec', selection: 'Rámec z výberu', frame: 'Rámec', parent: 'Nadradený rámec', root: 'Stránka', clip: 'Orezať obsah', release: 'Vybrať obsah z rámca', name: 'Názov rámca', expand: 'Rozbaliť rámec', collapse: 'Zbaliť rámec', text: 'Text', shape: 'Tvar', image: 'Obrázok', line: 'Čiara', chart: 'Graf', table: 'Tabuľka', latex: 'Vzorec', video: 'Video', audio: 'Zvuk' },
  pl: { title: 'Ramki', empty: 'Dodaj ramkę, aby porządkować zawartość w zagnieżdżonych ramkach.', add: 'Dodaj ramkę', selection: 'Ramka z zaznaczenia', frame: 'Ramka', parent: 'Ramka nadrzędna', root: 'Strona', clip: 'Przytnij zawartość', release: 'Wyjmij zawartość z ramki', name: 'Nazwa ramki', expand: 'Rozwiń ramkę', collapse: 'Zwiń ramkę', text: 'Tekst', shape: 'Kształt', image: 'Obraz', line: 'Linia', chart: 'Wykres', table: 'Tabela', latex: 'Wzór', video: 'Wideo', audio: 'Dźwięk' },
}
export default function MynaFramesHierarchy() {
  const { locale } = useI18nContext(), t = messages[locale as keyof typeof messages] || messages.en
  const slides = useSlidesStore(s => s.slides), index = useSlidesStore(s => s.slideIndex), ids = useMainStore(s => s.activeElementIdList), readOnly = useMainStore(s => s.readOnly)
  const hidden = useMainStore(s => s.hiddenElementIdList)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const { addHistorySnapshot } = useHistorySnapshot()
  const slide = slides[index]; if (!slide) return null
  const elements = slide.elements, selected = elements.filter(el => ids.includes(el.id)), frame = selected.length === 1 && isFrame(selected[0]) ? selected[0] : undefined
  const locked = selected.some(el => el.lock || frameAncestors(el, elements).some(parent => parent.lock))
  const commit = (next: PPTElement[], selection = ids) => { if (readOnly) return; drainCommitQueue(); useSlidesStore.getState().updateSlide({ elements: next }, slide.id); useMainStore.getState().setActiveElementIdList(selection); addHistorySnapshot() }
  const add = (selection: string[]) => { drainCommitQueue(); const current = useSlidesStore.getState().slides[index]; const result = createFrameFromSelection(current.elements, selection, nanoid(12), `${t.frame} ${current.elements.filter(isFrame).length + 1}`); commit(result.elements, result.selection) }
  const excluded = new Set(frameDescendantIds(elements, ids)), parents = elements.filter(isFrame).filter(el => !excluded.has(el.id) && !el.lock && !frameAncestors(el, elements).some(parent => parent.lock))
  const parent = selected.length && selected.every(el => el.parentFrameId === selected[0].parentFrameId) ? selected[0].parentFrameId || '' : ''
  return <section className={styles.panel} data-myna-frames-hierarchy>
    <h3>{t.title}</h3>
    <div className={styles.actions}><button type="button" disabled={readOnly} onClick={() => add([])}><Plus size={15} />{t.add}</button><button type="button" disabled={readOnly || locked || !selected.length} onClick={() => add(ids)}><Frame size={15} />{t.selection}</button></div>
    {!elements.some(isFrame) && <p>{t.empty}</p>}
    {selected.length > 0 && <div className={styles.properties}>
      {frame && <label>{t.name}<input key={frame.id + (frame.name || '')} aria-label={t.name} defaultValue={frame.name || t.frame} disabled={readOnly || locked} onBlur={event => { const name = event.target.value.trim() || t.frame; if (name !== frame.name) commit(elements.map(el => el.id === frame.id ? { ...el, name } : el)) }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>}
      <label>{t.parent}<select aria-label={t.parent} value={parent} disabled={readOnly || locked} onChange={event => commit(reparentFrameElements(elements, ids, event.target.value || undefined))}><option value="">{t.root}</option>{parents.map(el => <option key={el.id} value={el.id}>{el.name || t.frame}</option>)}</select></label>
      {frame && <><label className={styles.check}><input type="checkbox" checked={frame.frame!.clipContent} disabled={readOnly || locked} onChange={event => commit(elements.map(el => el.id === frame.id ? { ...frame, frame: { clipContent: event.target.checked } } : el))} />{t.clip}</label><button type="button" disabled={readOnly || locked || !elements.some(el => el.parentFrameId === frame.id)} onClick={() => commit(reparentFrameElements(elements, elements.filter(el => el.parentFrameId === frame.id).map(el => el.id), frame.parentFrameId))}>{t.release}</button></>}
    </div>}
    <div className={styles.tree} role="tree" aria-label={t.title}>{normalizeFrameOrder(elements).filter(el => !frameAncestors(el, elements).some(parent => collapsed.includes(parent.id))).map(el => { const depth = frameAncestors(el, elements).length, container = isFrame(el); return <div key={el.id} className={styles.row} style={{ paddingLeft: 8 + depth * 16 }}>
      {container ? <button className={styles.disclosure} type="button" aria-label={collapsed.includes(el.id) ? t.expand : t.collapse} onClick={() => setCollapsed(old => old.includes(el.id) ? old.filter(id => id !== el.id) : [...old, el.id])}>{collapsed.includes(el.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button> : <span className={styles.spacer} />}
      <button role="treeitem" aria-level={depth + 1} aria-selected={ids.includes(el.id)} aria-expanded={container ? !collapsed.includes(el.id) : undefined} data-frame-element-id={el.id} type="button" disabled={!!el.lock || hidden.includes(el.id) || frameAncestors(el, elements).some(parent => parent.lock || hidden.includes(parent.id))} onClick={event => { drainCommitQueue(); useMainStore.getState().setActiveElementIdList(event.shiftKey ? ids.includes(el.id) ? ids.filter(id => id !== el.id) : [...ids, el.id] : [el.id]) }}>{container && <Frame size={14} />}<span>{el.name || (container ? t.frame : t[el.type as keyof typeof t] || el.type)}</span></button>
    </div> })}</div>
  </section>
}
