import { beforeEach, describe, expect, it } from '@rstest/core'
import {
  buildThumbPaintKey,
  clearThumbBitmapCache,
  evictCachedThumb,
  getCachedThumbEntry,
  getCachedThumbSurface,
  putCachedThumbSurface,
  readThumbBitmapCacheStats,
  slideAffectedByFontChanges,
  subscribeThumbCacheEviction,
  type ThumbSurface,
} from '@/views/components/ThumbnailSlide/thumbBitmapCache'
import {
  canvasHasInk,
  clearSlideRasterResources,
  hasLatexColorCommand,
  isThumbnailScrolling,
  mathSizeBucket,
  notifyThumbnailScrollActivity,
  preloadEcharts,
  quantizeMathFontSize,
  readRasterDiagnostics,
  releaseRasterOwner,
  requestRaster,
  resetRasterDiagnostics,
  subscribeThumbnailScrollIdle,
  withRasterRequestContext,
} from '@/paint/rasterResources'
import { extractReferencedKatexFamilies, getBundledMathStaticCss, hasMathliveStaticRules } from '@/paint/mathSvgRaster'
import { reprioritizeSlidePaint, scheduleSlidePaint } from '@/paint/scheduler'
import { ensureMathStaticStyles, measureInlineMathBoxWithRenderer, resetInlineMathProbeForTest, resolveMathFontBaseUrl } from '@/utils/math'
import { getFikaAssetBase, setFikaAssetBase } from '@/utils/assetBase'
import { EMBED_ROOT_CLASS, MATH_PROBE_ATTR, resolveOffscreenHost } from '@/utils/portal'
import { getThumbRuntimeActiveCount, registerThumbRuntimeListener } from '@/views/components/ThumbnailSlide/thumbRailRuntime'
import { resolveLiveTextPaint } from '@/utils/textContrast'
import { createDocumentChangeWatcher, DOCUMENT_STORE_FIELDS, hasDocumentStateChanged } from '@/embed/documentChangeWatch'
import type { SlidesState } from '@/store/slides'
import { MATH_FONT_CHANGE_TOKEN } from '@/utils/textFit'
import { EditorState, TextSelection } from 'prosemirror-state'
import { Schema } from 'prosemirror-model'
import { schemaMarks, schemaNodes } from '@/utils/prosemirror/schema/index'
import { syncMathReadyInEditorView } from '@/utils/prosemirror/index'
import type { Slide, SlideTheme } from '@/types/slides'

const makeTheme = (fontName = 'Inter'): SlideTheme => ({
  themeColors: ['#1c7ed6'],
  fontColor: '#18181b',
  fontName,
  backgroundColor: '#ffffff',
  shadow: { h: 0, v: 0, blur: 0, color: '#000000' },
  outline: { width: 1, color: '#cccccc', style: 'solid' },
})

const makeSlide = (id: string, content: string, fontName = 'Inter'): Slide => ({
  id,
  background: { type: 'solid', color: '#0f172a' },
  elements: [{
    id: `${id}-t1`,
    type: 'text',
    left: 20,
    top: 20,
    width: 400,
    height: 100,
    rotate: 0,
    defaultFontName: fontName,
    defaultColor: '#ffffff',
    content,
  }],
})

const fakeSurface = (width: number, height: number) => {
  let closed = false
  const surface = {
    width,
    height,
    close() { closed = true },
  }
  // Make `surface instanceof ImageBitmap` check unnecessary by also zeroing width/height if treated as canvas,
  // or attach to global ImageBitmap when testing close().
  return {
    surface: surface as unknown as ThumbSurface,
    wasClosed: () => closed || (surface.width === 0 && surface.height === 0),
  }
}

