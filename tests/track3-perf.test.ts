import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core'
import type { PPTTextElement, Slide } from '../src/types/slides'

rs.mock('@/utils/font', () => ({ collectSlidesFonts: () => [], loadGoogleFonts: () => {} }))
rs.mock('@/i18n/locale', () => ({ getFikaLocale: () => 'en', setFikaLocale: () => {}, isLocale: () => true }))
rs.mock('@/embed/localeBridge', () => ({ applyLocale: async () => {} }))
rs.mock('@/i18n/getLL', () => ({
  getLL: () => ({
    editor: {
      presentation: { untitled: () => 'Untitled' },
    },
  }),
}))

const snapshotRows = new Map<number, Record<string, unknown>>()
let nextSnapshotId = 1

rs.mock('@/utils/database', () => ({
  db: {
    snapshots: {
      async clear() {
        snapshotRows.clear()
        nextSnapshotId = 1
      },
      async add(row: Record<string, unknown>) {
        const id = nextSnapshotId++
        snapshotRows.set(id, { ...structuredClone(row), id })
        return id
      },
      async get(id: number) {
        const row = snapshotRows.get(id)
        return row ? structuredClone(row) : undefined
      },
      async bulkGet(ids: number[]) {
        return ids.map(id => {
          const row = snapshotRows.get(id)
          return row ? structuredClone(row) : undefined
        })
      },
      async put(row: Record<string, unknown> & { id?: number }) {
        const id = row.id ?? nextSnapshotId++
        snapshotRows.set(id, { ...structuredClone(row), id })
        return id
      },
      async update(id: number, patch: Record<string, unknown>) {
        const prev = snapshotRows.get(id)
        if (prev) snapshotRows.set(id, { ...prev, ...structuredClone(patch) })
        return prev ? 1 : 0
      },
      async delete(id: number) {
        snapshotRows.delete(id)
      },
      async bulkDelete(ids: number[]) {
        for (const id of ids) snapshotRows.delete(id)
      },
      orderBy() {
        return {
          async primaryKeys() {
            return [...snapshotRows.keys()].sort((a, b) => a - b)
          },
          async toArray() {
            return [...snapshotRows.keys()].sort((a, b) => a - b).map(id => structuredClone(snapshotRows.get(id)!))
          },
        }
      },
    },
    async transaction(_mode: string, _table: unknown, fn: () => Promise<void>) {
      await fn()
    },
  },
  deleteDiscardedDB: async () => {},
}))

const tippyCalls: Array<{ el: HTMLElement; props: Record<string, unknown>; shown: boolean; destroyed: boolean }> = []

rs.mock('tippy.js', () => ({
  default: (el: HTMLElement, props: Record<string, unknown>) => {
    const record = { el, props, shown: false, destroyed: false }
    tippyCalls.push(record)
    const inst = {
      props,
      show() {
        record.shown = true
      },
      hide() {
        record.shown = false
        const onHidden = props.onHidden as ((instance: unknown) => void) | undefined
        onHidden?.(inst)
      },
      setContent(next: unknown) {
        props.content = next
      },
      destroy() {
        record.destroyed = true
      },
    }
    return inst
  },
}))

import { useSlidesStore, selectSlideById } from '@/store/slides'
import { useMainStore, selectActiveElementList } from '@/store/main'
import { useSnapshotStore } from '@/store/snapshot'
import {
  cloneSlidesForPersistence,
  internMediaSrc,
  resetMediaInternForTests,
} from '@/utils/mediaIntern'
import { buildPersistedDocument, createDocumentChangeWatcher } from '@/embed/documentChangeWatch'
import { applyDocumentToStores } from '@/embed/initialDocument'
import { createAgenticApi } from '@/embed/agentic/createAgenticApi'
import { payloadNeedsHfmath } from '@/embed/agentic/helpers'
import { registerTemplateLoaders } from '@/embed/agentic/templates'
import { getCachedHfmath } from '@/utils/hfmathLazy'
import { registerCommitFlusher } from '@/utils/commitQueue'
import { bindTooltips } from '@/utils/tooltipBindCore'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function makeTextEl(id: string, text: string): PPTTextElement {
  return {
    type: 'text',
    id,
    left: 20,
    top: 20,
    width: 300,
    height: 60,
    rotate: 0,
    content: `<p>${text}</p>`,
    defaultFontName: 'Inter',
    defaultColor: '#222222',
  }
}

