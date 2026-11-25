import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react'
import type { PPTShapeElement, PPTTextElement, TextInset } from '@/types/slides'
import { authoredTextFitSize, elementLocksTextBox } from '@/utils/placeholderLayout'
import { placeholderWeightOf } from '@/configs/textPresets'
import { subscribeLiveBox } from '@/utils/liveElementSize'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore } from '@/store'
import { normalizeFittedFontSizes } from '@/utils/richTextFontSize'
import { serializeRichTextHtml } from '@/utils/prosemirror'
import {
  contentBoxOfHost,
  extractBlocksCached,
  innerBoxFromLiveStyles,
  MATH_FONT_CHANGE_TOKEN,
  measureTextBlocksHeight,
  minimumTextFitScale,
  normalizeFontFamilyName,
  rememberFitScale,
  resolvePaintFontFamily,
  subscribeTextFontChanges,
  textFitScaleForHtml,
  type FitScaleOptions,
  type TextFitBlock,
} from '@/utils/textFit'
import { htmlContainsMath } from '@/utils/math'
import {
  cancelVerifyJobForHost,
  enqueueVerifyJob,
  readVerifiedFit,
  runVerifyBatch,
  shouldSkipDomVerify,
  verifiedFitKey,
  type PendingVerifyJob,
} from './textFitBatcher'

