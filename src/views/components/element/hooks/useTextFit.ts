import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { setLocale as setPretextLocale } from '@chenglou/pretext'
import type { PPTShapeElement, PPTTextElement, TextInset } from '@/types/slides'
import { authoredTextFitSize, elementLocksTextBox } from '@/utils/placeholderLayout'
import { subscribeLiveBox } from '@/utils/liveElementSize'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore } from '@/store'
import {
  contentBoxOfHost,
  createFitMeasureSession,
  fitSessionKey,
  innerBoxFromLiveStyles,
  rememberFitScale,
  textFitScaleForHtml,
  DEFAULT_TEXT_FONT_SIZE,
  type FitMeasureSession,
} from '@/utils/textFit'

const DEFAULT_INSET: TextInset = [10, 10, 10, 10]
const DEFAULT_LINE_HEIGHT = 1.5
const DEFAULT_PARAGRAPH_SPACE = 5
const DEFAULT_TEXT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

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
const fitFontNameOf = (el: FitSource) => (
  (el.type === 'shape' ? el.text?.defaultFontName : el.defaultFontName) || DEFAULT_TEXT_FONT_FAMILY
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
 * Resize is a pretext hot path: `prepare()` once per content/font, then only
 * `layout(prepared, width, lineHeight)` when the box size changes. No DOM
 * layout reads, no binary search. CSS `zoom` is written on the host so Canvas
 * / siblings do not re-render.
 */
export default (
  elementInfo: FitSource,
  liveContent?: LiveContentInput,
  hostEl?: { readonly current: HTMLElement | null },
  options?: { observeResize?: boolean },
) => {
  const { locale } = useI18nContext()
  const fitScaleRef = useRef(1)
  const sessionRef = useRef<FitMeasureSession | null>(null)
  const lastInnerRef = useRef({ width: 0, height: 0 })
  const rafRef = useRef(0)
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

  const measuredContent = () => {
    const live = readLive(liveContentRef.current)
    return live !== null && live !== undefined ? live : fitContentOf(elementInfoRef.current)
  }

  const authoredSize = () => fitAuthoredSizeOf(elementInfoRef.current)

  const enabledNow = () => {
    const el = elementInfoRef.current
    return elementLocksTextBox(el) && !!measuredContent()
  }

  const paintStyleFor = (scale: number): CSSProperties | undefined => {
    if (!enabledNow() || scale >= 1) return undefined
    // Font scaling (not zoom): spans render `calc(var(--text-fit-scale,1) * Npx)`
    // so the text RE-WRAPS at the smaller size — no over-shrink, and the raster
    // booth paints the identical CSS.
    return {
      '--text-fit-scale': String(scale),
      '--text-fit-base-size': `${Math.round(DEFAULT_TEXT_FONT_SIZE * scale * 100) / 100}px`,
    } as CSSProperties
  }

  const commitScale = (next: number) => {
    fitScaleRef.current = next
    const host = hostElRef.current?.current
    if (!host) return
    if (next >= 1) {
      host.style.removeProperty('--text-fit-scale')
      host.style.removeProperty('--text-fit-base-size')
      return
    }
    host.style.setProperty('--text-fit-scale', String(next))
    host.style.setProperty('--text-fit-base-size', `${Math.round(DEFAULT_TEXT_FONT_SIZE * next * 100) / 100}px`)
  }

  const ensureSession = () => {
    const el = elementInfoRef.current
    const content = measuredContent()
    if (!elementLocksTextBox(el) || !content) {
      sessionRef.current = null
      return null
    }
    const fontFamily = fitFontNameOf(el)
    const lineHeight = fitLineHeightOf(el)
    const letterSpacing = fitWordSpaceOf(el)
    const defaultSize = authoredSize()
    const key = fitSessionKey(content, fontFamily, lineHeight, letterSpacing, localeRef.current, defaultSize)
    if (sessionRef.current?.key === key) return sessionRef.current
    setPretextLocale(localeRef.current)
    sessionRef.current = createFitMeasureSession(content, {
      key,
      defaultFontFamily: fontFamily,
      defaultSize,
      lineHeight,
      letterSpacing: letterSpacing || undefined,
    })
    return sessionRef.current
  }

  const applyScale = () => {
    const el = elementInfoRef.current
    if (!elementLocksTextBox(el) || !measuredContent()) {
      lastInnerRef.current = { width: 0, height: 0 }
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
    const width = Math.round(innerWidth)
    const height = Math.round(innerHeight)
    const session = ensureSession()
    if (
      host
      && lastInnerRef.current.width === width
      && lastInnerRef.current.height === height
      && sessionRef.current?.key === session?.key
    ) {
      // React `style={textFitPaintStyle}` can wipe a DOM zoom written last frame.
      commitScale(fitScaleRef.current)
      return
    }
    if (!session || !session.items.length) {
      if (host) lastInnerRef.current = { width, height }
      commitScale(1)
      return
    }
    if (host) lastInnerRef.current = { width, height }
    const params = {
      innerWidth,
      innerHeight,
      defaultFontFamily: fitFontNameOf(el),
      defaultSize: authoredSize(),
      lineHeight: fitLineHeightOf(el),
      letterSpacing: fitWordSpaceOf(el) || 0,
      blockSpace: fitParagraphSpaceOf(el),
    }
    // Pretext estimate first (fast, usually close), then converge on the REAL
    // rendered height: pretext and the browser disagree on wrap points (narrow
    // boxes compound the drift over many lines), and a one-shot correction
    // under-shrinks when wraps change at the corrected scale. Refining both
    // directions on the live DOM ends on the largest scale that truly fits —
    // no clipping (only fitting scales are kept) and no wasted space.
    const estimate = textFitScaleForHtml(measuredContent(), params)
    commitScale(estimate)
    if (host) {
      host.style.removeProperty('--paragraphSpace')
      const content = host.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor') as HTMLElement | null
      if (content && height > 2) {
        if (useMainStore.getState().isScaling) {
          // Drag hot path: one down-correction only (never clips mid-drag);
          // the tightness refine runs on drop when frames are not scarce.
          commitScale(estimate)
          const rendered = content.scrollHeight
          if (rendered > height + 1) {
            commitScale(Math.max(0.01, estimate * (height / Math.max(1, rendered)) * 0.995))
          }
        }
        else {
          let candidate = estimate
          let settled: number | null = null
          for (let i = 0; i < 4; i++) {
            commitScale(candidate)
            const rendered = content.scrollHeight
            if (rendered <= height + 1) {
              // keep the LARGEST scale VERIFIED to fit — the estimate itself
              // is not trusted until the DOM confirms it
              if (settled == null || candidate > settled) settled = candidate
              const target = candidate * (height / Math.max(1, rendered))
              if (candidate >= 1 || target - candidate < 0.015) break
              candidate = Math.min(1, target * 0.995)
            }
            else {
              candidate = Math.max(0.01, candidate * (height / Math.max(1, rendered)) * 0.995)
            }
          }
          if (settled == null) settled = candidate
          commitScale(settled)
          rememberFitScale(measuredContent(), params, settled)
        }
        if (content.scrollHeight > height + 1 && box) {
          // Paragraph gaps are fixed px and do not scale with the font — in a
          // box shorter than the gaps no font factor can fit. Scale the gap
          // var for this subtree so the never-clip guarantee still holds.
          const gap = parseFloat(getComputedStyle(box).getPropertyValue('--paragraphSpace')) || 0
          if (gap > 0) {
            host.style.setProperty('--paragraphSpace', `${Math.max(0, Math.floor(gap * (height / Math.max(1, content.scrollHeight)) * 100) / 100)}px`)
          }
        }
      }
    }
  }

  const schedule = () => {
    if (typeof requestAnimationFrame === 'undefined') {
      applyScale()
      return
    }
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      applyScale()
    })
  }
  scheduleRef.current = schedule

  const setLiveContent = useCallback((html: string | null) => {
    const passed = liveContentRef.current
    if (isLiveRef(passed)) passed.current = html
    lastInnerRef.current = { width: 0, height: 0 }
    scheduleRef.current()
  }, [])

  const resync = useCallback(() => {
    lastInnerRef.current = { width: 0, height: 0 }
    applyScale()
  }, [])

  const liveValue = isLiveRef(liveContent) ? undefined : liveContent
  const lockMode = elementLocksTextBox(elementInfo)

  useLayoutEffect(() => {
    lastInnerRef.current = { width: 0, height: 0 }
    applyScale()
  }, [lockMode])

  useEffect(() => {
    lastInnerRef.current = { width: 0, height: 0 }
    scheduleRef.current()
  }, [
    fitContentOf(elementInfo),
    liveValue,
    elementInfo.width,
    elementInfo.height,
    fitLineHeightOf(elementInfo),
    fitParagraphSpaceOf(elementInfo),
    fitFontNameOf(elementInfo),
    elementInfo.type === 'text' ? elementInfo.placeholderFontSize : undefined,
    elementInfo.type === 'text' ? elementInfo.placeholder : undefined,
    fitWordSpaceOf(elementInfo),
    fitInsetOf(elementInfo),
    hostEl,
    locale,
  ])

  useEffect(() => subscribeLiveBox((id) => {
    if (id !== elementInfoRef.current.id) return
    lastInnerRef.current = { width: 0, height: 0 }
    scheduleRef.current()
  }), [])

  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        lastInnerRef.current = { width: 0, height: 0 }
        scheduleRef.current()
      }).catch(() => {})
    }
    scheduleRef.current()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  useEffect(() => {
    if (!observeResize || typeof ResizeObserver === 'undefined' || !hostEl) return
    const host = hostEl.current
    const box = contentBoxOfHost(host) ?? host
    if (!box) return
    const observer = new ResizeObserver(() => scheduleRef.current())
    observer.observe(box)
    return () => observer.disconnect()
  }, [hostEl, observeResize, elementInfo.id])

  const fitScale = fitScaleRef.current

  return {
    fitScale,
    fittedContent: measuredContent(),
    fitVars: {},
    textFitPaintStyle: paintStyleFor(fitScale),
    setLiveContent,
    resync,
  }
}
