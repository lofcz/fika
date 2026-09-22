import { useWorkspacePages } from './workspaceSelectors'
import { useEffect, useState } from 'react'
import { useMainStore, useSlidesStore } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { arrangePagePositions, resolvePagePositions, movePageElements, type PageArrangement } from './pageLayout'
import styles from './pageLayout.module.scss'

const messages = {
  en: { name: 'Page name', move: 'Move selected objects to…', page: 'Page', title: 'Canvas layout', hint: 'Drag page titles to arrange your canvas. Shift-click titles to select multiple pages. Page order and exports stay independent.', x: 'Page X position', y: 'Page Y position', apply: 'Set position', arrange: 'Arrange all pages', grid: 'Grid', horizontal: 'Row', vertical: 'Column' },
  cs: { name: 'Název stránky', move: 'Přesunout vybrané objekty na…', page: 'Stránka', title: 'Rozložení plátna', hint: 'Přetahováním názvů stránek uspořádáte plátno. Kliknutím na názvy se Shiftem vyberete více stránek. Pořadí stránek a exporty zůstávají nezávislé.', x: 'Pozice stránky X', y: 'Pozice stránky Y', apply: 'Nastavit pozici', arrange: 'Uspořádat všechny stránky', grid: 'Mřížka', horizontal: 'Řádek', vertical: 'Sloupec' },
  sk: { name: 'Názov stránky', move: 'Presunúť vybrané objekty na…', page: 'Stránka', title: 'Rozloženie plátna', hint: 'Presúvaním názvov stránok usporiadate plátno. Kliknutím na názvy so Shiftom vyberiete viac stránok. Poradie stránok a exporty zostávajú nezávislé.', x: 'Pozícia stránky X', y: 'Pozícia stránky Y', apply: 'Nastaviť pozíciu', arrange: 'Usporiadať všetky stránky', grid: 'Mriežka', horizontal: 'Riadok', vertical: 'Stĺpec' },
  pl: { name: 'Nazwa strony', move: 'Przenieś zaznaczone obiekty do…', page: 'Strona', title: 'Układ płótna', hint: 'Przeciągaj tytuły stron, aby ułożyć płótno. Klikaj tytuły z Shiftem, aby zaznaczyć wiele stron. Kolejność stron i eksport pozostają niezależne.', x: 'Pozycja strony X', y: 'Pozycja strony Y', apply: 'Ustaw pozycję', arrange: 'Rozmieść wszystkie strony', grid: 'Siatka', horizontal: 'Wiersz', vertical: 'Kolumna' },
}
export default function MynaPageLayoutControls() {
  const { locale } = useI18nContext()
  const t = messages[locale as keyof typeof messages] || messages.en
  const slides = useWorkspacePages(), index = useSlidesStore(state => state.slideIndex)
  const width = useSlidesStore(state => state.viewportSize), ratio = useSlidesStore(state => state.viewportRatio)
  const readOnly = useMainStore(state => state.readOnly)
  const selectedIds = useMainStore(state => state.activeElementIdList)
  const slide = slides[index], point = slide ? resolvePagePositions(slides, width, width * ratio).get(slide.id)! : { x: 0, y: 0 }
  const [x, setX] = useState(String(point.x)), [y, setY] = useState(String(point.y))
  const [name, setName] = useState(slide?.canvasName || '')
  const { addHistorySnapshot } = useHistorySnapshot()
  useEffect(() => { setX(String(point.x)); setY(String(point.y)) }, [slide?.id, point.x, point.y])
  useEffect(() => { setName(slide?.canvasName || '') }, [slide?.id, slide?.canvasName])
  if (!slide) return null
  const arrange = (mode: PageArrangement) => {
    if (readOnly) return
    drainCommitQueue()
    const store = useSlidesStore.getState()
    store.updateWorkspace({ positions: Object.fromEntries(arrangePagePositions(store.slides, store.viewportSize, store.viewportSize * store.viewportRatio, mode)) })
    addHistorySnapshot()
  }
  return <section className={styles.layout} data-myna-page-layout>
    <h3>{t.title}</h3><p>{t.hint}</p>
    <fieldset disabled={readOnly}>
      <form onSubmit={event => {
        event.preventDefault()
        if (readOnly || !x.trim() || !y.trim() || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return
        drainCommitQueue()
        // Freeze implicit page origins before moving one, so neighboring pages never jump.
        const store = useSlidesStore.getState()
        store.updateWorkspace({ positions: Object.fromEntries([...resolvePagePositions(store.slides, store.viewportSize, store.viewportSize * store.viewportRatio)].map(([id, position]) => [id, id === slide.id ? { x: Number(x), y: Number(y) } : position])) })
        store.updateSlide({ canvasName: name.trim() || undefined }, slide.id)
        addHistorySnapshot()
      }}>
        <label style={{ display: 'grid', gap: 6, marginBottom: 10, fontSize: 12 }}>{t.name}<input type="text" aria-label={t.name} maxLength={160} value={name} onChange={event => setName(event.target.value)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '4px 7px' }} /></label>
        <div className={styles.coordinates}>
          <label>X<input type="number" step="any" aria-label={t.x} value={x} onChange={event => setX(event.target.value)} /></label>
          <label>Y<input type="number" step="any" aria-label={t.y} value={y} onChange={event => setY(event.target.value)} /></label>
        </div><button type="submit">{t.apply}</button>
      </form>
      <div className={styles.arrange} role="group" aria-label={t.arrange}>{(['grid', 'horizontal', 'vertical'] as const).map(mode => <button key={mode} type="button" onClick={() => arrange(mode)}>{t[mode]}</button>)}</div>
      {slides.length > 1 && <select className={styles.move} aria-label={t.move} disabled={!selectedIds.length} value="" onChange={event => {
        if (readOnly || !event.target.value) return
        drainCommitQueue()
        const store = useSlidesStore.getState(), target = store.slides.find(page => page.id === event.target.value), source = store.slides[store.slideIndex]
        if (!source || !target) return
        const moved = movePageElements(source, target, useMainStore.getState().activeElementIdList)
        if (!moved.movedIds.length) return
        store.updateSlide(moved.source, source.id); store.updateSlide(moved.target, target.id)
        useMainStore.getState().setActiveElementIdList([])
        store.updateSlideIndex(store.slides.findIndex(page => page.id === target.id))
        addHistorySnapshot()
      }}><option value="">{t.move}</option>{slides.map((page, pageIndex) => page.id === slide.id ? null : <option key={page.id} value={page.id}>{page.canvasName || `${t.page} ${pageIndex + 1}`}</option>)}</select>}
    </fieldset>
  </section>
}
