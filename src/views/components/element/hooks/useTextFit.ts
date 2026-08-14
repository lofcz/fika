import { useCallback, useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { setLocale as setPretextLocale } from '@chenglou/pretext'
import type { PPTTextElement, TextInset } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import {
  DEFAULT_TEXT_FONT_SIZE,
  extractFitBlocksFromHtml,
  fitClipPadding,
  fitFontScaleForBlocks,
  fitScaleFromContentHeight,
  measureUnzoomedScrollHeight,
  MIN_FIT_SCALE,
  scaleHtmlFontSizes,
} from '@/utils/textFit'

const DEFAULT_INSET: TextInset = [10, 10, 10, 10]
const DEFAULT_LINE_HEIGHT = 1.5
const DEFAULT_PARAGRAPH_SPACE = 5
const DEFAULT_TEXT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

type LiveContentInput = string | null | undefined | RefObject<string | null | undefined>

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function innerBox(el: PPTTextElement) {
  const inset = el.inset || DEFAULT_INSET
  return {
    innerWidth: el.width - inset[1] - inset[3],
    innerHeight: el.height - inset[0] - inset[2],
  }
}

function isLiveRef(live: LiveContentInput): live is RefObject<string | null | undefined> {
  return !!live && typeof live === 'object' && 'current' in live
}

function readLive(live: LiveContentInput): string | null | undefined {
  if (isLiveRef(live)) return live.current
  return live
}

/**
 * Auto-fit a fixed-size text box so its content never overflows.
 *
 * The painted scale is always a uniform CSS `zoom` of the *same* authored HTML
 * (editor and thumbnails). That is the Excel shrink-to-fit contract: one layout,
 * one scale, no overlay swap on click. The scale comes from the real laid-out
 * height (`measureUnzoomedScrollHeight`) once the host is mounted; pretext is
 * only the pre-mount guess so the first frame is close.
 *
 * `fitScale` / `liveContent` stay off the React state path: assigning them
 * patches the host style without writing the store or rerendering Canvas /
 * siblings. Zoom is committed on the host DOM; input frames never call setState.
 */
export default (
  elementInfo: PPTTextElement,
  liveContent?: LiveContentInput,
  hostEl?: { readonly current: HTMLElement | null },
  options?: { observeResize?: boolean },
) => {
  const { locale } = useI18nContext()
  const fitScaleRef = useRef(1)
  const measuringRef = useRef(false)
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
    return live !== null && live !== undefined ? live : elementInfoRef.current.content
  }

  const enabledNow = () => {
    const el = elementInfoRef.current
    return !!el.fixedHeight && !el.vertical && !!measuredContent()
  }

  const paintStyleFor = (scale: number): CSSProperties | undefined => {
    if (!enabledNow() || scale >= 1) return undefined
    return { zoom: String(scale) }
  }

  const commitScale = (next: number) => {
    fitScaleRef.current = next
    const host = hostElRef.current?.current
    if (!host) return
    const style = paintStyleFor(next)
    if (!style) {
      if (host.style.zoom) host.style.removeProperty('zoom')
      return
    }
    if (host.style.zoom !== style.zoom) host.style.zoom = String(style.zoom)
  }

  const pretextGuess = () => {
    const el = elementInfoRef.current
    const content = measuredContent()
    if (!el.fixedHeight || el.vertical || !content) return 1
    const { innerWidth, innerHeight } = innerBox(el)
    try {
      setPretextLocale(localeRef.current)
      const { blocks } = extractFitBlocksFromHtml(content, {
        defaultFontFamily: el.defaultFontName || DEFAULT_TEXT_FONT_FAMILY,
      })
      const maxFont = blocks.reduce((max, block) => Math.max(max, block.size), DEFAULT_TEXT_FONT_SIZE)
      const lineHeight = el.lineHeight ?? DEFAULT_LINE_HEIGHT
      return fitFontScaleForBlocks(blocks, {
        innerWidth,
        innerHeight: Math.max(1, innerHeight - fitClipPadding(maxFont, lineHeight)),
        lineHeight,
        blockSpace: el.paragraphSpace ?? DEFAULT_PARAGRAPH_SPACE,
        letterSpacing: el.wordSpace || undefined,
        minScale: MIN_FIT_SCALE,
      })
    }
    catch {
      return 1
    }
  }

  const applyDomScale = () => {
    const el = elementInfoRef.current
    if (!el.fixedHeight || el.vertical || !measuredContent()) {
      commitScale(1)
      return
    }
    const host = hostElRef.current?.current
    if (!host) {
      commitScale(pretextGuess())
      return
    }
    const hasLiveEditor = !!host.querySelector('.ProseMirror:not(.ProseMirror-static)')
    if (!hasLiveEditor || readLive(liveContentRef.current) == null) {
      commitScale(pretextGuess())
      return
    }
    if (measuringRef.current) return
    measuringRef.current = true
    try {
      const { innerWidth, innerHeight } = innerBox(el)
      const height = measureUnzoomedScrollHeight(host, innerWidth)
      const maxFont = extractFitBlocksFromHtml(measuredContent(), {
        defaultFontFamily: el.defaultFontName || DEFAULT_TEXT_FONT_FAMILY,
      }).blocks.reduce((max, block) => Math.max(max, block.size), DEFAULT_TEXT_FONT_SIZE)
      const pad = fitClipPadding(maxFont, el.lineHeight ?? DEFAULT_LINE_HEIGHT)
      const next = fitScaleFromContentHeight(height, Math.max(1, innerHeight - pad))
      if (Math.abs(next - fitScaleRef.current) >= 0.0005) commitScale(next)
    }
    catch {
      commitScale(pretextGuess())
    }
    finally {
      measuringRef.current = false
    }
  }

  const schedule = () => {
    Promise.resolve().then(() => {
      if (typeof requestAnimationFrame === 'undefined') {
        applyDomScale()
        return
      }
      requestAnimationFrame(applyDomScale)
    })
  }
  scheduleRef.current = schedule

  const setLiveContent = useCallback((html: string | null) => {
    const passed = liveContentRef.current
    if (isLiveRef(passed)) passed.current = html
    scheduleRef.current()
  }, [])

  const liveValue = isLiveRef(liveContent) ? undefined : liveContent

  useEffect(() => {
    scheduleRef.current()
  }, [
    elementInfo.content,
    liveValue,
    elementInfo.width,
    elementInfo.height,
    elementInfo.fixedHeight,
    elementInfo.vertical,
    elementInfo.lineHeight,
    elementInfo.paragraphSpace,
    elementInfo.defaultFontName,
    elementInfo.wordSpace,
    elementInfo.inset,
    hostEl,
    locale,
  ])

  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => scheduleRef.current()).catch(() => {})
    }
    scheduleRef.current()
  }, [])

  useEffect(() => {
    if (!observeResize || typeof ResizeObserver === 'undefined' || !hostEl) return
    const observer = new ResizeObserver(() => scheduleRef.current())
    const node = hostEl.current
    if (node) observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [hostEl, observeResize])

  const fitScale = fitScaleRef.current
  const enabled = enabledNow()
  const fittedContent = (() => {
    const content = measuredContent()
    if (!enabled || fitScale >= 1) return content
    return scaleHtmlFontSizes(content, fitScale)
  })()
  const fitVars = (() => {
    if (!enabled || fitScale >= 1) return {}
    return { '--text-fit-base-size': `${roundTo(DEFAULT_TEXT_FONT_SIZE * fitScale)}px` }
  })()
  const textFitPaintStyle = paintStyleFor(fitScale)

  return {
    fitScale,
    fittedContent,
    fitVars,
    textFitPaintStyle,
    setLiveContent,
  }
}