function fontsLoadedForBlocks(blocks: TextFitBlock[], defaultFamily: string): boolean {
  if (typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loading') return false
  const checked = new Set<string>()
  const checkFamily = (raw: string | undefined) => {
    const fam = (raw || defaultFamily || '').trim()
    if (!fam || checked.has(fam)) return true
    checked.add(fam)
    try {
      return document.fonts.check(`16px ${fam}`)
    }
    catch {
      return false
    }
  }
  if (!checkFamily(defaultFamily)) return false
  for (const block of blocks) {
    if (!checkFamily(block.fontFamily)) return false
    if (block.runs) {
      for (const run of block.runs) {
        if (run.fontFamily && !checkFamily(run.fontFamily)) return false
      }
    }
  }
  return true
}

const DEFAULT_INSET: TextInset = [10, 10, 10, 10]
const DEFAULT_LINE_HEIGHT = 1.5
const DEFAULT_PARAGRAPH_SPACE = 5

type FitSource = PPTTextElement | PPTShapeElement

const fitContentOf = (el: FitSource) => (
  el.type === 'shape' ? (el.text?.content || '') : el.content
)
const fitLineHeightOf = (el: FitSource) => (
  (el.type === 'shape' ? el.text?.lineHeight : el.lineHeight) ?? DEFAULT_LINE_HEIGHT
)
const fitParagraphSpaceOf = (el: FitSource) => (
  el.type === 'shape'
    ? (el.text?.paragraphSpace === undefined ? DEFAULT_PARAGRAPH_SPACE : el.text.paragraphSpace)
    : (el.paragraphSpace ?? DEFAULT_PARAGRAPH_SPACE)
)
const fitFontNameOf = (el: FitSource, themeFontName?: string) => (
  resolvePaintFontFamily((el.type === 'shape' ? el.text?.defaultFontName : el.defaultFontName) || themeFontName)
)
const fitWordSpaceOf = (el: FitSource) => (
  (el.type === 'shape' ? el.text?.wordSpace : el.wordSpace) || 0
)
const fitInsetOf = (el: FitSource): TextInset => (
  (el.type === 'shape' ? el.text?.inset : el.inset) || DEFAULT_INSET
)
const fitAuthoredSizeOf = (el: FitSource) => (
  el.type === 'text' ? authoredTextFitSize(el) : 16
)
const fitDefaultWeightOf = (el: FitSource) => (
  el.type === 'text' && el.placeholder ? placeholderWeightOf(el, false) : undefined
)
const fitDefaultItalicOf = (el: FitSource) => (
  el.type === 'text' && el.placeholder ? !!el.placeholderItalic : undefined
)
const fitMinimumOf = (el: FitSource) => el.type === 'shape' ? el.text?.minFontSize : el.minFontSize

type LiveContentInput = string | null | undefined | RefObject<string | null | undefined>

function isLiveRef(live: LiveContentInput): live is RefObject<string | null | undefined> {
  return !!live && typeof live === 'object' && 'current' in live
}

function readLive(live: LiveContentInput): string | null | undefined {
  if (isLiveRef(live)) return live.current
  return live
}

/**
 * Auto-fit a locked text box (fixed height or placeholder/title slot) so
 * its content never overflows.
 *
 * Pretext supplies a cached estimate during resize. Settled geometry is
 * refined against browser layout before paint (batched across mounting boxes
 * via FastDOM read/write phases and cached in a verified-DOM LRU), and the
 * verified font scale is shared with the thumbnail painter. Authored font
 * sizes stay unchanged.
 */
export default (
  elementInfo: FitSource,
  liveContent?: LiveContentInput,
  hostEl?: { readonly current: HTMLElement | null },
  options?: { observeResize?: boolean },
) => {
  const { locale } = useI18nContext()
  const themeFontName = useSlidesStore(s => s.theme.fontName)
  const themeFontNameRef = useRef(themeFontName)
  themeFontNameRef.current = themeFontName
  const fitScaleRef = useRef(1)
  const lastInnerRef = useRef({ width: 0, height: 0 })
  const lastAppliedKeyRef = useRef('')
  const lastFittedRawRef = useRef<string | null>(null)
  const rafRef = useRef(0)
  const mountedRef = useRef(true)
  const elementInfoRef = useRef(elementInfo)
  elementInfoRef.current = elementInfo
  const localeRef = useRef(locale)
  localeRef.current = locale
  const liveContentRef = useRef(liveContent)
  liveContentRef.current = liveContent
  const hostElRef = useRef(hostEl)
  hostElRef.current = hostEl
  const observeResize = options?.observeResize !== false
  const scheduleRef = useRef<() => void>(() => {})
  const applyScaleRef = useRef<(opts?: { batch?: boolean; liveEdit?: boolean }) => void>(() => {})

  const measuredContent = () => {
    const live = readLive(liveContentRef.current)
    const raw = live !== null && live !== undefined ? live : fitContentOf(elementInfoRef.current)
    if (!raw) return ''
    return normalizeFittedFontSizes(serializeRichTextHtml(raw))
  }

  const authoredSize = () => fitAuthoredSizeOf(elementInfoRef.current)

  const commitScale = (next: number) => {
    fitScaleRef.current = next
    const host = hostElRef.current?.current
    if (!host) return
    if (next === 1) {
      if (host.style.getPropertyValue('--text-fit-scale')) host.style.removeProperty('--text-fit-scale')
      if (host.style.getPropertyValue('--text-fit-base-size')) host.style.removeProperty('--text-fit-base-size')
      return
    }
    host.style.setProperty('--text-fit-scale', String(next))
    host.style.setProperty('--text-fit-base-size', `${Math.round(authoredSize() * next * 100) / 100}px`)
  }

  const applyScale = (opts?: { batch?: boolean; liveEdit?: boolean }) => {
    const el = elementInfoRef.current
    if (!elementLocksTextBox(el)) {
      lastInnerRef.current = { width: 0, height: 0 }
      lastAppliedKeyRef.current = ''
      commitScale(1)
      return
    }
    const contentHtml = measuredContent()
    if (!contentHtml) {
      lastInnerRef.current = { width: 0, height: 0 }
      lastAppliedKeyRef.current = ''
      commitScale(1)
      return
    }
    const host = hostElRef.current?.current
    const box = contentBoxOfHost(host)
    const { innerWidth, innerHeight } = innerBoxFromLiveStyles(box, {
      width: el.width,
      height: el.height,
      inset: fitInsetOf(el),
    })
    const widthQ = Math.round(innerWidth * 4)
    const heightQ = Math.round(innerHeight * 4)
    const height = Math.round(innerHeight)
    const params: FitScaleOptions = {
      innerWidth,
      innerHeight,
      defaultFontFamily: fitFontNameOf(el, themeFontNameRef.current),
      defaultSize: authoredSize(),
      defaultWeight: fitDefaultWeightOf(el),
      defaultItalic: fitDefaultItalicOf(el),
      lineHeight: fitLineHeightOf(el),
      letterSpacing: fitWordSpaceOf(el) || 0,
      blockSpace: fitParagraphSpaceOf(el),
      minFontSize: fitMinimumOf(el),
    }
    const cacheKey = verifiedFitKey(contentHtml, widthQ, heightQ, params, el.type === 'text' && !!el.vertical)

    if (
      !opts?.liveEdit
      && host
      && lastInnerRef.current.width === widthQ
      && lastInnerRef.current.height === heightQ
      && lastAppliedKeyRef.current === cacheKey
    ) {
      commitScale(fitScaleRef.current)
      return
    }

    if (host) {
      lastInnerRef.current = { width: widthQ, height: heightQ }
      lastAppliedKeyRef.current = cacheKey
      lastFittedRawRef.current = contentHtml
    }

    const isScaling = useMainStore.getState().isScaling

    // O(1) verified-DOM-fit cache hit (skipped during live typing because
    // ProseMirror's live DOM can carry trailing break-spaces that HTML
    // normalization collapses).
    if (!isScaling && !opts?.liveEdit) {
      const cached = readVerifiedFit(cacheKey)
      if (cached) {
        commitScale(cached.scale)
        if (host) {
          if (cached.paragraphSpace) host.style.setProperty('--paragraphSpace', cached.paragraphSpace)
          else if (host.style.getPropertyValue('--paragraphSpace')) host.style.removeProperty('--paragraphSpace')
        }
        rememberFitScale(contentHtml, params, cached.scale, el.id)
        return
      }
    }

    const extracted = extractBlocksCached(
      contentHtml,
      params.defaultFontFamily,
      params.defaultSize,
      params.defaultWeight,
      params.defaultItalic,
    )
    if (!extracted.blocks.length) {
      commitScale(1)
      return
    }

    const floor = Math.max(0.01, minimumTextFitScale(extracted.blocks, params.minFontSize))
    const estimate = textFitScaleForHtml(contentHtml, params)
    commitScale(estimate)
    if (!host) return

    if (host.style.getPropertyValue('--paragraphSpace')) host.style.removeProperty('--paragraphSpace')
    let maxFontSize = params.defaultSize ?? 16
    for (const block of extracted.blocks) {
      if (block.size > maxFontSize) maxFontSize = block.size
    }
    const maxLinePx = maxFontSize * Math.max(1, params.lineHeight)

    // Fast-skip DOM verification when Pretext reports `scale === 1` with ample
    // vertical headroom (>= 15% and >= 0.5 line), no inline math, horizontal
    // layout, and all box fonts are already loaded.
    const isVertical = el.type === 'text' && !!el.vertical
    const hasMath = htmlContainsMath(contentHtml)
    if (
      !isScaling
      && !opts?.liveEdit
      && estimate >= 1
      && !isVertical
      && !hasMath
      && fontsLoadedForBlocks(extracted.blocks, params.defaultFontFamily || '')
    ) {
      const h1 = measureTextBlocksHeight(extracted.blocks, {
        innerWidth: Math.max(1, innerWidth),
        lineHeight: params.lineHeight,
        blockSpace: params.blockSpace ?? 0,
        letterSpacing: params.letterSpacing || undefined,
        sizeScale: 1,
      })
      if (shouldSkipDomVerify({
        estimate,
        pretextHeight: h1,
        boxHeight: height,
        maxLinePx,
        isScaling,
        liveEdit: !!opts?.liveEdit,
        isVertical,
        hasMath,
        fontsReady: true,
        contentHtml,
      })) {
        // Estimate-only fast-skip: apply scale 1 without writing an unverified
        // entry into `verifiedFitCache`.
        rememberFitScale(contentHtml, params, 1, el.id)
        return
      }
    }

    const content = host.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor') as HTMLElement | null
    if (!content || height <= 2) return

    if (isScaling) {
      // Drag hot path: one down-correction only (never clips mid-drag);
      // the tightness refine runs on drop when frames are not scarce.
      const rendered = content.scrollHeight
      if (rendered > height + 1) {
        commitScale(Math.max(floor, estimate * (height / Math.max(1, rendered)) * 0.995))
      }
      return
    }

    const job: PendingVerifyJob = {
      host,
      content,
      box,
      elementId: el.id,
      height,
      floor,
      estimate,
      params,
      contentHtml,
      cacheKey,
      commitScale,
      isAlive: () => mountedRef.current && hostElRef.current?.current === host,
      low: floor,
      high: Math.max(1, floor),
      probe: estimate,
      lastCommitted: estimate,
      hasUpperBound: false,
      skipCacheWrite: !!opts?.liveEdit,
      maxFontSize,
      maxLinePx,
    }

    if (opts?.batch && typeof queueMicrotask === 'function') {
      enqueueVerifyJob(job)
    }
    else {
      cancelVerifyJobForHost(host)
      runVerifyBatch([job])
    }
  }

  applyScaleRef.current = applyScale

  const schedule = () => {
    if (typeof requestAnimationFrame === 'undefined') {
      applyScale({ batch: false })
      return
    }
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      applyScale({ batch: true })
    })
  }
  scheduleRef.current = schedule

  const setLiveContent = useCallback((html: string | null) => {
    const passed = liveContentRef.current
    if (isLiveRef(passed)) passed.current = html
    lastInnerRef.current = { width: 0, height: 0 }
    lastAppliedKeyRef.current = ''
    applyScaleRef.current({ batch: false, liveEdit: true })
  }, [])

  const resync = useCallback(() => {
    lastInnerRef.current = { width: 0, height: 0 }
    lastAppliedKeyRef.current = ''
    applyScaleRef.current({ batch: false })
  }, [])

  const liveValue = isLiveRef(liveContent) ? undefined : liveContent
  const lockMode = elementLocksTextBox(elementInfo)

  useLayoutEffect(() => {
    mountedRef.current = true
    lastInnerRef.current = { width: 0, height: 0 }
    lastAppliedKeyRef.current = ''
    const capturedHost = hostEl?.current
    applyScaleRef.current({ batch: true })
    return () => {
      mountedRef.current = false
      cancelVerifyJobForHost(capturedHost)
    }
  }, [lockMode, hostEl])

  const didInitialPropsSyncRef = useRef(false)
  const prevDepsExceptContentRef = useRef('')
  const inset = fitInsetOf(elementInfo)
  const insetKey = `${inset[0]},${inset[1]},${inset[2]},${inset[3]}`
  const nonContentKey = [
    elementInfo.width,
    elementInfo.height,
    fitLineHeightOf(elementInfo),
    fitParagraphSpaceOf(elementInfo),
    fitFontNameOf(elementInfo, themeFontName),
    elementInfo.type === 'text' ? elementInfo.placeholderFontSize : '',
    elementInfo.type === 'text' ? elementInfo.placeholder : '',
    elementInfo.type === 'text' ? elementInfo.placeholderBold : '',
    elementInfo.type === 'text' ? elementInfo.placeholderItalic : '',
    elementInfo.type === 'text' ? !!elementInfo.vertical : false,
    fitWordSpaceOf(elementInfo),
    fitMinimumOf(elementInfo),
    insetKey,
    locale,
  ].join('|')
  const storeContent = fitContentOf(elementInfo)
  useEffect(() => {
    if (!didInitialPropsSyncRef.current) {
      didInitialPropsSyncRef.current = true
      prevDepsExceptContentRef.current = nonContentKey
      return
    }
    if (
      prevDepsExceptContentRef.current === nonContentKey
      && liveValue === undefined
      && lastFittedRawRef.current !== null
      && storeContent
      && normalizeFittedFontSizes(serializeRichTextHtml(storeContent)) === lastFittedRawRef.current
    ) {
      return
    }
    prevDepsExceptContentRef.current = nonContentKey
    lastInnerRef.current = { width: 0, height: 0 }
    lastAppliedKeyRef.current = ''
    scheduleRef.current()
  }, [
    storeContent,
    liveValue,
    nonContentKey,
    hostEl,
  ])

  useEffect(() => subscribeLiveBox((id) => {
    if (id !== elementInfoRef.current.id) return
    lastInnerRef.current = { width: 0, height: 0 }
    lastAppliedKeyRef.current = ''
    scheduleRef.current()
  }), [])

  useEffect(() => {
    const refreshFonts = (families?: ReadonlySet<string>) => {
      if (families && families.size > 0) {
        const el = elementInfoRef.current
        const html = fitContentOf(el)
        const baseFamily = normalizeFontFamilyName(fitFontNameOf(el, themeFontNameRef.current))
        let matches = !!baseFamily && families.has(baseFamily)
        if (!matches && htmlContainsMath(html)) {
          if (families.has(MATH_FONT_CHANGE_TOKEN)) matches = true
          else {
            for (const family of families) {
              if (family.includes('katex')) { matches = true; break }
            }
          }
        }
        if (!matches && html.includes('font-family')) {
          const lower = html.toLowerCase()
          for (const family of families) {
            if (family !== MATH_FONT_CHANGE_TOKEN && lower.includes(family)) {
              matches = true
              break
            }
          }
        }
        if (!matches) return
      }
      lastInnerRef.current = { width: 0, height: 0 }
      lastAppliedKeyRef.current = ''
      scheduleRef.current()
    }
    let cancelled = false
    const unsubscribeFonts = subscribeTextFontChanges(refreshFonts)
    if (typeof document !== 'undefined' && document.fonts?.status === 'loading') {
      document.fonts.ready.then(() => {
        if (!cancelled) refreshFonts()
      }).catch(() => {})
    }
    return () => {
      cancelled = true
      unsubscribeFonts()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  useEffect(() => {
    if (!observeResize || !lockMode || typeof ResizeObserver === 'undefined' || !hostEl) return
    const host = hostEl.current
    const box = contentBoxOfHost(host) ?? host
    if (!box) return
    const observer = new ResizeObserver(() => {
      const el = elementInfoRef.current
      const { innerWidth, innerHeight } = innerBoxFromLiveStyles(contentBoxOfHost(hostElRef.current?.current), {
        width: el.width,
        height: el.height,
        inset: fitInsetOf(el),
      })
      if (
        Math.round(innerWidth * 4) === lastInnerRef.current.width
        && Math.round(innerHeight * 4) === lastInnerRef.current.height
      ) return
      scheduleRef.current()
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [hostEl, observeResize, lockMode, elementInfo.id])

  const fitScale = fitScaleRef.current
  const textFitPaintStyle: CSSProperties | undefined = (lockMode && fitScale !== 1)
    ? ({
        '--text-fit-scale': String(fitScale),
        '--text-fit-base-size': `${Math.round(authoredSize() * fitScale * 100) / 100}px`,
      } as CSSProperties)
    : undefined

  return {
    fitScale,
    fitVars: {},
    textFitPaintStyle,
    setLiveContent,
    resync,
  }
}