describe('thumbBitmapCache byte-bounded LRU & scoped invalidation', () => {
  beforeEach(() => {
    clearThumbBitmapCache()
  })

  it('evicts oldest entries by byte budget and releases evicted surfaces', () => {
    // 100x100 RGBA = 40,000 bytes each; budget = 90,000 allows 2 entries, evicting oldest on 3rd.
    const a = fakeSurface(100, 100)
    const b = fakeSurface(100, 100)
    const c = fakeSurface(100, 100)
    expect(putCachedThumbSurface('k-a', a.surface, 90_000)).toBe(true)
    expect(putCachedThumbSurface('k-b', b.surface, 90_000)).toBe(true)
    // Touch k-a so k-b becomes LRU
    expect(getCachedThumbSurface('k-a')).toBe(a.surface)
    expect(putCachedThumbSurface('k-c', c.surface, 90_000)).toBe(true)

    expect(getCachedThumbSurface('k-b')).toBeUndefined()
    expect(b.wasClosed()).toBe(true)
    expect(getCachedThumbSurface('k-a')).toBe(a.surface)
    expect(getCachedThumbSurface('k-c')).toBe(c.surface)
    expect(readThumbBitmapCacheStats().bytes).toBe(80_000)

    evictCachedThumb('k-a')
    expect(a.wasClosed()).toBe(true)
    expect(readThumbBitmapCacheStats().bytes).toBe(40_000)

    // Eviction notifies remounted thumbnails even if the original producer unmounted.
    const evictedKeys: string[] = []
    const unsub = subscribeThumbCacheEviction(key => evictedKeys.push(key))
    evictCachedThumb('k-c')
    unsub()
    expect(evictedKeys).toEqual(['k-c'])
  })

  it('scopes font and math change checks to the slide families and math presence', () => {
    const plain = makeSlide('s1', '<p><span style="font-family: Lora">Hello</span></p>', 'Inter')
    const mathSlide = makeSlide('s2', '<p><span class="fika-math" data-latex="\\frac{1}{2}">1/2</span></p>', 'Inter')

    expect(slideAffectedByFontChanges(plain, 'Inter', new Set(['roboto']))).toBe(false)
    expect(slideAffectedByFontChanges(plain, 'Inter', new Set(['lora']))).toBe(true)
    expect(slideAffectedByFontChanges(plain, 'Inter', new Set([MATH_FONT_CHANGE_TOKEN]))).toBe(false)
    expect(slideAffectedByFontChanges(plain, 'Inter', new Set(['katex_main']))).toBe(false)

    expect(slideAffectedByFontChanges(mathSlide, 'Inter', new Set([MATH_FONT_CHANGE_TOKEN]))).toBe(true)
    expect(slideAffectedByFontChanges(mathSlide, 'Inter', new Set(['katex_math']))).toBe(true)
    expect(slideAffectedByFontChanges(mathSlide, 'Inter', new Set(['roboto']))).toBe(false)

    const theme = makeTheme('Inter')
    const key1 = buildThumbPaintKey({
      slide: plain,
      theme,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      pixelWidth: 240,
      pixelHeight: 135,
      showPlaceholders: false,
    })
    const key2 = buildThumbPaintKey({
      slide: plain,
      theme,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      pixelWidth: 240,
      pixelHeight: 135,
      showPlaceholders: false,
    })
    expect(key1).toBe(key2)
  })
})

