import { useI18nContext } from '@/i18n/useI18nContext'
import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import Modal from '@/components/Modal'
import { watermarkSvg } from './svgWatermark'
import { parseExportPages } from './exportPages'
import { createMynaPdf, type MynaPdfPage } from './pdf'
import { useMainStore, useSlidesStore } from '@/store'
import { renderSlideImage } from '@/embed/render'
import { getFikaExportWatermark } from '@/configs/exportWatermark'
import { loadWatermarkImage, watermarkSurfaceFromHex } from '@/utils/pptxExportWatermark'
import { drainCommitQueue } from '@/utils/commitQueue'
import { bindStyles } from '@/utils/cssm'
import styles from './myna.module.scss'
const cx = bindStyles(styles)

/** Snapshot before rendering so page edits cannot leak into an in-flight export. */
export default function MynaDownload({ onClose }: { onClose: () => void }) {
  const { LL, locale } = useI18nContext()
  const t = LL.myna
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp' | 'pdf' | 'svg'>('png')
  const [transparent, setTransparent] = useState(false)
  const [scope, setScope] = useState('current')
  const [pageRange, setPageRange] = useState('1')
  const [cancelling, setCancelling] = useState(false)
  const cancelled = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const selection = useMainStore(s => s.activeElementIdList)
  const [svgNotice, setSvgNotice] = useState(false)
  const emptySelection = scope === 'objects' && selection.length === 0
  const pageCount = useSlidesStore(s => s.slides.length)
  const selectedPages = parseExportPages(pageRange, pageCount)
  const invalidRange = scope === 'selected' && !selectedPages
  const [scale, setScale] = useState(1)
  const [quality, setQuality] = useState(.92)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | 'zip' | null>(null)
  const [error, setError] = useState<'failed' | 'imageFailed' | 'imageTimeout' | null>(null)
  const width = useSlidesStore(s => s.viewportSize)
  const ratio = useSlidesStore(s => s.viewportRatio)
  const outputWidth = Math.max(64, Math.round(width * scale))
  const outputHeight = Math.round(outputWidth * ratio)
  const tooLarge = format !== 'svg' && (outputWidth * outputHeight > 32_000_000 || outputWidth > 16384 || outputHeight > 16384)
  const download = async () => {
    if (busy || tooLarge || invalidRange || emptySelection) return
    abort.current = new AbortController(); setSvgNotice(false); cancelled.current = false; setCancelling(false); setBusy(true); setError(null)
    try {
      drainCommitQueue()
      const state = useSlidesStore.getState()
      const doc = structuredClone({ slides: state.slides, theme: state.theme, width: state.viewportSize, ratio: state.viewportRatio, title: state.title, index: state.slideIndex })
      const selectedIds = [...useMainStore.getState().activeElementIdList]
      const indices = scope === 'all' ? doc.slides.map((_, index) => index) : scope === 'selected' ? parseExportPages(pageRange, doc.slides.length) : [doc.index]
      if (!indices?.length) return
      const pages = indices.map(index => doc.slides[index])
      const name = (doc.title || t.untitled()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 150)
      const zip = new JSZip()
      const pdfPages: MynaPdfPage[] = []
      const rasterFormat = format === 'pdf' || format === 'svg' ? 'jpeg' : format
      let svgFallback = false
      const watermark = await getFikaExportWatermark()?.()
      for (let i = 0; i < pages.length; i++) {
        if (cancelled.current) return
        setProgress({ current: i + 1, total: pages.length })
        const slide = pages[i]
        if (format === 'svg') {
          const { exportMynaSvg } = await import('./svg')
          const result = await exportMynaSvg({ slide, theme: doc.theme, viewportSize: doc.width, viewportRatio: doc.ratio }, { selectedIds: scope === 'objects' ? selectedIds : undefined, transparentBackground: transparent, signal: abort.current?.signal })
          svgFallback ||= result.warnings.length > 0
          const background = slide.background?.type === 'solid' ? slide.background.color : doc.theme.backgroundColor
          const blob = watermark ? await watermarkSvg(result.svg, result.width, result.height, watermark, background || '#ffffff') : result.blob
          if (cancelled.current) return
          if (pages.length === 1) saveAs(blob, `${name}.svg`)
          else zip.file(`${String(indices[i] + 1).padStart(3, '0')}.svg`, blob)
          continue
        }
        const result = await renderSlideImage({ slide, theme: doc.theme, viewportSize: doc.width, viewportRatio: doc.ratio }, { width: Math.round(doc.width * scale), format: `image/${rasterFormat}`, quality, timeoutMs: 15000, fullResolutionImages: true, transparentBackground: transparent && (format === 'png' || format === 'webp') })
        let blob = result.blob
        if (watermark) {
          const background = slide.background?.type === 'solid' ? slide.background.color : doc.theme.backgroundColor
          const dark = watermarkSurfaceFromHex(background || '#ffffff') === 'dark'
          const mark = await loadWatermarkImage(dark && watermark.imageOnDark ? watermark.imageOnDark : watermark.image)
          const markBitmap = await createImageBitmap(new Blob([new Uint8Array(mark.bytes)], { type: mark.mime }))
          const pageBitmap = await createImageBitmap(blob)
          try {
            const canvas = document.createElement('canvas'); canvas.width = result.width; canvas.height = result.height
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('Image export is unavailable in this browser.')
            ctx.drawImage(pageBitmap, 0, 0)
            const w = canvas.width * (watermark.widthRatio ?? .12), h = w * mark.height / mark.width
            const margin = canvas.width * (watermark.marginRatio ?? .02), position = watermark.position ?? 'bottom-right'
            ctx.globalAlpha = watermark.opacity ?? 1
            ctx.drawImage(markBitmap, position.endsWith('left') ? margin : canvas.width - margin - w, position.startsWith('top') ? margin : canvas.height - margin - h, w, h)
            blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image encoding failed.')), `image/${rasterFormat}`, quality))
          } finally { markBitmap.close(); pageBitmap.close() }
        }
        if (cancelled.current) return
        if (format === 'pdf') pdfPages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pixelWidth: result.width, pixelHeight: result.height, width: doc.width * .75, height: doc.width * doc.ratio * .75 })
        else if (pages.length === 1) saveAs(blob, `${name}.${format === 'jpeg' ? 'jpg' : format}`)
        else zip.file(`${String(indices[i] + 1).padStart(3, '0')}.${format === 'jpeg' ? 'jpg' : format}`, blob)
      }
      if (cancelled.current) return
      if (format === 'pdf') saveAs(new Blob([new Uint8Array(createMynaPdf(pdfPages))], { type: 'application/pdf' }), `${name}.pdf`)
      else if (pages.length > 1) { setProgress('zip'); const blob = await zip.generateAsync({ type: 'blob' }); if (cancelled.current) return; saveAs(blob, `${name}.zip`) }
      if (svgFallback) setSvgNotice(true)
      else onClose()
    } catch (error) {
      if (cancelled.current) return
      const message = error instanceof Error ? error.message : ''
      setError(message.startsWith('Image export timed out') ? 'imageTimeout' : message.startsWith('An image could not be loaded') ? 'imageFailed' : 'failed')
    }
    finally { setBusy(false); setProgress(null); setCancelling(false) }
  }
  return <Modal visible width={420} closeButton={!busy} closeOnClickMask={!busy} closeOnEsc={!busy} onClosed={() => { if (!busy) onClose() }}><div className={cx('myna-download')}>
    <h2>{t.downloadTitle()}</h2>
    <label>{t.fileType()}<select aria-label={t.fileType()} disabled={busy} value={format} onChange={e => { setFormat(e.target.value as typeof format); setSvgNotice(false); if (scope === 'objects') setScope('current') }}><option value="svg">{t.svg()}</option><option value="pdf">{t.pdf()}</option><option value="png">{t.png()}</option><option value="jpeg">{t.jpg()}</option><option value="webp">{t.webp()}</option></select></label>
    <label>{t.pages()}<select aria-label={t.pages()} disabled={busy} value={scope} onChange={e => setScope(e.target.value)}><option value="current">{t.currentPage()}</option><option value="all">{format === 'pdf' ? t.allPages() : t.allPagesZip()}</option><option value="selected">{t.selectedPages()}</option>{format === 'svg' && <option value="objects">{t.svgSelection()}</option>}</select></label>
    {scope === 'selected' && <label>{t.pageRange()}<input aria-label={t.pageRange()} aria-invalid={!!invalidRange} disabled={busy} value={pageRange} onChange={event => setPageRange(event.target.value)} /><small>{t.pageRangeHint()}</small></label>}
    {invalidRange && <p role="alert">{t.invalidPageRange()}</p>}
    {emptySelection && <p role="alert">{t.svgEmpty()}</p>}
    {format !== 'svg' && <label>{t.size()}<select aria-label={t.size()} disabled={busy} value={scale} onChange={e => setScale(Number(e.target.value))}>{[.5, 1, 1.5, 2, 3].map(value => <option key={value} value={value}>{value.toLocaleString(locale)}×</option>)}</select><small>{outputWidth} × {outputHeight} px</small></label>}
    {(format === 'png' || format === 'webp' || format === 'svg') && <label><span><input type="checkbox" disabled={busy} checked={transparent} onChange={e => setTransparent(e.target.checked)} /> {t.transparent()}</span></label>}
    {format !== 'png' && format !== 'svg' && <label>{t.quality({ percent: Math.round(quality * 100) })}<input disabled={busy} type="range" min={.1} max={1} step={.01} value={quality} onChange={e => setQuality(Number(e.target.value))} /></label>}
    {tooLarge && <p role="alert">{t.tooLarge()}</p>}
    {svgNotice && <p role="status">{t.svgComplete()} {t.svgFallback()}</p>}
    {error && <p role="alert">{t[error]()}</p>}
    <p role="status" aria-live="polite">{cancelling ? t.cancellingExport() : progress === 'zip' ? t.zipProgress() : progress ? t.rendering(progress) : ''}</p>
    <button className={cx('myna-primary')} disabled={busy || tooLarge || !!invalidRange || emptySelection} onClick={() => void download()}>{busy ? t.preparing() : t.download()}</button>
    {busy && <button disabled={cancelling} onClick={() => { cancelled.current = true; abort.current?.abort(); setCancelling(true) }}>{t.cancelExport()}</button>}
    <p className={cx('myna-hint')}>{format === 'svg' ? t.svgHint() : t.exportHint()}</p>
  </div></Modal>
}
