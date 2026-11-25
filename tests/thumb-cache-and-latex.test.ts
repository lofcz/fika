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
  isThumbnailScrolling,
  notifyThumbnailScrollActivity,
  quantizeMathFontSize,
  readRasterDiagnostics,
  releaseRasterOwner,
  requestRaster,
  resetRasterDiagnostics,
  subscribeThumbnailScrollIdle,
  withRasterRequestContext,
} from '@/paint/rasterResources'
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
