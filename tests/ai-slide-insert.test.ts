import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core'

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
rs.mock('@/utils/database', () => {
  let nextId = 1
  const rows = new Map<number, Record<string, unknown>>()
  const snapshots = {
    clear: async () => { rows.clear(); nextId = 1 },
    add: async (entry: Record<string, unknown>) => { const id = nextId++; rows.set(id, { ...entry, id }); return id },
    get: async (id: number) => rows.get(id),
    put: async (entry: Record<string, unknown> & { id: number }) => { rows.set(entry.id, { ...entry }); return entry.id },
    update: async (id: number, patch: Record<string, unknown>) => { const prev = rows.get(id); if (prev) rows.set(id, { ...prev, ...patch }); return prev ? 1 : 0 },
    delete: async (id: number) => { rows.delete(id) },
    bulkDelete: async (ids: number[]) => { for (const id of ids) rows.delete(id) },
    orderBy: () => ({
      primaryKeys: async () => [...rows.keys()].sort((a, b) => a - b),
      toArray: async () => [...rows.keys()].sort((a, b) => a - b).map(id => rows.get(id)),
    }),
  }
  return {
    db: {
      snapshots,
      transaction: async (_mode: string, _table: unknown, fn: () => Promise<void>) => fn(),
    },
    deleteDiscardedDB: async () => {},
  }
})

import {
  buildSlideGapAnchor,
  emitFikaAiSlideInsertCancel,
  emitFikaAiSlideInsertRequest,
  isFikaAiSlideInsertEnabled,
  resolveSlideGapInsertIndex,
  setFikaAiSlideInsert,
  type FikaAiSlideInsertAnchor,
  type FikaAiSlideInsertCancelDetail,
} from '@/configs/aiSlideInsert'
import { createAgenticApi } from '@/embed/agentic/createAgenticApi'
import type { FikaBridgeEvent } from '@/embed/agentic/types'
import { useSlidesStore } from '@/store/slides'
import { useSnapshotStore } from '@/store/snapshot'

function resetDeck(slideIds: string[]) {
  useSlidesStore.getState().setSlides(
    slideIds.map(id => ({ id, elements: [], background: { type: 'solid', color: '#ffffff' } })),
  )
  useSlidesStore.getState().updateSlideIndex(0)
  useSnapshotStore.setState({ snapshotCursor: -1, snapshotLength: 0 })
}

