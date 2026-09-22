import { useEffect, useId, useRef, useState } from 'react'
import { Ruler, Grid3X3, Magnet, Lock, Trash2 } from 'lucide-react'
import Popover from '@/components/Popover'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import { useMynaViewStore } from './viewStore'
import { bindStyles } from '@/utils/cssm'
import styles from './mynaViewSettings.module.scss'
const cx = bindStyles(styles)

/** View preferences remain available in read-only mode; clearing guides edits the page. */
export default function MynaViewSettings() {
  const { LL, locale } = useI18nContext()
  const pageLabels = ({ en: { smart: 'Snap pages to each other', grid: 'Snap pages and labels to grid', hint: 'Page dragging shows edge, center and spacing guides. Hold Alt to move freely.' }, cs: { smart: 'Přichytávat stránky k sobě', grid: 'Přichytávat stránky a popisky k mřížce', hint: 'Při přesouvání stránek se zobrazují vodítka hran, středů a rozestupů. Podržte Alt pro volný pohyb.' }, sk: { smart: 'Prichytávať stránky k sebe', grid: 'Prichytávať stránky a popisky k mriežke', hint: 'Pri presúvaní stránok sa zobrazujú vodidlá hrán, stredov a rozostupov. Podržte Alt pre voľný pohyb.' }, pl: { smart: 'Przyciągaj strony do siebie', grid: 'Przyciągaj strony i etykiety do siatki', hint: 'Podczas przesuwania stron widać prowadnice krawędzi, środków i odstępów. Przytrzymaj Alt, aby przesuwać swobodnie.' } } as const)[locale as 'en' | 'cs' | 'sk' | 'pl']
  const t = LL.myna
  const view = useMynaViewStore()
  const readOnly = useMainStore(state => state.readOnly)
  const slide = useSlidesStore(selectCurrentSlide)
  const { addHistorySnapshot } = useHistorySnapshot()
  const [open, setOpen] = useState(false)
  const [spacing, setSpacing] = useState(String(view.gridSize))
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => setSpacing(String(view.gridSize)), [view.gridSize])
  const commitSpacing = () => {
    const value = Number(spacing)
    if (!Number.isFinite(value) || value < 4 || value > 400 || !Number.isInteger(value)) {
      setSpacing(String(view.gridSize)); return
    }
    view.setPreference('gridSize', value)
  }
  const toggles = [
    { key: 'showRulers', label: t.showRulers(), icon: Ruler },
    { key: 'showGuides', label: t.showGuides(), icon: Ruler },
    { key: 'snapToGuides', label: t.snapToGuides(), icon: Magnet },
    { key: 'guidesLocked', label: t.lockGuides(), icon: Lock },
    { key: 'snapPages', label: pageLabels.smart, icon: Magnet },
    { key: 'snapPagesToGrid', label: pageLabels.grid, icon: Grid3X3 },
    { key: 'showGrid', label: t.showGrid(), icon: Grid3X3 },
  ] as const
  return <Popover value={open} onUpdateValue={setOpen} placement="bottom-end" onShow={() => requestAnimationFrame(() => content.current?.querySelector<HTMLInputElement>('input')?.focus())} content={<div ref={content} id={id} className={cx('settings')} role="dialog" aria-label={t.viewSettings()} onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
  }}>
    <strong className={cx('heading')}>{t.viewSettings()}</strong>
    {toggles.map(({ key, label, icon: Icon }) => <label key={key} className={cx('toggle')}><Icon size={16} aria-hidden="true" /><span>{label}</span><input type="checkbox" checked={view[key]} onChange={event => view.setPreference(key, event.target.checked)} /></label>)}
    <label className={cx('spacing')}><span>{t.gridSpacing()}</span><input type="number" min={4} max={400} step={1} disabled={!view.showGrid && !view.snapPagesToGrid} value={spacing} onChange={event => {
      setSpacing(event.target.value)
      const value = Number(event.target.value)
      if (Number.isInteger(value) && value >= 4 && value <= 400) view.setPreference('gridSize', value)
    }} onBlur={commitSpacing} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitSpacing() } }} /></label>
    <p className={cx('hint')}>{pageLabels.hint}</p>
    <p className={cx('hint')}>{t.guideHint()}</p>
    {view.showGrid && <p className={cx('hint')}>{t.gridHint()}</p>}
    <button type="button" className={cx('clear')} disabled={readOnly || view.guidesLocked || !slide?.guides?.length} onClick={() => {
      if (useMainStore.getState().readOnly || useMynaViewStore.getState().guidesLocked) return
      drainCommitQueue()
      const current = selectCurrentSlide(useSlidesStore.getState())
      if (!current?.guides?.length) return
      useSlidesStore.getState().updateSlide({ guides: [] })
      addHistorySnapshot()
    }}><Trash2 size={15} />{t.clearGuides()}</button>
  </div>}><button ref={trigger} type="button" aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined}><Ruler size={16} /><span>{t.viewSettings()}</span></button></Popover>
}
