import { useEffect, useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { Star, Trash2, Pencil, Plus, Search } from 'lucide-react'
import { useMainStore, useSlidesStore } from '@/store'
import ThumbnailSlide from '@/views/components/ThumbnailSlide'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { bindStyles } from '@/utils/cssm'
import { instantiateTemplate, portableTemplateSlides, rankTemplates, readTemplateLibrary, writeTemplateLibrary, TEMPLATE_LIBRARY_KEY, type PersonalTemplate } from './templateLibrary'
import { libraryMessages } from './libraryMessages'
import styles from './templateLibrary.module.scss'
const cx = bindStyles(styles)

export default function MynaTemplateLibrary({ locale }: { locale: string }) {
  const t = libraryMessages(locale)
  const title = useSlidesStore(s => s.title)
  const width = useSlidesStore(s => s.viewportSize)
  const ratio = useSlidesStore(s => s.viewportRatio)
  const readOnly = useMainStore(s => s.readOnly)
  const { addHistorySnapshot } = useHistorySnapshot()
  const [templates, setTemplates] = useState<PersonalTemplate[]>([])
  const [unreadable, setUnreadable] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [notice, setNotice] = useState<'saved' | 'added' | 'failed' | null>(null)
  const [name, setName] = useState(title)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'favorites' | 'recent'>('all')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  useEffect(() => {
    const load = () => {
      try { const items = readTemplateLibrary(localStorage); setTemplates(items); setExpanded(items.length > 0); setUnreadable(false) }
      catch { setUnreadable(true) }
    }
    load()
    const storage = (event: StorageEvent) => { if (event.key === TEMPLATE_LIBRARY_KEY) load() }
    window.addEventListener('storage', storage)
    return () => window.removeEventListener('storage', storage)
  }, [])
  const update = (mutate: (current: PersonalTemplate[]) => PersonalTemplate[]) => {
    try {
      const next = mutate(readTemplateLibrary(localStorage))
      writeTemplateLibrary(localStorage, next)
      setTemplates(next)
      setNotice(null)
      return true
    } catch { setNotice('failed'); return false }
  }
  const save = async () => {
    if (busy || !name.trim() || unreadable || readOnly) return
    setBusy(true)
    try {
      drainCommitQueue()
      const state = useSlidesStore.getState()
      const slides = await portableTemplateSlides(state.slides)
      // Strip annotations at capture time too: private comments never enter the personal library.
      for (const slide of slides) { delete slide.notes; delete slide.remark; delete slide.sourcePackageId; delete slide.skeleton }
      const now = Date.now()
      const item: PersonalTemplate = { id: nanoid(12), name: name.trim(), width: state.viewportSize, height: state.viewportSize * state.viewportRatio, slides, theme: JSON.parse(JSON.stringify(state.theme)), favorite: false, createdAt: now, updatedAt: now, lastUsedAt: 0 }
      if (update(current => [item, ...current])) setNotice('saved')
    } catch { setNotice('failed') }
    finally { setBusy(false) }
  }
  const visible = useMemo(() => rankTemplates(templates.filter(item =>
    (filter !== 'favorites' || item.favorite) && item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), width, width * ratio, filter === 'recent' ? 'recent' : 'match'), [templates, filter, query, width, ratio])
  const previews = useMemo(() => new Map(visible.map(item => [item.id, instantiateTemplate(item, width, width * ratio)[0]])), [visible, width, ratio])
  return <details className={cx('library')} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{t.title}{templates.length > 0 ? ` (${templates.length})` : ''}</summary><p>{t.hint}</p>
    {unreadable && <p role="alert">{t.unreadable}</p>}
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <input aria-label={t.name} placeholder={t.name} value={name} maxLength={120} onChange={event => setName(event.target.value)} />
      <button type="submit" disabled={busy || unreadable || readOnly || !name.trim()}><Plus size={16}/>{busy ? t.saving : t.save}</button>
    </form>
    <label className={cx('search')}><Search size={16}/><input aria-label={t.search} placeholder={t.search} value={query} onChange={event => setQuery(event.target.value)}/></label>
    <div className={cx('filters')}>{(['all', 'favorites', 'recent'] as const).map(key => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{t[key]}</button>)}</div>
    <p>{t.fit}</p>
    {notice && <p role={notice === 'failed' ? 'alert' : 'status'}>{t[notice]}</p>}
    {!visible.length && <p>{t.empty}</p>}
    <div className={cx('grid')}>{visible.map(item => <article key={item.id}>
      <button type="button" className={cx('preview')} disabled={readOnly} title={t.use} aria-label={`${t.use}: ${item.name}`} onClick={() => {
        if (useMainStore.getState().readOnly) return
        drainCommitQueue()
        const current = useSlidesStore.getState()
        const slides = instantiateTemplate(item, current.viewportSize, current.viewportSize * current.viewportRatio)
        useMainStore.getState().setActiveElementIdList([])
        useMainStore.getState().updateSelectedSlidesIndex([])
        current.addSlide(slides, { keepSectionTag: true })
        addHistorySnapshot()
        if (update(items => items.map(value => value.id === item.id ? { ...value, lastUsedAt: Date.now() } : value))) setNotice('added')
      }}><ThumbnailSlide slide={previews.get(item.id)!} size={Math.min(130, 160 / ratio)} /></button>
      {editing === item.id ? <form onSubmit={event => { event.preventDefault(); if (editName.trim() && update(items => items.map(value => value.id === item.id ? { ...value, name: editName.trim(), updatedAt: Date.now() } : value))) setEditing(null) }}>
        <input aria-label={t.name} autoFocus maxLength={120} value={editName} onChange={event => setEditName(event.target.value)}/><button type="submit" disabled={!editName.trim()}>{t.rename}</button><button type="button" onClick={() => setEditing(null)}>{t.cancel}</button>
      </form> : <strong>{item.name}</strong>}
      <small>{t.pages}: {item.slides.length} · {Math.round(item.width)} × {Math.round(item.height)}</small>
      <div className={cx('actions')}>
        <button type="button" title={item.favorite ? t.unfavorite : t.favorite} aria-label={item.favorite ? t.unfavorite : t.favorite} aria-pressed={item.favorite} onClick={() => update(items => items.map(value => value.id === item.id ? { ...value, favorite: !value.favorite } : value))}><Star size={16} fill={item.favorite ? 'currentColor' : 'none'}/></button>
        <button type="button" title={t.rename} aria-label={t.rename} onClick={() => { setEditing(item.id); setEditName(item.name) }}><Pencil size={16}/></button>
        <button type="button" title={t.remove} aria-label={t.remove} onClick={() => setDeleting(item.id)}><Trash2 size={16}/></button>
      </div>
      {deleting === item.id && <div className={cx('confirm')}><p>{t.confirm}</p><button type="button" onClick={() => { if (update(items => items.filter(value => value.id !== item.id))) setDeleting(null) }}>{t.remove}</button><button type="button" onClick={() => setDeleting(null)}>{t.cancel}</button></div>}
    </article>)}</div>
  </details>
}