function makeSlide(id: string, text = 'Hello'): Slide {
  return {
    id,
    elements: [makeTextEl(`el_${id}`, text)],
    background: { type: 'solid', color: '#ffffff' },
  }
}

beforeEach(() => {
  snapshotRows.clear()
  nextSnapshotId = 1
  tippyCalls.length = 0
  resetMediaInternForTests()
  useSlidesStore.getState().applyDocument({
    title: 'Deck',
    slides: [makeSlide('s1', 'One'), makeSlide('s2', 'Two')],
    slideIndex: 0,
  })
  useMainStore.setState({
    activeElementIdList: [],
    handleElementId: '',
    activeGroupElementId: '',
    selectedSlidesIndex: [],
  })
  useSnapshotStore.setState({ snapshotCursor: -1, snapshotLength: 0 })
})

afterEach(() => {
  resetMediaInternForTests()
})

describe('Track 3 store, persistence, history, agentic, and tooltip performance guarantees', () => {
  it('applyDocument publishes a single store notification and selectSlideById / selectActiveElementList stay O(1) and memoized', () => {
    let notifications = 0
    const unsub = useSlidesStore.subscribe(() => {
      notifications++
    })
    try {
      useSlidesStore.getState().applyDocument({
        title: 'Updated Deck',
        slides: [makeSlide('a', 'Alpha'), makeSlide('b', 'Beta'), makeSlide('c', 'Gamma')],
        theme: { fontName: 'Georgia' },
        viewportSize: 1280,
        viewportRatio: 0.75,
        viewportWidthInches: 13.333,
        hasViewportWidthInches: true,
        slideIndex: 1,
      })
    } finally {
      unsub()
    }

    expect(notifications).toBe(1)
    const state = useSlidesStore.getState()
    expect(state.title).toBe('Updated Deck')
    expect(state.slideIndex).toBe(1)
    expect(state.theme.fontName).toBe('Georgia')
    expect(state.viewportSize).toBe(1280)
    expect(state.viewportRatio).toBe(0.75)
    expect(selectSlideById(state, 'b')?.id).toBe('b')
    expect(selectSlideById(state, 'missing')).toBeUndefined()

    useMainStore.getState().setActiveElementIdList(['el_b'])
    const first = selectActiveElementList(useMainStore.getState())
    const second = selectActiveElementList(useMainStore.getState())
    expect(first).toBe(second)
    expect(first.map(el => el.id)).toEqual(['el_b'])
  })

  it('deferred initSnapshotDatabase captures initial baseline synchronously even when an edit arrives before idle', async () => {
    const initPromise = useSnapshotStore.getState().initSnapshotDatabase({ defer: true })

    // Mutate immediately before the idle callback has had a chance to run.
    useSlidesStore.getState().updateElement({
      id: 'el_s1',
      props: { content: '<p>Edited Immediately</p>' },
    })
    const addPromise = useSnapshotStore.getState().addSnapshot()
    await Promise.all([initPromise, addPromise])

    expect(useSnapshotStore.getState().snapshotLength).toBe(2)
    expect(useSnapshotStore.getState().snapshotCursor).toBe(1)

    await useSnapshotStore.getState().unDo()
    const restoredEl = useSlidesStore.getState().slides[0].elements[0] as PPTTextElement
    expect(restoredEl.content).toBe('<p>One</p>')

    await useSnapshotStore.getState().reDo()
    const redoneEl = useSlidesStore.getState().slides[0].elements[0] as PPTTextElement
    expect(redoneEl.content).toBe('<p>Edited Immediately</p>')
  })

  it('batch-folds history when crossing 30 entries and preserves undo/redo parity', async () => {
    await useSnapshotStore.getState().initSnapshotDatabase()
    for (let i = 1; i <= 32; i++) {
      useSlidesStore.getState().updateElement({
        id: 'el_s1',
        props: { content: `<p>Step ${i}</p>` },
      })
      await useSnapshotStore.getState().addSnapshot()
    }

    // Folded from 31 -> 20, then 32 -> 21, 33 -> 22.
    expect(snapshotRows.size).toBe(22)
    expect(useSnapshotStore.getState().snapshotLength).toBe(22)

    await useSnapshotStore.getState().unDo()
    expect((useSlidesStore.getState().slides[0].elements[0] as PPTTextElement).content).toBe('<p>Step 31</p>')

    // No-op addSnapshot must not discard redo.
    await useSnapshotStore.getState().addSnapshot()
    expect(useSnapshotStore.getState().snapshotCursor).toBe(20)
    expect(useSnapshotStore.getState().snapshotLength).toBe(22)

    await useSnapshotStore.getState().reDo()
    expect((useSlidesStore.getState().slides[0].elements[0] as PPTTextElement).content).toBe('<p>Step 32</p>')
  })

  it('cloneSlidesForPersistence caches untouched slides per WeakMap and invalidates when mediaIntern updates', async () => {
    const slides = useSlidesStore.getState().slides
    const first = cloneSlidesForPersistence(slides)
    expect(first[0]).not.toBe(slides[0])
    expect(first[1]).not.toBe(slides[1])

    // Editing slide 0 replaces slides[0] ref but keeps slides[1] identical.
    useSlidesStore.getState().updateElement({
      id: 'el_s1',
      props: { left: 99 },
    })
    const second = buildPersistedDocument(useSlidesStore.getState()).slides
    expect(second[0]).not.toBe(first[0])
    expect((second[0].elements[0] as PPTTextElement).left).toBe(99)
    expect(second[1]).toBe(first[1])

    // Interning a blob URL invalidates the cache and rewrites blob: back to data:.
    const blobUrl = await internMediaSrc(PIXEL)
    useSlidesStore.getState().addElement({
      type: 'image',
      id: 'img_1',
      src: blobUrl,
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      rotate: 0,
      fixedRatio: true,
    })
    const persisted = buildPersistedDocument(useSlidesStore.getState()).slides
    const img = persisted[0].elements.find(el => el.id === 'img_1')
    expect(img && img.type === 'image' ? img.src : '').toBe(PIXEL)
    expect(Object.isFrozen(persisted[0])).toBe(true)
  })

  it('agentic commands flush pending text without clearing editingElementId and emit selectionChanged on snapshot history changes', async () => {
    const runtime = createAgenticApi()
    const events: Array<{ type: string; canUndo?: boolean }> = []
    runtime.api.subscribe(event => {
      if (event.type === 'selectionChanged') {
        const data = event.data as { canUndo?: boolean } | undefined
        events.push({ type: event.type, canUndo: data?.canUndo })
      }
    })

    // Repeated drag/typing mutations without selection change must emit zero selectionChanged events.
    for (let i = 0; i < 10; i++) {
      useSlidesStore.getState().updateElement({
        id: 'el_s1',
        props: { left: 20 + i, content: `<p>Key ${i}</p>` },
      })
    }
    await Promise.resolve()
    await Promise.resolve()
    expect(events).toHaveLength(0)

    // Read-only canvas.get must flush pending text WITHOUT kicking the teacher out of editingElementId.
    let flushed = 0
    const unregister = registerCommitFlusher(() => {
      flushed++
      useSlidesStore.getState().updateElement({
        id: 'el_s1',
        props: { content: '<p>Flushed Draft</p>' },
      })
    })
    try {
      useMainStore.getState().setEditingElementId('el_s1')
      const res = await runtime.api.execute({ type: 'canvas.get', payload: {} })
      expect(res.ok).toBe(true)
      expect(flushed).toBeGreaterThanOrEqual(1)
      expect(useMainStore.getState().editingElementId).toBe('el_s1')
      expect((useSlidesStore.getState().slides[0].elements[0] as PPTTextElement).content).toBe('<p>Flushed Draft</p>')
    } finally {
      unregister()
      useMainStore.getState().setEditingElementId('')
    }

    // Multiple selection changes in one tick coalesce into a single emission.
    useMainStore.getState().setActiveElementIdList(['el_s1'])
    useSlidesStore.getState().updateSlideIndex(1)
    await Promise.resolve()
    await Promise.resolve()
    expect(events).toHaveLength(1)

    // Snapshot canUndo/canRedo transition must also trigger selectionChanged.
    await useSnapshotStore.getState().initSnapshotDatabase()
    useSlidesStore.getState().updateElement({
      id: 'el_s2',
      props: { content: '<p>Changed</p>' },
    })
    await useSnapshotStore.getState().addSnapshot()
    await Promise.resolve()
    await Promise.resolve()
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events[events.length - 1].canUndo).toBe(true)

    runtime.stop()
  })

  it('bindTooltips creates zero tippy instances on mount, shows lazily on first hover after 300ms, ignores mouse focusin, and destroys on leave', async () => {
    class FakeNode extends EventTarget {
      isConnected = true
      focusVisible = false
      children = new Set<FakeNode>()
      attrs = new Map<string, string>()
      contains(node: unknown) {
        return node === this || this.children.has(node as FakeNode)
      }
      closest(selector: string) {
        if (selector === '[data-tooltip]' && this.attrs.has('data-tooltip')) return this
        return null
      }
      matches(selector: string) {
        if (selector === ':focus-visible') return this.focusVisible
        return false
      }
      getAttribute(name: string) {
        return this.attrs.get(name) ?? null
      }
      setAttribute(name: string, value: string) {
        this.attrs.set(name, value)
      }
    }

    const prevElement = globalThis.Element
    const prevNode = globalThis.Node
    const prevDocument = globalThis.Document
    ;(globalThis as Record<string, unknown>).Element = FakeNode
    ;(globalThis as Record<string, unknown>).Node = FakeNode
    ;(globalThis as Record<string, unknown>).Document = class FakeDocument {}

    const root = new FakeNode()
    const btn = new FakeNode()
    btn.setAttribute('data-tooltip', 'Align left')
    btn.setAttribute('data-tooltip-placement', 'bottom')
    root.children.add(btn)

    const dispose = bindTooltips(root as unknown as ParentNode)
    try {
      // Zero eager instances on mount.
      expect(tippyCalls).toHaveLength(0)

      // Mouse-click focusin (not :focus-visible) must NOT show the tooltip.
      btn.focusVisible = false
      const mouseFocus = new Event('focusin')
      Object.defineProperty(mouseFocus, 'target', { value: btn })
      root.dispatchEvent(mouseFocus)
      await new Promise(resolve => setTimeout(resolve, 340))
      expect(tippyCalls).toHaveLength(0)

      // Keyboard focusin (:focus-visible) DOES show the tooltip.
      btn.focusVisible = true
      const keyFocus = new Event('focusin')
      Object.defineProperty(keyFocus, 'target', { value: btn })
      root.dispatchEvent(keyFocus)
      await new Promise(resolve => setTimeout(resolve, 340))
      expect(tippyCalls).toHaveLength(1)
      expect(tippyCalls[0].shown).toBe(true)

      // Pointer down dismisses immediately.
      const downEvent = new Event('pointerdown')
      Object.defineProperty(downEvent, 'target', { value: btn })
      root.dispatchEvent(downEvent)
      expect(tippyCalls[0].destroyed).toBe(true)

      // First hover starts 300ms delay immediately (capture listener on root).
      const overEvent = new Event('pointerover')
      Object.defineProperty(overEvent, 'target', { value: btn })
      root.dispatchEvent(overEvent)
      expect(tippyCalls).toHaveLength(1)

      await new Promise(resolve => setTimeout(resolve, 340))
      expect(tippyCalls).toHaveLength(2)
      expect(tippyCalls[1].shown).toBe(true)
      expect(tippyCalls[1].props.content).toBe('Align left')
      expect(tippyCalls[1].props.placement).toBe('bottom')

      // Pointer leave hides and destroys the instance in onHidden.
      const outEvent = new Event('pointerout')
      Object.defineProperty(outEvent, 'target', { value: btn })
      Object.defineProperty(outEvent, 'relatedTarget', { value: null })
      root.dispatchEvent(outEvent)
      expect(tippyCalls[1].shown).toBe(false)
      expect(tippyCalls[1].destroyed).toBe(true)

      // Lazy attribute update picked up on next hover.
      btn.setAttribute('data-tooltip', 'Align right')
      const overEvent2 = new Event('pointerover')
      Object.defineProperty(overEvent2, 'target', { value: btn })
      root.dispatchEvent(overEvent2)
      await new Promise(resolve => setTimeout(resolve, 340))
      expect(tippyCalls).toHaveLength(3)
      expect(tippyCalls[2].props.content).toBe('Align right')
    } finally {
      dispose()
      ;(globalThis as Record<string, unknown>).Element = prevElement
      ;(globalThis as Record<string, unknown>).Node = prevNode
      ;(globalThis as Record<string, unknown>).Document = prevDocument
    }
  })

  it('B2: resetSnapshotHistory isolates remounts and drops stale in-flight undo, while immediate post-mount edits stay undoable', async () => {
    // Simulate mount #1 applying deck1 + deferring baseline snapshot before returning controller.
    applyDocumentToStores({ title: 'Deck 1', slides: [makeSlide('d1_s1', 'Deck 1 Original')] })
    const seedPromise = useSnapshotStore.getState().initSnapshotDatabase({ defer: true })

    // Immediate post-mount host command (0ms after mountFika resolves) must be undoable.
    const runtime1 = createAgenticApi()
    const updateRes = await runtime1.api.slides.update('d1_s1', {
      elements: [makeTextEl('el_d1_s1', 'Deck 1 Mutated Immediately')],
    })
    await seedPromise
    expect(updateRes.ok).toBe(true)
    expect(useSnapshotStore.getState().snapshotLength).toBe(2)

    await useSnapshotStore.getState().unDo()
    expect((useSlidesStore.getState().slides[0].elements[0] as PPTTextElement).content).toBe('<p>Deck 1 Original</p>')
    runtime1.stop()

    // Destroy mount #1: resetSnapshotHistory clears state + Dexie rows and invalidates stale work.
    await useSnapshotStore.getState().resetSnapshotHistory()
    expect(useSnapshotStore.getState().snapshotCursor).toBe(-1)
    expect(useSnapshotStore.getState().snapshotLength).toBe(0)
    expect(snapshotRows.size).toBe(0)

    // Mount #2 with a completely different deck: pressing Undo must NOT restore Deck 1.
    applyDocumentToStores({ title: 'Deck 2', slides: [makeSlide('d2_s1', 'Deck 2 Fresh')] })
    await useSnapshotStore.getState().initSnapshotDatabase()
    await useSnapshotStore.getState().unDo()
    expect(useSlidesStore.getState().slides[0].id).toBe('d2_s1')
    expect((useSlidesStore.getState().slides[0].elements[0] as PPTTextElement).content).toBe('<p>Deck 2 Fresh</p>')
  })

  it('B3: applyDocumentToStores resets slideIndex to 0 and replaces theme instead of merging, and resetSession clears transient main state', () => {
    useSlidesStore.getState().applyDocument({
      title: 'Dark Deck',
      slides: [makeSlide('dark_1', 'A'), makeSlide('dark_2', 'B')],
      theme: { backgroundColor: '#111111', fontColor: '#ffffff', fontName: 'Fira Code' },
      slideIndex: 1,
    })
    useMainStore.getState().setActiveElementIdList(['el_dark_2'])
    useMainStore.getState().setEditingElementId('el_dark_2')
    useMainStore.getState().setReadOnly(true)
    useMainStore.getState().setSearchPanelState(true)

    useMainStore.getState().resetSession()
    expect(useMainStore.getState().activeElementIdList).toEqual([])
    expect(useMainStore.getState().editingElementId).toBe('')
    expect(useMainStore.getState().readOnly).toBe(false)
    expect(useMainStore.getState().showSearchPanel).toBe(false)

    // Mounting a fresh deck without theme must replace (not merge) the previous dark theme and reset slideIndex to 0.
    applyDocumentToStores({ title: 'Light Deck', slides: [makeSlide('light_1', 'Fresh')] })
    const next = useSlidesStore.getState()
    expect(next.slideIndex).toBe(0)
    expect(next.theme.backgroundColor).toBe('#fff')
    expect(next.theme.fontColor).toBe('#333')
    expect(next.theme.fontName).toBe('Calibri')
  })

  it('B7: documentChangeWatch.mute() flushes pending unsaved edits before suppressing reveal frames', async () => {
    const emitted: string[] = []
    const watcher = createDocumentChangeWatcher(
      useSlidesStore,
      doc => emitted.push((doc.slides[0].elements[0] as PPTTextElement).content),
      400,
    )
    try {
      // User edit queued for 400ms debounce.
      useSlidesStore.getState().updateElement({
        id: 'el_s1',
        props: { content: '<p>Unsaved User Edit</p>' },
      })
      // Reveal starts immediately and calls mute() before the 400ms debounce fires.
      watcher.mute()
      expect(emitted).toEqual(['<p>Unsaved User Edit</p>'])

      // Transient reveal frames while muted must NOT emit.
      useSlidesStore.getState().updateElement({
        id: 'el_s1',
        props: { content: '<p>Transient Reveal Frame</p>' },
      })
      await Promise.resolve()
      watcher.destroy()
      expect(emitted).toEqual(['<p>Unsaved User Edit</p>'])
    } finally {
      watcher.destroy()
    }
  })

  it('cloneJsonSafePayload normalizes toJSON/NaN/Infinity and rejects circular refs and BigInt without JSON.stringify cloning', async () => {
    const runtime = createAgenticApi()
    try {
      const circular: Record<string, unknown> = { title: 'Bad', slides: [] }
      circular.self = circular
      const circularRes = await runtime.api.execute({ type: 'deck.set', payload: circular })
      expect(circularRes.ok).toBe(false)
      expect(circularRes.errors?.[0]?.code).toBe('InvalidDocument')

      const bigIntRes = await runtime.api.execute({
        type: 'deck.set',
        payload: { title: 'Bad', slides: [], extra: 1n },
      })
      expect(bigIntRes.ok).toBe(false)
      expect(bigIntRes.errors?.[0]?.code).toBe('InvalidDocument')

      // toJSON() on nested value is honored just like JSON.parse(JSON.stringify(...)).
      const toJsonRes = await runtime.api.execute({
        type: 'deck.set',
        payload: {
          title: { toJSON: () => 'From toJSON' },
          slides: [makeSlide('tojson_s1', 'Hello')],
        },
      })
      expect(toJsonRes.ok).toBe(true)
      expect(useSlidesStore.getState().title).toBe('From toJSON')

      // Non-finite numbers (NaN / Infinity) normalize to null and are rejected by geometry validators.
      const nanSlide = makeSlide('nan_s1', 'Hello')
      nanSlide.elements[0].left = Number.NaN
      const nanRes = await runtime.api.execute({
        type: 'deck.set',
        payload: {
          title: 'Bad Geometry',
          slides: [nanSlide],
        },
      })
      expect(nanRes.ok).toBe(false)
    } finally {
      runtime.stop()
    }
  })

  it('Blocker 2: updateSlide background change succeeds on immer draft without DataCloneError and retints default text ink', () => {
    expect(() => {
      useSlidesStore.getState().updateSlide({
        background: { type: 'solid', color: '#111111' },
      })
    }).not.toThrow()

    const updatedSlide = useSlidesStore.getState().slides[0]
    expect(updatedSlide.background).toEqual({ type: 'solid', color: '#111111' })
    const textEl = updatedSlide.elements[0] as PPTTextElement
    expect(textEl.defaultColor).not.toBe('#222222')
  })

  it('Remaining Blocker #1: deck.set applies synchronously for non-LaTeX decks so deck.get, slide lookup, and onChange see it in the same tick', () => {
    const runtime = createAgenticApi()
    const emittedTitles: string[] = []
    const watcher = createDocumentChangeWatcher(
      useSlidesStore,
      doc => emittedTitles.push(doc.title),
      400,
    )
    try {
      // Mirrors controller.setDocument(): fire deck.set without awaiting, then immediately read & emit.
      void runtime.api.deck.set({
        title: 'Sync Deck',
        slides: [makeSlide('sync_1', 'First'), makeSlide('sync_2', 'Second')],
      }, { source: 'host' })
      watcher.emit()

      const immediate = runtime.api.deck.get()
      expect(immediate.title).toBe('Sync Deck')
      expect(immediate.slides.map(s => s.id)).toEqual(['sync_1', 'sync_2'])
      expect(useSlidesStore.getState().slides.findIndex(s => s.id === 'sync_2')).toBe(1)

      // Synchronous flush in the same tick (before any microtask) must emit the newly set deck.
      watcher.flush()
      expect(emittedTitles).toEqual(['Sync Deck'])
    } finally {
      watcher.destroy()
      runtime.stop()
    }
  })

  it('Remaining Blocker #5: slides.insertFromTemplate preloads hfmath on a cold module when template slide has unpathed LaTeX', async () => {
    expect(getCachedHfmath()).toBeNull()
    registerTemplateLoaders({
      math_tpl: async () => ({
        title: 'Math Template',
        width: 1000,
        height: 562.5,
        theme: { themeColors: ['#111111'], fontColor: '#111111', fontName: 'Inter', backgroundColor: '#ffffff' },
        slides: [{
          id: 'tpl_s1',
          type: 'content',
          elements: [{
            type: 'latex',
            id: 'tpl_ltx',
            left: 40,
            top: 40,
            width: 200,
            height: 80,
            rotate: 0,
            latex: '\\frac{a}{b}',
            path: '',
            color: '#000000',
            strokeWidth: 2,
            viewBox: [200, 80],
            fixedRatio: true,
          }],
        }],
      }),
    })
    const prevWindow = (globalThis as Record<string, unknown>).window
    if (prevWindow === undefined) {
      ;(globalThis as Record<string, unknown>).window = {}
    }
    const runtime = createAgenticApi()
    try {
      const res = await runtime.api.slides.insertFromTemplate({
        templateId: 'math_tpl',
        slug: 'content_1',
      })
      expect(res.ok).toBe(true)
      expect(getCachedHfmath()).not.toBeNull()
      const insertedId = (res.data as { slideId?: string } | undefined)?.slideId
      const inserted = useSlidesStore.getState().slides.find(s => s.id === insertedId)
      const latexEl = inserted?.elements.find(el => el.type === 'latex')
      expect(latexEl?.type).toBe('latex')
      expect(latexEl && latexEl.type === 'latex' ? latexEl.path.length : 0).toBeGreaterThan(0)
    } finally {
      runtime.stop()
      registerTemplateLoaders(undefined)
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window
      }
    }
  })

  it('Blocker 3: payloadNeedsHfmath detects nested latex without path and slides.create preloads hfmath to derive path', async () => {
    expect(payloadNeedsHfmath({ slide: { elements: [{ type: 'latex', latex: 'x^2', path: '' }] } }, 'slides.create')).toBe(true)
    expect(payloadNeedsHfmath({ slide: { elements: [{ type: 'latex', latex: 'x^2', path: 'M0 0' }] } }, 'slides.create')).toBe(false)
    expect(payloadNeedsHfmath({ latex: 'x^2' }, 'latex.create')).toBe(true)
    expect(payloadNeedsHfmath({ latex: 'x^2', path: 'M0 0' }, 'latex.create')).toBe(false)
    expect(payloadNeedsHfmath({ slide: { elements: [{ type: 'text', content: '<p>Hi</p>' }] } }, 'slides.create')).toBe(false)

    const prevWindow = (globalThis as Record<string, unknown>).window
    if (prevWindow === undefined) {
      ;(globalThis as Record<string, unknown>).window = {}
    }
    const runtime = createAgenticApi()
    try {
      const res = await runtime.api.slides.create({
        slide: {
          id: 'latex_slide',
          elements: [{
            type: 'latex',
            id: 'ltx_1',
            left: 40,
            top: 40,
            width: 200,
            height: 80,
            rotate: 0,
            latex: 'x^2 + y^2',
            path: '',
            color: '#000000',
            strokeWidth: 2,
            viewBox: [200, 80],
            fixedRatio: true,
          }],
        },
      })
      expect(res.ok).toBe(true)
      const created = useSlidesStore.getState().slides.find(s => s.id === 'latex_slide')
      const latexEl = created?.elements.find(el => el.id === 'ltx_1')
      expect(latexEl?.type).toBe('latex')
      expect(latexEl && latexEl.type === 'latex' ? latexEl.path.length : 0).toBeGreaterThan(0)
    } finally {
      runtime.stop()
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window
      }
    }
  })

  it('Blocker 11: updateSlideElementGeometry updates geometry without clearing skeleton/aiRequestId and no-ops when unchanged', () => {
    useSlidesStore.getState().applyDocument({
      title: 'Skeleton Deck',
      slides: [{
        ...makeSlide('skel_1', 'Draft'),
        skeleton: true,
        aiRequestId: 'req_123',
      }],
      slideIndex: 0,
    })

    useSlidesStore.getState().updateSlideElementGeometry(
      'skel_1',
      new Map([['el_skel_1', { height: 240 }]]),
    )
    const afterUpdate = useSlidesStore.getState().slides[0]
    expect(afterUpdate.skeleton).toBe(true)
    expect(afterUpdate.aiRequestId).toBe('req_123')
    expect(afterUpdate.elements[0].height).toBe(240)
    expect(afterUpdate.elements[0].width).toBe(300)

    // Identical geometry must not publish a store update.
    let notifications = 0
    const unsub = useSlidesStore.subscribe(() => { notifications++ })
    try {
      useSlidesStore.getState().updateSlideElementGeometry(
        'skel_1',
        new Map([['el_skel_1', { height: 240 }]]),
      )
    } finally {
      unsub()
    }
    expect(notifications).toBe(0)
  })

  it('H2: updateSlideIndex drains commit queue when editingElementId is active even with zero live ProseMirror editors', () => {
    let drained = 0
    const unregister = registerCommitFlusher(() => {
      drained++
      useMainStore.getState().setEditingElementId('')
    })
    try {
      useMainStore.getState().setEditingElementId('table_cell_1')
      useSlidesStore.getState().updateSlideIndex(1)
      expect(drained).toBe(1)
      expect(useMainStore.getState().editingElementId).toBe('')
    } finally {
      unregister()
      useMainStore.getState().setEditingElementId('')
    }
  })
})
