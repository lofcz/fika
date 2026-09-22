import { selectInsertedElements } from '@/utils/selectInsertedElements'
import { useEffect, useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { useMainStore, useSlidesStore } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { drainCommitQueue } from '@/utils/commitQueue'
import type { PPTImageElement } from '@/types/slides'
import { DEFAULT_QR, qrImageSrc, type QrCodeOptions } from './qrCode'
import { qrMessages } from './qrMessages'
import styles from './qrPanel.module.scss'

export default function MynaQrPanel() {
  const { locale } = useI18nContext()
  const t = qrMessages(locale)
  const slides = useSlidesStore(s => s.slides), index = useSlidesStore(s => s.slideIndex)
  const ids = useMainStore(s => s.activeElementIdList), readOnly = useMainStore(s => s.readOnly)
  const selected = ids.length === 1 ? slides[index]?.elements.find((element): element is PPTImageElement => element.id === ids[0] && element.type === 'image' && !!element.qrCode) : undefined
  const [options, setOptions] = useState<QrCodeOptions>(DEFAULT_QR)
  const { addHistorySnapshot } = useHistorySnapshot()
  useEffect(() => { if (selected?.qrCode) { setOptions(selected.qrCode) } }, [selected?.id, selected?.qrCode])
  const result = useMemo(() => {
    try { return { src: qrImageSrc(options), error: null } }
    catch (error) { const code = (error as Error).message; return { src: '', error: code === 'text' || code === 'contrast' ? code : 'error' } }
  }, [options])
  const apply = () => {
    if (!result.src || readOnly || selected?.lock) return
    drainCommitQueue()
    const state = useSlidesStore.getState()
    const selection = useMainStore.getState().activeElementIdList
    const current = state.slides[state.slideIndex]?.elements.find(element => selection.length === 1 && element.id === selection[0] && element.type === 'image' && element.qrCode)
    if (current?.lock || useMainStore.getState().readOnly) return
    if (current?.type === 'image') state.updateElement({ id: current.id, props: { src: result.src, qrCode: { ...options } } })
    else {
      const size = Math.min(280, state.viewportSize * .4, state.viewportSize * state.viewportRatio * .4)
      const element: PPTImageElement = { id: nanoid(12), type: 'image', src: result.src, qrCode: { ...options }, name: t.title, fixedRatio: true, rotate: 0, width: size, height: size, left: (state.viewportSize - size) / 2, top: (state.viewportSize * state.viewportRatio - size) / 2 }
      state.addElement(element)
      selectInsertedElements([element.id])
      useMainStore.getState().setHandleElementId(element.id)
    }
    addHistorySnapshot()
  }
  return <section className={styles.panel} data-myna-qr>
    <p>{t.hint}</p>
    <form onSubmit={event => { event.preventDefault(); apply() }}>
      {selected && <p>{t.select}</p>}
      <label>{t.content}<textarea value={options.text} maxLength={2000} onChange={event => setOptions({ ...options, text: event.target.value })}/></label>
      <label>{t.correction}<select value={options.errorCorrection} onChange={event => setOptions({ ...options, errorCorrection: event.target.value as QrCodeOptions['errorCorrection'] })}>{['L', 'M', 'Q', 'H'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <div className={styles.colors}><label>{t.foreground}<input type="color" value={options.foreground} onChange={event => setOptions({ ...options, foreground: event.target.value })}/></label><label>{t.background}<input type="color" value={options.background} onChange={event => setOptions({ ...options, background: event.target.value })}/></label></div>
      {result.src && <img src={result.src} alt={t.title} width={160} height={160}/>}
      {result.error && <p role="alert">{t[result.error as 'text' | 'contrast' | 'error']}</p>}
      <p>{t.size}</p>
      <button type="submit" disabled={!result.src || readOnly || !!selected?.lock}>{selected ? t.update : t.insert}</button>
    </form>
  </section>
}