describe('math raster helpers', () => {
  it('treats pure white and near-white opaque pixels on transparent canvas as valid ink', () => {
    const makeCanvas = (rgba: Uint8ClampedArray, width = 4, height = 4) => ({
      width,
      height,
      getContext: () => ({
        getImageData: () => ({ data: rgba }),
      }),
    }) as unknown as HTMLCanvasElement

    const whiteInk = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 12; i++) {
      whiteInk[i * 4] = 255
      whiteInk[i * 4 + 1] = 255
      whiteInk[i * 4 + 2] = 255
      whiteInk[i * 4 + 3] = 255
    }
    expect(canvasHasInk(makeCanvas(whiteInk))).toBe(true)

    const slateWhiteInk = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 12; i++) {
      slateWhiteInk[i * 4] = 248
      slateWhiteInk[i * 4 + 1] = 250
      slateWhiteInk[i * 4 + 2] = 252
      slateWhiteInk[i * 4 + 3] = 240
    }
    expect(canvasHasInk(makeCanvas(slateWhiteInk))).toBe(true)

    const empty = new Uint8ClampedArray(4 * 4 * 4)
    expect(canvasHasInk(makeCanvas(empty))).toBe(false)

    // Safari/WebKit SecurityError on tainted <foreignObject> canvas must not throw:
    // direct-SVG defaults to false (clean fallback to SnapDOM), while SnapDOM fallback
    // passes { onTainted: true } so WebKit never drops a rendered formula.
    const taintedCanvas = {
      width: 24,
      height: 16,
      getContext: () => ({
        getImageData: () => {
          const err = new Error('The canvas has been tainted by cross-origin data.')
          err.name = 'SecurityError'
          throw err
        },
      }),
    } as unknown as HTMLCanvasElement
    expect(canvasHasInk(taintedCanvas)).toBe(false)
    expect(canvasHasInk(taintedCanvas, { onTainted: true })).toBe(true)
  })

  it('quantizes math font sizes into 0.5px buckets', () => {
    expect(quantizeMathFontSize(17.384)).toBe(17.5)
    expect(quantizeMathFontSize(17.61)).toBe(17.5)
    expect(quantizeMathFontSize(18.01)).toBe(18)
    expect(quantizeMathFontSize(0.2)).toBe(1)
  })

  it('tracks complete vs provisional cache entries', () => {
    clearThumbBitmapCache()
    const completeSurf = fakeSurface(50, 50)
    const provisionalSurf = fakeSurface(50, 50)
    putCachedThumbSurface('done', completeSurf.surface, 100_000, 0)
    putCachedThumbSurface('prov', provisionalSurf.surface, 100_000, 5000)
    expect(getCachedThumbEntry('done')?.complete).toBe(true)
    expect(getCachedThumbEntry('prov')?.complete).toBe(false)
  })

  it('prioritizes visible over overscan, drops unmounted jobs without invoking produce, and resets scroll state after debounce', async () => {
    clearSlideRasterResources()
    resetRasterDiagnostics()
    const origWindow = globalThis.window
    if (typeof globalThis.window === 'undefined') {
      ;(globalThis as unknown as { window: typeof globalThis }).window = globalThis
    }
    try {
      let idleNotified = 0
      const unsubIdle = subscribeThumbnailScrollIdle(() => { idleNotified++ })
      notifyThumbnailScrollActivity()
      expect(isThumbnailScrolling()).toBe(true)

      const order: string[] = []
      let unmountedCalled = 0
      const stubCanvas = { width: 10, height: 10 } as unknown as HTMLCanvasElement

      // Queue overscan, unmounted, and visible jobs while scrolling is active.
      withRasterRequestContext('thumb-overscan', 'overscan', () => {
        requestRaster('prio-overscan', () => { order.push('overscan'); return stubCanvas }, () => {})
      })
      withRasterRequestContext('thumb-gone', 'overscan', () => {
        requestRaster('prio-gone', () => { unmountedCalled++; return stubCanvas }, () => {})
      })
      withRasterRequestContext('thumb-visible', 'visible', () => {
        requestRaster('prio-visible', () => { order.push('visible'); return stubCanvas }, () => {})
      })

      // Unmount thumb-gone before scroll settles: its queued job must be dropped without running produce().
      releaseRasterOwner('thumb-gone')
      expect(unmountedCalled).toBe(0)
      expect(readRasterDiagnostics().droppedUnmounted).toBe(1)

      // Wait for debounced scroll idle (150ms) + drain.
      await new Promise(r => setTimeout(r, 240))
      unsubIdle()

      expect(isThumbnailScrolling()).toBe(false)
      expect(idleNotified).toBe(1)
      expect(unmountedCalled).toBe(0)
      expect(order).toEqual(['visible', 'overscan'])
    }
    finally {
      if (origWindow === undefined) {
        delete (globalThis as unknown as { window?: unknown }).window
      }
      clearSlideRasterResources()
    }
  })

  it('skips math-ready doc replacement when ProsemirrorEditor is focused or editing so caret stays intact', () => {
    const schema = new Schema({ nodes: schemaNodes, marks: schemaMarks })
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text('Hello '),
      schema.nodes.math.create({ latex: '\\frac{1}{2}', html: '\\frac{1}{2}', display: false }),
      schema.text(' world'),
    ])
    const doc = schema.nodes.doc.create(null, [paragraph])
    const baseState = EditorState.create({ doc })
    // Place caret mid-text ("Hel|lo ...")
    const caretPos = 4
    const focusedState = baseState.apply(
      baseState.tr.setSelection(TextSelection.create(baseState.doc, caretPos)),
    )

    let dispatched = 0
    let currentState = focusedState
    const focusedView = {
      get state() { return currentState },
      hasFocus: () => true,
      dispatch: (tr: typeof focusedState.tr) => {
        dispatched++
        currentState = currentState.apply(tr)
      },
    }

    // Focused editor: must NOT dispatch and must preserve exact caret position.
    expect(syncMathReadyInEditorView(focusedView, '<p>Hello $\\frac{1}{2}$ world</p>', { editing: false })).toBe(false)
    expect(dispatched).toBe(0)
    expect(currentState.selection.from).toBe(caretPos)
    expect(currentState.selection.to).toBe(caretPos)

    // Actively editing (even if focus briefly moved to toolbar): must NOT dispatch.
    const editingUnfocusedView = { ...focusedView, hasFocus: () => false }
    expect(syncMathReadyInEditorView(editingUnfocusedView, '<p>Hello $\\frac{1}{2}$ world</p>', { editing: true })).toBe(false)
    expect(dispatched).toBe(0)
    expect(currentState.selection.from).toBe(caretPos)
  })

  it('extracts only referenced KaTeX font families for direct SVG math rasterization', () => {
    expect(extractReferencedKatexFamilies('<span class="ML__cmr">3</span>')).toEqual(['katex_main', 'katex_math'])
    const sumHtml = '<span class="ML__op-symbol ML__large-op">∑</span><span class="ML__delim-size1">(</span><span class="ML__ams">ℝ</span>'
    const families = extractReferencedKatexFamilies(sumHtml)
    expect(families).toContain('katex_main')
    expect(families).toContain('katex_math')
    expect(families).toContain('katex_size2')
    expect(families).toContain('katex_size1')
    expect(families).toContain('katex_ams')
    expect(families).not.toContain('katex_fraktur')
  })

  it('manages shared thumb rail runtime listeners cleanly across mounts and unmounts', () => {
    const noop = () => {}
    expect(getThumbRuntimeActiveCount()).toBe(0)
    const u1 = registerThumbRuntimeListener({ onDprChange: noop, onPaneDragEnd: noop, onScrollIdle: noop, onCacheEviction: noop, onFitScaleChange: noop, onFontChanges: noop })
    const u2 = registerThumbRuntimeListener({ onDprChange: noop, onPaneDragEnd: noop, onScrollIdle: noop, onCacheEviction: noop, onFitScaleChange: noop, onFontChanges: noop })
    expect(getThumbRuntimeActiveCount()).toBe(2)
    u1()
    expect(getThumbRuntimeActiveCount()).toBe(1)
    u2()
    expect(getThumbRuntimeActiveCount()).toBe(0)
  })

  it('buckets interactive math sizes on a 1.25x ceiling ladder and detects LaTeX color commands', () => {
    expect(mathSizeBucket(10)).toBe(10)
    expect(mathSizeBucket(11)).toBe(12.5)
    expect(mathSizeBucket(16)).toBe(19.5)
    expect(mathSizeBucket(18)).toBe(19.5)
    expect(mathSizeBucket(19.5)).toBe(19.5)
    expect(mathSizeBucket(20)).toBe(24.5)
    expect(mathSizeBucket(18)).toBeGreaterThanOrEqual(18)

    expect(hasLatexColorCommand('\\frac{1}{2}')).toBe(false)
    expect(hasLatexColorCommand('\\textcolor{red}{x}')).toBe(true)
    expect(hasLatexColorCommand('\\color{blue} y')).toBe(true)
    expect(hasLatexColorCommand('\\colorbox{yellow}{z}')).toBe(true)
    expect(hasLatexColorCommand('\\bbox[yellow]{x}')).toBe(true)
    expect(hasLatexColorCommand('\\emph{y}')).toBe(true)
  })

  it('keeps fika-embed-root on the math probe without polluting resolveOffscreenHost and never caches zero-size measurements', () => {
    resetInlineMathProbeForTest()
    const origDocument = globalThis.document
    let rectResult = { width: 0, height: 0 }
    let measureCalls = 0
    const bodyChildren: Array<{
      className: string
      attrs: Map<string, string>
      parentNode: unknown
      style: Record<string, string>
      innerHTML: string
      setAttribute: (k: string, v: string) => void
      getAttribute: (k: string) => string | null
      contains: (node: unknown) => boolean
      getBoundingClientRect: () => { width: number; height: number }
    }> = []
    const fakeBody = {
      appendChild(node: (typeof bodyChildren)[number]) {
        node.parentNode = fakeBody
        if (!bodyChildren.includes(node)) bodyChildren.push(node)
        return node
      },
    }
    const fakeDocument = {
      body: fakeBody,
      createElement() {
        const attrs = new Map<string, string>()
        const el = {
          className: '',
          attrs,
          parentNode: null as unknown,
          style: {} as Record<string, string>,
          innerHTML: '',
          setAttribute(k: string, v: string) { attrs.set(k, v) },
          getAttribute(k: string) { return attrs.get(k) ?? null },
          contains(node: unknown) { return node === el },
          getBoundingClientRect() {
            measureCalls++
            return rectResult
          },
        }
        return el
      },
      querySelector(selector: string) {
        if (selector === `.${EMBED_ROOT_CLASS}:not([${MATH_PROBE_ATTR}])`) {
          return bodyChildren.find(el => (
            el.className.split(/\s+/).includes(EMBED_ROOT_CLASS) && !el.attrs.has(MATH_PROBE_ATTR)
          )) ?? null
        }
        if (selector === `.${EMBED_ROOT_CLASS}`) {
          return bodyChildren.find(el => el.className.split(/\s+/).includes(EMBED_ROOT_CLASS)) ?? null
        }
        return null
      },
    }
    ;(globalThis as unknown as { document: unknown }).document = fakeDocument
    try {
      // Hidden display:none host returns 0x0 — must return null AND NOT poison failedMathBoxCache.
      expect(measureInlineMathBoxWithRenderer('\\frac{1}{2}', 18, false, l => l)).toBeNull()
      expect(bodyChildren).toHaveLength(1)
      expect(bodyChildren[0].className).toBe(EMBED_ROOT_CLASS)
      expect(bodyChildren[0].getAttribute(MATH_PROBE_ATTR)).toBe('true')
      // resolveOffscreenHost must skip the marked math probe and return document.body.
      expect(resolveOffscreenHost()).toBe(fakeBody as unknown as HTMLElement)

      // Once visible, re-measuring the same formula succeeds and then serves from cache.
      rectResult = { width: 22, height: 24 }
      expect(measureInlineMathBoxWithRenderer('\\frac{1}{2}', 18, false, l => l)).toEqual({ width: 22, height: 24 })
      const callsAfterVisible = measureCalls
      expect(measureInlineMathBoxWithRenderer('\\frac{1}{2}', 18, false, l => l)).toEqual({ width: 22, height: 24 })
      expect(measureCalls).toBe(callsAfterVisible)
    }
    finally {
      resetInlineMathProbeForTest()
      if (origDocument === undefined) {
        delete (globalThis as unknown as { document?: unknown }).document
      }
      else {
        ;(globalThis as unknown as { document: unknown }).document = origDocument
      }
    }
  })

  it('evicts stale edited-slide bitmaps per (slideId, pixelSize) without evicting other sizes', () => {
    clearThumbBitmapCache()
    const v1Small = fakeSurface(120, 68)
    const v1Large = fakeSurface(240, 135)
    const v2Small = fakeSurface(120, 68)

    expect(putCachedThumbSurface('s1-v1-small', v1Small.surface, 10_000_000, 0, 'slide-1')).toBe(true)
    expect(putCachedThumbSurface('s1-v1-large', v1Large.surface, 10_000_000, 0, 'slide-1')).toBe(true)
    expect(putCachedThumbSurface('s1-v2-small', v2Small.surface, 10_000_000, 0, 'slide-1')).toBe(true)

    expect(getCachedThumbSurface('s1-v1-small')).toBeUndefined()
    expect(v1Small.wasClosed()).toBe(true)
    expect(getCachedThumbSurface('s1-v1-large')).toBe(v1Large.surface)
    expect(getCachedThumbSurface('s1-v2-small')).toBe(v2Small.surface)
  })

  it('memoizes resolveLiveTextPaint cleanly for unchanged element/background inputs', () => {
    const slide = makeSlide('contrast-1', '<p><span style="color:#333333">Hello</span></p>')
    const el = slide.elements[0] as Extract<Slide['elements'][number], { type: 'text' }>
    const r1 = resolveLiveTextPaint('#333333', el.content, {
      element: el,
      elements: slide.elements,
      background: slide.background,
      themeFontColor: '#333333',
    })
    const r2 = resolveLiveTextPaint('#333333', el.content, {
      element: el,
      elements: slide.elements,
      background: slide.background,
      themeFontColor: '#333333',
    })
    expect(r1).toBe(r2)
    expect(r1.ink).toBe('#ffffff')
  })

  it('B4: injects scoped MathLive static + rewritten font CSS on cold tabs without fika-embed.css', async () => {
    const origDocument = globalThis.document
    const origWindow = globalThis.window
    if (typeof globalThis.window === 'undefined') {
      ;(globalThis as unknown as { window: unknown }).window = { location: { search: '' } }
    }
    const headChildren: Array<{ attrs: Map<string, string>; textContent: string; setAttribute: (k: string, v: string) => void }> = []
    const fakeHead = {
      appendChild(node: (typeof headChildren)[number]) {
        headChildren.push(node)
        return node
      },
      querySelector(selector: string) {
        if (selector === 'style[data-fika-math-static]') {
          return headChildren.find(el => el.attrs.has('data-fika-math-static')) ?? null
        }
        return null
      },
    }
    const fakeDocument = {
      head: fakeHead,
      styleSheets: [] as CSSStyleSheet[],
      createElement() {
        const attrs = new Map<string, string>()
        return {
          attrs,
          textContent: '',
          setAttribute(k: string, v: string) { attrs.set(k, v) },
        }
      },
      querySelector(selector: string) {
        return fakeHead.querySelector(selector)
      },
    }
    ;(globalThis as unknown as { document: unknown }).document = fakeDocument
    setFikaAssetBase('/fika-assets')
    try {
      expect(hasMathliveStaticRules()).toBe(false)
      const rawStaticWithEmbeddedFonts = [
        '@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2")}',
        ':root{--ML__static-fonts:true}',
        '.ML__frac-line{border-bottom:1px solid currentColor}',
      ].join('')
      const injected = ensureMathStaticStyles(
        rawStaticWithEmbeddedFonts,
        '@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2")}',
      )
      expect(injected).toBe(true)
      expect(hasMathliveStaticRules()).toBe(true)
      expect(headChildren).toHaveLength(1)
      expect(headChildren[0].textContent).toContain('/fika-assets/fonts/KaTeX_Main-Regular.woff2')
      expect(headChildren[0].textContent).toContain(`.${EMBED_ROOT_CLASS}{`)
      // Static CSS passed into bundledMathStaticCss and scoped wrapper must have
      // relative @font-face and :root blocks stripped so they never override embedded base64 fonts.
      expect(getBundledMathStaticCss()).not.toContain('@font-face')
      expect(getBundledMathStaticCss()).not.toContain(':root')
      expect(getBundledMathStaticCss()).toContain('.ML__frac-line')
      expect(headChildren[0].textContent).not.toContain('url(fonts/')
      // Idempotent once injected.
      expect(ensureMathStaticStyles('.ML__frac-line{}', '')).toBe(false)

      // Without setFikaAssetBase (cold dynamic import('/fika-assets/fika-embed.js')),
      // resolveMathFontBaseUrl infers /fika-assets/fonts/ from PerformanceResourceTiming.
      setFikaAssetBase('')
      const origGetEntries = performance.getEntriesByType
      ;(performance as unknown as { getEntriesByType: (t: string) => Array<{ name: string }> }).getEntriesByType = () => [
        { name: 'http://127.0.0.1:4173/fika-assets/fika-embed.js' },
      ]
      try {
        expect(resolveMathFontBaseUrl()).toBe('http://127.0.0.1:4173/fika-assets/fonts/')
      }
      finally {
        performance.getEntriesByType = origGetEntries
      }

      // configureRenderAssets configures assetBaseUrl (+ __webpack_public_path__)
      // for cold headless renderSlideImage / renderDeckAtlas calls.
      const { configureRenderAssets } = await import('@/embed/render')
      configureRenderAssets({ assetBaseUrl: '/custom-fika/' })
      expect(getFikaAssetBase()).toBe('/custom-fika')
      expect(resolveMathFontBaseUrl()).toBe('/custom-fika/fonts/')
    }
    finally {
      setFikaAssetBase('')
      if (origDocument === undefined) {
        delete (globalThis as unknown as { document?: unknown }).document
      }
      else {
        ;(globalThis as unknown as { document: unknown }).document = origDocument
      }
      if (origWindow === undefined) {
        delete (globalThis as unknown as { window?: unknown }).window
      }
      else {
        ;(globalThis as unknown as { window: unknown }).window = origWindow
      }
    }
  })

  it('B9: defers nearby overscan paints while scrolling and promotes on reprioritizeSlidePaint', async () => {
    const origWindow = globalThis.window
    const origRaf = globalThis.requestAnimationFrame
    if (typeof globalThis.window === 'undefined') {
      ;(globalThis as unknown as { window: typeof globalThis }).window = globalThis
    }
    const rafCallbacks: FrameRequestCallback[] = []
    ;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = cb => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }
    const flushOneFrame = () => {
      const next = rafCallbacks.shift()
      if (next) next(performance.now())
    }
    try {
      notifyThumbnailScrollActivity()
      expect(isThumbnailScrolling()).toBe(true)

      const ran: string[] = []
      const cancelNearby = scheduleSlidePaint('b9-nearby', () => { ran.push('nearby') }, 'nearby')
      const cancelVisible = scheduleSlidePaint('b9-visible', () => { ran.push('visible') }, 'visible')

      // Frame 1 during active scroll runs only the visible job (1 per scroll frame) and defers nearby.
      flushOneFrame()
      expect(ran).toEqual(['visible'])

      // Frame 2 still scrolling: nearby stays deferred until promoted or scroll settles.
      flushOneFrame()
      expect(ran).toEqual(['visible'])

      // IO confirms visibility -> reprioritize promotes the queued nearby job immediately.
      reprioritizeSlidePaint('b9-nearby', 'visible')
      flushOneFrame()
      expect(ran).toEqual(['visible', 'nearby'])

      cancelNearby()
      cancelVisible()
      // Let scroll debounce finish so global scrollActive resets cleanly.
      await new Promise(r => setTimeout(r, 200))
      expect(isThumbnailScrolling()).toBe(false)
    }
    finally {
      if (origRaf === undefined) {
        delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame
      }
      else {
        ;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = origRaf
      }
      if (origWindow === undefined) {
        delete (globalThis as unknown as { window?: unknown }).window
      }
    }
  })

  it('H3: preloadEcharts loads the lazy chart runtime cleanly before headless export', async () => {
    await expect(preloadEcharts()).resolves.toBeUndefined()
  })
})