describe('AI gap slide insertion contract and stable anchors', () => {
  beforeEach(() => {
    setFikaAiSlideInsert(null)
    resetDeck(['s1', 's2', 's3'])
  })

  afterEach(() => {
    setFikaAiSlideInsert(null)
  })

  it('builds stable anchors for before-first, middle, after-last, and empty deck gaps', () => {
    const slides = [{ id: 's1' }, { id: 's2' }, { id: 's3' }]
    expect(buildSlideGapAnchor(slides, 0, 's2', 'req_first')).toEqual({
      requestId: 'req_first',
      position: 'before-first',
      afterSlideId: null,
      beforeSlideId: 's1',
      insertIndex: 1,
      slideCount: 3,
      currentSlideId: 's2',
    })
    expect(buildSlideGapAnchor(slides, 1, 's1', 'req_mid')).toEqual({
      requestId: 'req_mid',
      position: 'between',
      afterSlideId: 's1',
      beforeSlideId: 's2',
      insertIndex: 2,
      slideCount: 3,
      currentSlideId: 's1',
    })
    expect(buildSlideGapAnchor(slides, 3, 's3', 'req_last')).toEqual({
      requestId: 'req_last',
      position: 'after-last',
      afterSlideId: 's3',
      beforeSlideId: null,
      insertIndex: 4,
      slideCount: 3,
      currentSlideId: 's3',
    })
    expect(buildSlideGapAnchor([], 0, null, 'req_empty')).toEqual({
      requestId: 'req_empty',
      position: 'before-first',
      afterSlideId: null,
      beforeSlideId: null,
      insertIndex: 1,
      slideCount: 0,
      currentSlideId: null,
    })
  })

  it('resolves live insertion indices across concurrent inserts, reorders, and neighbor deletions', () => {
    const midAnchor = buildSlideGapAnchor([{ id: 's1' }, { id: 's2' }, { id: 's3' }], 1)

    // Slide inserted before s1 shifts live index from 2 to 3 while preserving placement between s1 and s2.
    expect(resolveSlideGapInsertIndex([{ id: 's0' }, { id: 's1' }, { id: 's2' }, { id: 's3' }], midAnchor)).toBe(3)

    // Reordering s1 to the end still keeps placement right after s1.
    expect(resolveSlideGapInsertIndex([{ id: 's2' }, { id: 's3' }, { id: 's1' }], midAnchor)).toBe(4)

    // Deleting afterSlideId (s1) falls back cleanly to right before beforeSlideId (s2).
    expect(resolveSlideGapInsertIndex([{ id: 's0' }, { id: 's2' }, { id: 's3' }], midAnchor)).toBe(2)

    // Deleting both neighbors falls back to clamped fallbackIndex or position.
    expect(resolveSlideGapInsertIndex([{ id: 's3' }], { position: 'before-first', afterSlideId: null, beforeSlideId: 'gone' })).toBe(1)
    expect(resolveSlideGapInsertIndex([{ id: 's3' }], { position: 'after-last', afterSlideId: 'gone', beforeSlideId: null })).toBe(2)
    expect(resolveSlideGapInsertIndex([{ id: 's3' }], { position: 'between', afterSlideId: 'gone1', beforeSlideId: 'gone2', fallbackIndex: 1 })).toBe(1)
  })

  it('routes gap requests and cancellations through controller.subscribe and mount callbacks while respecting disabled state', () => {
    const runtime = createAgenticApi()
    const bridgeEvents: FikaBridgeEvent[] = []
    const callbackRequests: FikaAiSlideInsertAnchor[] = []
    const callbackCancels: FikaAiSlideInsertCancelDetail[] = []

    const unsub = runtime.api.subscribe(event => {
      if (event.type === 'aiSlideInsertRequested' || event.type === 'aiSlideInsertCancelled') {
        bridgeEvents.push(event)
      }
    })

    setFikaAiSlideInsert({
      enabled: true,
      onRequest: anchor => callbackRequests.push(anchor),
      onCancel: detail => callbackCancels.push(detail),
    })
    expect(isFikaAiSlideInsertEnabled({ enabled: true })).toBe(true)
    expect(isFikaAiSlideInsertEnabled({ enabled: false })).toBe(false)

    const anchor = buildSlideGapAnchor(runtime.api.slides.list(), 1, 's1', 'req_1')
    emitFikaAiSlideInsertRequest(anchor)
    expect(callbackRequests).toEqual([anchor])
    expect(bridgeEvents).toHaveLength(1)
    expect(bridgeEvents[0]).toMatchObject({ type: 'aiSlideInsertRequested', data: anchor })

    // Disabled config suppresses new AI requests.
    setFikaAiSlideInsert({
      enabled: true,
      disabled: true,
      onRequest: a => callbackRequests.push(a),
      onCancel: detail => callbackCancels.push(detail),
    })
    emitFikaAiSlideInsertRequest(buildSlideGapAnchor(runtime.api.slides.list(), 0, 's1', 'req_disabled'))
    expect(callbackRequests).toHaveLength(1)

    // Cancellation still fires even while new requests are disabled.
    emitFikaAiSlideInsertCancel({ requestId: 'req_1', slideId: 'slide_pending' })
    expect(callbackCancels).toEqual([{ requestId: 'req_1', slideId: 'slide_pending' }])
    expect(bridgeEvents[1]).toMatchObject({
      type: 'aiSlideInsertCancelled',
      data: { requestId: 'req_1', slideId: 'slide_pending' },
    })

    unsub()
    runtime.stop()
  })

  it('supports anchor-based async slide creation, multiple concurrent requests, cancellation, and clean single-step undo', async () => {
    const runtime = createAgenticApi()
    // Seed initial history baseline so undo works cleanly.
    await runtime.api.history.commit()

    const beforeFirstAnchor = buildSlideGapAnchor(runtime.api.slides.list(), 0, 's1', 'req_first')
    const afterLastAnchor = buildSlideGapAnchor(runtime.api.slides.list(), 3, 's1', 'req_last')

    // Insert skeleton placeholder at after-last without polluting undo history.
    const pendingRes = await runtime.api.slides.create({
      anchor: afterLastAnchor,
      slide: { id: 'ai_last', elements: [], skeleton: true, aiRequestId: afterLastAnchor.requestId },
      select: false,
    }, { commit: false, source: 'host' })
    expect(pendingRes.ok).toBe(true)
    expect(runtime.api.slides.list().map(s => s.id)).toEqual(['s1', 's2', 's3', 'ai_last'])
    expect(runtime.api.slides.get('ai_last')?.aiRequestId).toBe('req_last')

    // Concurrently, the user manually inserts a slide before s1, shifting indices.
    const manualRes = await runtime.api.slides.create({
      index: 1,
      slide: { id: 'manual_cover', elements: [] },
      select: false,
    }, { commit: true, source: 'ui' })
    expect(manualRes.ok).toBe(true)

    // First AI request resolves using its stable anchor (beforeSlideId: 's1') -> lands right before s1 (after manual_cover).
    expect(runtime.api.slides.resolveInsertIndex(beforeFirstAnchor)).toBe(2)
    const firstAiRes = await runtime.api.slides.create({
      anchor: beforeFirstAnchor,
      slide: {
        id: 'ai_before_s1',
        elements: [{
          id: 'el_ai_title',
          type: 'text',
          left: 60,
          top: 60,
          width: 400,
          height: 60,
          rotate: 0,
          content: '<p>Generated before s1</p>',
          defaultFontName: 'Inter',
          defaultColor: '#111111',
        }],
      },
      select: true,
    }, { commit: true, source: 'agent' })
    expect(firstAiRes.ok).toBe(true)
    expect(runtime.api.slides.list().map(s => s.id)).toEqual(['manual_cover', 'ai_before_s1', 's1', 's2', 's3', 'ai_last'])

    // Completing the pending skeleton slide clears both `skeleton` and `aiRequestId` in one undoable step.
    const finishRes = await runtime.api.slides.update('ai_last', {
      elements: [{
        id: 'el_ai_last',
        type: 'text',
        left: 60,
        top: 60,
        width: 400,
        height: 60,
        rotate: 0,
        content: '<p>Generated last</p>',
        defaultFontName: 'Inter',
        defaultColor: '#111111',
      }],
    }, { commit: true, source: 'agent' })
    expect(finishRes.ok).toBe(true)
    expect(finishRes.data?.skeleton).toBeUndefined()
    expect(finishRes.data?.aiRequestId).toBeUndefined()

    // Cancelling another pending placeholder inserted with commit:false leaves prior deck state intact.
    const midAnchor = buildSlideGapAnchor(runtime.api.slides.list(), 2, 's1', 'req_cancel')
    await runtime.api.slides.create({
      anchor: midAnchor,
      slide: { id: 'ai_cancelled', elements: [], skeleton: true, aiRequestId: 'req_cancel' },
      select: false,
    }, { commit: false, source: 'host' })
    expect(runtime.api.slides.list().some(s => s.id === 'ai_cancelled')).toBe(true)
    await runtime.api.slides.delete('ai_cancelled', { commit: false, source: 'host' })
    expect(runtime.api.slides.list().some(s => s.id === 'ai_cancelled')).toBe(false)

    // Undo reverts the last committed AI update cleanly.
    const undoRes = await runtime.api.history.undo()
    expect(undoRes.ok).toBe(true)
    expect(runtime.api.slides.get('ai_last')?.skeleton).toBe(true)

    runtime.stop()
  })

  it('supports anchor resolution on slides.insert as well', async () => {
    const runtime = createAgenticApi()
    const midAnchor = buildSlideGapAnchor(runtime.api.slides.list(), 1)
    const inserted = await runtime.api.slides.insert({
      anchor: midAnchor,
      slides: [{ id: 'donor', elements: [] }],
      select: false,
    })
    expect(inserted.ok).toBe(true)
    expect(runtime.api.slides.list().map(s => s.id)).toEqual(['s1', inserted.data!.slides[0].id, 's2', 's3'])
    runtime.stop()
  })

  it('keeps gap controls contextual on hover/focus-within, dashed, zero-layout-inflation, and hidden during drag', () => {
    const virtualizerSrc = readFileSync(resolve('src/views/Editor/Thumbnails/useThumbnailVirtualizer.ts'), 'utf8')
    const scssSrc = readFileSync(resolve('src/views/Editor/Thumbnails/index.module.scss'), 'utf8')
    const draggableSrc = readFileSync(resolve('src/components/Draggable.tsx'), 'utf8')

    // Gap controls must not add permanent vertical height per slide in the virtualizer.
    expect(virtualizerSrc).not.toContain('GAP_BAR_HEIGHT')
    // Dashed hover/focus-within overlay bar hidden by default and completely disabled while dragging.
    expect(scssSrc).toMatch(/\.gap-bar\s*\{[\s\S]*?position:\s*absolute/)
    expect(scssSrc).toMatch(/border-top:\s*1px\s+dashed/)
    expect(scssSrc).toMatch(/\.gap-actions\s*\{[\s\S]*?opacity:\s*0/)
    expect(scssSrc).toMatch(/&:hover\s+\.gap-actions,\s*&:focus-within\s+\.gap-actions\s*\{\s*opacity:\s*1/)
    expect(scssSrc).toMatch(/&\[data-dragging='true'\]\s*\{[\s\S]*?\.gap-bar[\s\S]*?opacity:\s*0[\s\S]*?pointer-events:\s*none/)
    expect(draggableSrc).toContain("data-dragging={activeId ? 'true' : undefined}")
  })
})
