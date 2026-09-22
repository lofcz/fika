import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { useMainStore, useSlidesStore } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { htmlToText } from '@/utils/common'
import styles from './pageOutline.module.scss'

const messages = {
  en: { title: 'Page outline & notes', section: 'Start section', remove: 'Remove section', name: 'Section name', notes: 'Speaker notes', save: 'Save notes', hint: 'Notes stay with this page. Editing here saves plain text.', saved: 'Page notes saved.' },
  cs: { title: 'Osnova a poznámky', section: 'Začátek oddílu', remove: 'Odstranit oddíl', name: 'Název oddílu', notes: 'Poznámky přednášejícího', save: 'Uložit poznámky', hint: 'Poznámky patří k této stránce. Úpravy zde se ukládají jako prostý text.', saved: 'Poznámky ke stránce uloženy.' },
  sk: { title: 'Osnova a poznámky', section: 'Začiatok oddielu', remove: 'Odstrániť oddiel', name: 'Názov oddielu', notes: 'Poznámky prednášajúceho', save: 'Uložiť poznámky', hint: 'Poznámky patria k tejto stránke. Úpravy sa ukladajú ako obyčajný text.', saved: 'Poznámky k stránke uložené.' },
  pl: { title: 'Konspekt i notatki', section: 'Początek sekcji', remove: 'Usuń sekcję', name: 'Nazwa sekcji', notes: 'Notatki prelegenta', save: 'Zapisz notatki', hint: 'Notatki dotyczą tej strony. Zmiany są zapisywane jako zwykły tekst.', saved: 'Zapisano notatki strony.' },
}
const notesText = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const br of doc.querySelectorAll('br')) br.replaceWith('\n')
  for (const block of doc.querySelectorAll('p,li,div')) block.append('\n')
  return (doc.body.textContent || '').replace(/\n$/, '')
}
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export default function MynaPageOutline() {
  const { locale, LL } = useI18nContext()
  const t = messages[locale as keyof typeof messages] || messages.en
  const slides = useSlidesStore(s => s.slides), index = useSlidesStore(s => s.slideIndex)
  const readOnly = useMainStore(s => s.readOnly)
  const slide = slides[index]
  const [notes, setNotes] = useState(''), [name, setName] = useState(''), [savedRemark, setSavedRemark] = useState<string | null>(null)
  const { addHistorySnapshot } = useHistorySnapshot()
  useEffect(() => { setNotes(notesText(slide?.remark || '')) }, [slide?.id, slide?.remark])
  useEffect(() => { setName(slide?.sectionTag?.title || '') }, [slide?.id, slide?.sectionTag?.title])
  useEffect(() => { setSavedRemark(null) }, [slide?.id])
  const saved = savedRemark !== null && savedRemark === slide?.remark
  if (!slide) return null
  return <details className={styles.outline} data-myna-outline><summary>{t.title}</summary>
    <ol>{slides.map((page, i) => <li key={page.id}>
      {page.sectionTag && <strong>{page.sectionTag.title || t.section}</strong>}
      <button type="button" aria-current={index === i ? 'page' : undefined} onClick={() => {
        drainCommitQueue(); useMainStore.getState().setActiveElementIdList([]); useMainStore.getState().updateSelectedSlidesIndex([]); useSlidesStore.getState().updateSlideIndex(i)
      }}>{LL.myna.page({ number: i + 1 })}<span>{page.elements.filter(e => e.type === 'text').map(e => e.type === 'text' ? htmlToText(e.content) : '').join(' ').slice(0, 160)}</span></button>
    </li>)}</ol>
    <fieldset disabled={readOnly}>
      <form onSubmit={event => { event.preventDefault(); if (readOnly) return; drainCommitQueue(); useSlidesStore.getState().updateSlide({ sectionTag: { id: slide.sectionTag?.id || nanoid(10), title: name.trim() } }, slide.id); addHistorySnapshot() }}>
        <label>{t.name}<input aria-label={t.name} maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
        <button type="submit" disabled={!name.trim()}>{t.section}</button>
        {slide.sectionTag && <button type="button" onClick={() => { if (readOnly) return; drainCommitQueue(); useSlidesStore.getState().updateSlide({ sectionTag: undefined }, slide.id); setName(''); addHistorySnapshot() }}>{t.remove}</button>}
      </form>
      <form onSubmit={event => { event.preventDefault(); if (readOnly) return; drainCommitQueue(); const remark = notes.split('\n').map(line => `<p>${escape(line)}</p>`).join(''); useSlidesStore.getState().updateSlide({ remark }, slide.id); addHistorySnapshot(); setSavedRemark(remark) }}>
        <label>{t.notes}<textarea aria-label={t.notes} rows={5} value={notes} onChange={event => { setNotes(event.target.value); setSavedRemark(null) }} /></label>
        <small>{t.hint}</small><button type="submit">{t.save}</button>
      </form>
    </fieldset>
    {saved && <p role="status">{t.saved}</p>}
  </details>
}