describe('createDocumentChangeWatcher onChange guard & coalescing', () => {
  it('emits for every DOCUMENT_STORE_FIELDS mutation coalesced per microtask, ignores slideIndex, and flushes on destroy', async () => {
    const s1 = makeSlide('ctrl-1', '<p>One</p>')
    const s2 = makeSlide('ctrl-2', '<p>Two</p>')
    let state = {
      title: 'Initial',
      theme: makeTheme('Inter'),
      slides: [s1, s2],
      slideIndex: 0,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      viewportWidthInches: undefined,
      templates: [],
      importedTemplates: [],
      defaultTurningMode: 'fade',
    } as unknown as SlidesState
    const listeners = new Set<(next: SlidesState, prev: SlidesState) => void>()
    const fakeStore = {
      getState: () => state,
      subscribe: (fn: (next: SlidesState, prev: SlidesState) => void) => {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
      patch: (partial: Partial<SlidesState>) => {
        const prev = state
        state = { ...state, ...partial }
        for (const fn of listeners) fn(state, prev)
      },
    }

    const emitted: Array<{ title: string; count: number }> = []
    const watcher = createDocumentChangeWatcher(
      fakeStore,
      doc => emitted.push({ title: doc.title, count: doc.slides.length }),
      25,
    )

    // UI-only slideIndex changes must NOT emit.
    fakeStore.patch({ slideIndex: 1 })
    fakeStore.patch({ slideIndex: 0 })
    await new Promise(r => setTimeout(r, 60))
    expect(emitted).toHaveLength(0)

    // Verify hasDocumentStateChanged covers every exported DOCUMENT_STORE_FIELDS entry.
    expect(hasDocumentStateChanged(state, state)).toBe(false)
    for (const field of DOCUMENT_STORE_FIELDS) {
      const next = { ...state, [field]: Symbol(field) as unknown }
      expect(hasDocumentStateChanged(next as SlidesState, state)).toBe(true)
    }

    // Burst across every document field in one tick coalesces to a single emit.
    fakeStore.patch({ title: 'Deck A' })
    fakeStore.patch({ theme: makeTheme('Lora') })
    fakeStore.patch({ viewportSize: 1280 })
    fakeStore.patch({ viewportRatio: 0.75 })
    fakeStore.patch({ viewportWidthInches: 13.333 })
    fakeStore.patch({ slides: [s1, makeSlide('ctrl-2', '<p>Two updated</p>')] })
    await new Promise(r => setTimeout(r, 60))
    expect(emitted).toHaveLength(1)
    expect(emitted[0].title).toBe('Deck A')

    // destroy() with a queued microtask change must flush synchronously.
    fakeStore.patch({ title: 'Deck Final' })
    watcher.destroy()
    expect(emitted).toHaveLength(2)
    expect(emitted[1].title).toBe('Deck Final')
  })
})
