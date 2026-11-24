import { beforeEach, describe, expect, it, rs } from '@rstest/core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

import { createAgenticApi } from '@/embed/agentic/createAgenticApi'
import { assertElementCreateInput, assertImageMediaState } from '@/embed/agentic/validators'
import { useSlidesStore } from '@/store/slides'
import { useSnapshotStore } from '@/store/snapshot'
import { collectSlidePreviewSrcs } from '@/utils/imageBitmapCache'
import { paintedSlideAuthoredKey, paintedSlidePaintKey } from '@/views/components/ThumbnailSlide/paintedSlide'
import type { PPTImageElement, Slide } from '@/types/slides'

const SAMPLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function seedDeck(slides: Slide[]) {
  useSlidesStore.getState().setSlides(slides)
  useSlidesStore.getState().updateSlideIndex(0)
  useSnapshotStore.setState({ snapshotCursor: -1, snapshotLength: 0 })
}

describe('native pending image slots', () => {
  beforeEach(() => {
    seedDeck([
      {
        id: 'slide_a',
        elements: [
          {
            id: 'title_a',
            type: 'text',
            left: 60,
            top: 40,
            width: 400,
            height: 60,
            rotate: 0,
            content: '<p>Card A</p>',
            defaultFontName: 'Inter',
            defaultColor: '#111111',
          },
        ],
      },
      {
        id: 'slide_b',
        elements: [
          {
            id: 'title_b',
            type: 'text',
            left: 60,
            top: 40,
            width: 400,
            height: 60,
            rotate: 0,
            content: '<p>Card B</p>',
            defaultFontName: 'Inter',
            defaultColor: '#111111',
          },
        ],
      },
    ])
  })

  it('validates mediaState and allows empty src only for pending/error slots', () => {
    expect(() => assertElementCreateInput({
      type: 'image',
      src: '',
      width: 400,
      height: 300,
      mediaState: { status: 'pending', slotId: 'slot_hero', aspectRatio: 4 / 3, fit: 'cover', label: 'Generating…' },
    })).not.toThrow()

    expect(() => assertElementCreateInput({
      type: 'image',
      src: '',
      width: 400,
      height: 300,
      mediaState: { status: 'error', slotId: 'slot_err', error: 'Timed out' },
    })).not.toThrow()

    expect(() => assertElementCreateInput({
      type: 'image',
      src: '',
      width: 400,
      height: 300,
    })).toThrow(/src is required/)

    expect(() => assertElementCreateInput({
      type: 'image',
      src: '',
      width: 400,
      height: 300,
      mediaState: { status: 'ready' },
    })).toThrow(/src is required/)

    expect(() => assertImageMediaState({ status: 'bogus' })).toThrow(/pending, ready, error/)
    expect(() => assertImageMediaState({ status: 'pending', aspectRatio: -1 })).toThrow(/greater than 0/)
    expect(() => assertImageMediaState({ status: 'pending', fit: 'stretch' })).toThrow(/cover or contain/)
  })

  it('persists pending slots across serialization, resolves by slotId after slide reorder while preserving edits and aspect ratio', async () => {
    const runtime = createAgenticApi()

    // Create a pending image slot on Card A while Card B is immediately editable.
    const created = await runtime.api.elements.create({
      slideId: 'slide_a',
      element: {
        id: 'img_a_hero',
        type: 'image',
        left: 520,
        top: 80,
        width: 400,
        height: 300,
        rotate: 0,
        fixedRatio: true,
        src: '',
        clip: { shape: 'roundRect', range: [[0, 0], [100, 100]] },
        mediaState: {
          slotId: 'slot_a_hero',
          status: 'pending',
          aspectRatio: 4 / 3,
          fit: 'cover',
          label: 'Generating illustration…',
        },
      },
      select: false,
    })
    expect(created.ok).toBe(true)

    // Edit Card B and move Card A to the end while Card A's image is still pending.
    await runtime.api.text.setContent('title_b', '<p>Card B edited while A pending</p>', { slideId: 'slide_b' })
    await runtime.api.elements.update('img_a_hero', { left: 540, top: 90 }, { slideId: 'slide_a' })
    await runtime.api.slides.move('slide_a', 2)

    // Serialize + reload deck to verify slotId and pending mediaState survive reload verbatim.
    const persisted = JSON.parse(JSON.stringify(runtime.api.deck.get()))
    await runtime.api.deck.set(persisted)

    // Resolve Card A's delayed image by `slotId` (no slideId needed, survives reorder!) with 16:9 natural size -> centered cover crop.
    const stale = await runtime.api.execute<PPTImageElement>({
      type: 'media.setImageSource',
      payload: {
        elementId: 'img_a_hero', slotId: 'previous_request', slideId: 'slide_a',
        src: 'https://example.com/stale.png', onlyIfPending: true,
      },
    })
    expect(stale.ok).toBe(false)
    expect(runtime.api.slides.get('slide_a')?.elements.find(el => el.id === 'img_a_hero')).toMatchObject({
      mediaState: { slotId: 'slot_a_hero', status: 'pending' },
    })

    const resolved = await runtime.api.execute<PPTImageElement>({
      type: 'media.setImageSource',
      payload: {
        slotId: 'slot_a_hero',
        asset: { src: SAMPLE_DATA_URL, width: 1600, height: 900, sourceUrl: 'https://example.com/photo' },
        onlyIfPending: true,
      },
    })
    expect(resolved.ok).toBe(true)
    expect(resolved.changed).toBe(true)
    expect(resolved.data?.src).toBe(SAMPLE_DATA_URL)
    expect(resolved.data?.mediaState).toBeUndefined()
    // User's manual move (540, 90) and clip shape ('roundRect') are preserved!
    expect(resolved.data?.left).toBe(540)
    expect(resolved.data?.top).toBe(90)
    expect(resolved.data?.width).toBe(400)
    expect(resolved.data?.height).toBe(300)
    expect(resolved.data?.clip).toEqual({ shape: 'roundRect', range: [[12.5, 0], [87.5, 100]] })
    expect(resolved.data?.link).toEqual({ type: 'web', target: 'https://example.com/photo' })

    // Card B's edit remained untouched.
    const slideB = runtime.api.slides.get('slide_b')
    expect(slideB?.elements[0].type === 'text' && slideB.elements[0].content).toContain('Card B edited while A pending')

    // Late duplicate arrival with onlyIfPending:true does NOT overwrite a resolved or user-replaced image.
    const lateResult = await runtime.api.execute<PPTImageElement>({
      type: 'media.setImageSource',
      payload: {
        elementId: 'img_a_hero',
        src: 'https://example.com/late-overwrite.png',
        onlyIfPending: true,
      },
    })
    expect(lateResult.ok).toBe(true)
    expect(lateResult.changed).toBe(false)
    expect(lateResult.data?.src).toBe(SAMPLE_DATA_URL)

    runtime.stop()
  })

  it('supports aspect-preserving contain fit, isolated error/retry state, and safe late resolution after deletion', async () => {
    const runtime = createAgenticApi()

    await runtime.api.elements.create({
      slideId: 'slide_a',
      element: {
        id: 'img_diagram',
        type: 'image',
        left: 100,
        top: 100,
        width: 400,
        height: 400,
        rotate: 0,
        fixedRatio: true,
        src: '',
        mediaState: { slotId: 'slot_diag', status: 'pending', fit: 'contain' },
      },
    })

    // Transition only this slot to error.
    const failed = await runtime.api.media.setImageState({ slotId: 'slot_diag' }, {
      slotId: 'slot_diag',
      status: 'error',
      fit: 'contain',
      error: 'Provider timeout',
    })
    expect(failed.ok).toBe(true)
    expect(failed.data?.mediaState).toMatchObject({ status: 'error', error: 'Provider timeout' })

    // Retry back to pending, then resolve with a wide 800x400 diagram -> centered 400x200 box inside 400x400 frame.
    await runtime.api.media.setImageState('img_diagram', { slotId: 'slot_diag', status: 'pending', fit: 'contain' })
    const resolved = await runtime.api.media.setImageSource(
      'img_diagram',
      SAMPLE_DATA_URL,
      undefined,
      { fit: 'contain', natural: { width: 800, height: 400 } },
    )
    expect(resolved.ok).toBe(true)
    expect(resolved.data).toMatchObject({ left: 100, top: 200, width: 400, height: 200 })
    expect(resolved.data?.mediaState).toBeUndefined()

    // Deleting the slide before a late image arrives fails gracefully with recoverable ElementNotFound without corrupting the deck.
    await runtime.api.slides.delete('slide_a')
    const missing = await runtime.api.execute({
      type: 'media.setImageSource',
      payload: { slotId: 'slot_diag', src: SAMPLE_DATA_URL },
    })
    expect(missing.ok).toBe(false)
    expect(missing.errors?.[0]).toMatchObject({ code: 'ElementNotFound', recoverable: true })
    expect(runtime.api.slides.list().map(s => s.id)).toEqual(['slide_b'])

    runtime.stop()
  })

  it('skips pending/error slots in preview/PDF source collection and invalidates thumbnail paint keys on status change', () => {
    const pendingSlide: Slide = {
      id: 's_media',
      elements: [
        {
          id: 'img_1',
          type: 'image',
          left: 0,
          top: 0,
          width: 300,
          height: 200,
          rotate: 0,
          fixedRatio: true,
          src: '',
          mediaState: { status: 'pending', slotId: 'slot_1' },
        },
        {
          id: 'img_2',
          type: 'image',
          left: 320,
          top: 0,
          width: 300,
          height: 200,
          rotate: 0,
          fixedRatio: true,
          src: 'https://example.com/ready.png',
        },
      ],
    }
    expect(collectSlidePreviewSrcs(pendingSlide)).toEqual(['https://example.com/ready.png'])

    const erroredSlide: Slide = {
      ...pendingSlide,
      elements: [
        { ...(pendingSlide.elements[0] as PPTImageElement), mediaState: { status: 'error', slotId: 'slot_1', error: '404' } },
        pendingSlide.elements[1],
      ],
    }
    expect(collectSlidePreviewSrcs(erroredSlide)).toEqual(['https://example.com/ready.png'])
    expect(paintedSlideAuthoredKey(erroredSlide)).not.toBe(paintedSlideAuthoredKey(pendingSlide))
    expect(paintedSlidePaintKey(erroredSlide)).not.toBe(paintedSlidePaintKey(pendingSlide))
  })

  it('exposes the new gap anchor and pending image slot schemas in agentic-manifest.json', () => {
    const manifestPath = resolve('dist/embed/agentic-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const setImageSource = manifest.commands.find((c: { name: string }) => c.name === 'media.setImageSource')
    const setImageState = manifest.commands.find((c: { name: string }) => c.name === 'media.setImageState')
    const slidesCreate = manifest.commands.find((c: { name: string }) => c.name === 'slides.create')

    expect(setImageSource).toBeTruthy()
    expect(setImageState).toBeTruthy()
    expect(slidesCreate?.payload).toContain('anchor?: FikaSlideInsertAnchorInput')
    expect(manifest.modelTypes.PPTImageElement).toContain('mediaState?: ImageMediaState')
    expect(manifest.modelTypes.Slide).toContain('aiRequestId?: string')
    expect(manifest.modelTypes.ImageMediaState).toContain('status: ImageMediaStatus')
    expect(manifest.helperTypes.FikaSetImageSourcePayload).toContain('extends FikaSetImageSourceOptions')
    expect(manifest.helperTypes.FikaSetImageSourceOptions).toContain('onlyIfPending?: boolean')
    expect(manifest.helperTypes.FikaSetImageSourceOptions).toContain('slotId?: string')
    expect(manifest.helperTypes.FikaSetImageStatePayload).toContain('state: ImageMediaState | null')
  })
})
