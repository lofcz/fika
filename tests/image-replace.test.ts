import { beforeEach, describe, expect, it, rs } from '@rstest/core'

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
import { setFikaMediaConfig } from '@/configs/mediaUpload'
import { useSlidesStore } from '@/store/slides'
import { useSnapshotStore } from '@/store/snapshot'
import {
  buildManualImageReplacePatch,
  clearManualImageReplacementGuard,
  isManualImageReplacementProtected,
  recordManualImageReplacement,
} from '@/utils/imageReplace'
import { getAcceptAttribute, maxSizeLabel, validateMediaFile } from '@/utils/mediaFile'
import enEditor from '@/i18n/en/editor'
import csEditor from '@/i18n/cs/editor'
import skEditor from '@/i18n/sk/editor'
import plEditor from '@/i18n/pl/editor'
import type { PPTImageElement, Slide } from '@/types/slides'

const USER_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGPQL0yHIwZkDgBpMgg5zNuQeQAAAABJRU5ErkJggg=='
const STALE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function seedDeck(slides: Slide[]) {
  useSlidesStore.getState().setSlides(slides)
  useSlidesStore.getState().updateSlideIndex(0)
  useSnapshotStore.setState({ snapshotCursor: -1, snapshotLength: 0 })
}

function makeDecoratedImage(overrides?: Partial<PPTImageElement>): PPTImageElement {
  return {
    id: 'img_hero',
    type: 'image',
    left: 120,
    top: 80,
    width: 400,
    height: 300,
    rotate: 12,
    fixedRatio: true,
    src: 'https://example.com/old.png',
    altText: 'Hero artwork',
    name: 'Hero image',
    radius: 14,
    flipH: true,
    colorMask: 'rgba(15, 23, 42, 0.15)',
    outline: { width: 2, color: '#2563eb', style: 'solid' },
    shadow: { h: 4, v: 6, blur: 12, color: 'rgba(0,0,0,0.2)' },
    filters: { contrast: '110%' },
    clip: { shape: 'roundRect', range: [[0, 0], [100, 100]] },
    link: { type: 'web', target: 'https://example.com/details' },
    ...overrides,
  }
}

describe('manual image replacement and stale async protection', () => {
  beforeEach(() => {
    clearManualImageReplacementGuard()
    setFikaMediaConfig(null)
    seedDeck([{ id: 'slide_1', elements: [makeDecoratedImage()] }])
  })

  it('preserves element identity, bounds, clip shape, and decorations while computing cover crop and clearing mediaState', () => {
    const failed = makeDecoratedImage({
      src: '',
      mediaState: { slotId: 'slot_1', status: 'error', fit: 'cover', error: 'Timed out' },
    })

    const { patch, removeProps } = buildManualImageReplacePatch(failed, USER_PNG, { width: 1600, height: 900 })
    expect(removeProps).toEqual(['mediaState'])
    expect(patch.src).toBe(USER_PNG)
    expect(patch.left).toBeUndefined()
    expect(patch.top).toBeUndefined()
    expect(patch.width).toBeUndefined()
    expect(patch.height).toBeUndefined()
    expect(patch.rotate).toBeUndefined()
    expect(patch.clip).toEqual({ shape: 'roundRect', range: [[12.5, 0], [87.5, 100]] })

    // Applying to store preserves every decoration and removes mediaState.
    const store = useSlidesStore.getState()
    store.setSlides([{ id: 'slide_1', elements: [failed] }])
    store.removeElementProps({ id: failed.id, slideId: 'slide_1', propName: removeProps })
    store.updateElement({ id: failed.id, slideId: 'slide_1', props: patch })
    const updated = useSlidesStore.getState().slides[0].elements[0] as PPTImageElement

    expect(updated.id).toBe('img_hero')
    expect(updated.left).toBe(120)
    expect(updated.top).toBe(80)
    expect(updated.width).toBe(400)
    expect(updated.height).toBe(300)
    expect(updated.rotate).toBe(12)
    expect(updated.radius).toBe(14)
    expect(updated.flipH).toBe(true)
    expect(updated.colorMask).toBe('rgba(15, 23, 42, 0.15)')
    expect(updated.outline).toEqual({ width: 2, color: '#2563eb', style: 'solid' })
    expect(updated.shadow).toEqual({ h: 4, v: 6, blur: 12, color: 'rgba(0,0,0,0.2)' })
    expect(updated.filters).toEqual({ contrast: '110%' })
    expect(updated.altText).toBe('Hero artwork')
    expect(updated.link).toEqual({ type: 'web', target: 'https://example.com/details' })
    expect(updated.mediaState).toBeUndefined()
  })

  it('preserves photoFrame metadata and contain fit when configured', () => {
    const containSlot = makeDecoratedImage({
      left: 100,
      top: 100,
      width: 400,
      height: 400,
      clip: undefined,
      src: '',
      mediaState: { slotId: 'slot_diag', status: 'pending', fit: 'contain' },
    })
    const containResult = buildManualImageReplacePatch(containSlot, USER_PNG, { width: 800, height: 400 })
    expect(containResult.removeProps).toContain('mediaState')
    expect(containResult.patch).toMatchObject({ src: USER_PNG, left: 100, top: 200, width: 400, height: 200 })

    const photoFrameEl: PPTImageElement = {
      id: 'pf_1',
      type: 'image',
      left: 50,
      top: 50,
      width: 300,
      height: 300,
      rotate: 0,
      fixedRatio: false,
      src: 'data:image/svg+xml,<svg/>',
      clip: { shape: 'ellipse', range: [[0, 0], [100, 100]] },
      photoFrame: { layout: 'ellipse', cell: 0, gutter: 12, empty: true },
    }
    const pfResult = buildManualImageReplacePatch(photoFrameEl, USER_PNG, { width: 600, height: 300 })
    expect(pfResult.patch.photoFrame).toEqual({
      layout: 'ellipse',
      cell: 0,
      gutter: 12,
      empty: false,
      sourceWidth: 600,
      sourceHeight: 300,
    })
    expect(pfResult.patch.clip).toEqual({ shape: 'ellipse', range: [[25, 0], [75, 100]] })
  })

  it('protects manual replacement from late generation/retry updates and releases/re-engages across undo/redo', async () => {
    const runtime = createAgenticApi()
    const pendingEl = makeDecoratedImage({
      src: '',
      mediaState: { slotId: 'slot_async', status: 'pending', fit: 'cover', label: 'Generating…' },
    })
    seedDeck([{ id: 'slide_1', elements: [pendingEl] }])
    await useSnapshotStore.getState().initSnapshotDatabase()

    // Perform manual replacement and snapshot for undo/redo.
    const { patch, removeProps } = buildManualImageReplacePatch(pendingEl, USER_PNG, { width: 800, height: 600 })
    const store = useSlidesStore.getState()
    store.removeElementProps({ id: pendingEl.id, slideId: 'slide_1', propName: removeProps })
    recordManualImageReplacement(pendingEl)
    store.updateElement({ id: pendingEl.id, slideId: 'slide_1', props: patch })
    await useSnapshotStore.getState().addSnapshot()

    const replaced = useSlidesStore.getState().slides[0].elements[0] as PPTImageElement
    expect(replaced.src).toBe(USER_PNG)
    expect(replaced.mediaState).toBeUndefined()
    expect(isManualImageReplacementProtected(replaced, { slotId: 'slot_async' })).toBe(true)

    // Late async source resolution by slotId, by elementId+slotId, or by elementId alone must NO-OP.
    const lateBySlot = await runtime.api.execute<PPTImageElement>({
      type: 'media.setImageSource',
      payload: { slotId: 'slot_async', asset: { src: STALE_PNG, width: 100, height: 100 }, onlyIfPending: true },
    })
    expect(lateBySlot.ok).toBe(true)
    expect(lateBySlot.changed).toBe(false)
    expect(lateBySlot.data?.src).toBe(USER_PNG)

    const lateByElement = await runtime.api.execute<PPTImageElement>({
      type: 'media.setImageSource',
      payload: { elementId: 'img_hero', asset: STALE_PNG, onlyIfPending: true },
    })
    expect(lateByElement.ok).toBe(true)
    expect(lateByElement.changed).toBe(false)
    expect(lateByElement.data?.src).toBe(USER_PNG)

    // Late async error/pending retry state updates must NO-OP.
    const lateError = await runtime.api.media.setImageState(
      { slotId: 'slot_async' },
      { slotId: 'slot_async', status: 'error', error: 'Final retry failed' },
    )
    expect(lateError.ok).toBe(true)
    expect(lateError.changed).toBe(false)
    expect(lateError.data?.src).toBe(USER_PNG)
    expect(lateError.data?.mediaState).toBeUndefined()

    const latePendingById = await runtime.api.media.setImageState(
      'img_hero',
      { slotId: 'slot_async', status: 'pending' },
    )
    expect(latePendingById.ok).toBe(true)
    expect(latePendingById.changed).toBe(false)
    expect(latePendingById.data?.mediaState).toBeUndefined()

    // Round-trip serialization preserves manual image and cleared mediaState.
    const persisted = JSON.parse(JSON.stringify(runtime.api.deck.get()))
    await runtime.api.deck.set(persisted)
    const afterReload = runtime.api.slides.get('slide_1')?.elements[0] as PPTImageElement
    expect(afterReload.src).toBe(USER_PNG)
    expect(afterReload.mediaState).toBeUndefined()

    // Undo restores the original pending slot; guard yields because src reverted.
    seedDeck([{ id: 'slide_1', elements: [pendingEl] }])
    await useSnapshotStore.getState().initSnapshotDatabase()
    store.removeElementProps({ id: pendingEl.id, slideId: 'slide_1', propName: removeProps })
    recordManualImageReplacement(pendingEl)
    store.updateElement({ id: pendingEl.id, slideId: 'slide_1', props: patch })
    await useSnapshotStore.getState().addSnapshot()

    await useSnapshotStore.getState().unDo()
    const undone = useSlidesStore.getState().slides[0].elements[0] as PPTImageElement
    expect(undone.src).toBe('')
    expect(undone.mediaState).toMatchObject({ slotId: 'slot_async', status: 'pending' })
    expect(isManualImageReplacementProtected(undone, { slotId: 'slot_async' })).toBe(false)

    // Redo restores the manual replacement and re-engages protection.
    await useSnapshotStore.getState().reDo()
    const redone = useSlidesStore.getState().slides[0].elements[0] as PPTImageElement
    expect(redone.src).toBe(USER_PNG)
    expect(redone.mediaState).toBeUndefined()
    expect(isManualImageReplacementProtected(redone, { slotId: 'slot_async' })).toBe(true)

    const chosen = await runtime.api.execute<PPTImageElement>({
      type: 'media.setImageSource',
      payload: { elementId: redone.id, asset: STALE_PNG },
    })
    expect(chosen.ok).toBe(true)
    expect(chosen.changed).toBe(true)
    expect(chosen.data?.src).toBe(STALE_PNG)

    runtime.stop()
  })

  it('enforces image-only constraints while inheriting host upload limits', () => {
    setFikaMediaConfig({
      constraints: {
        maxFileSize: { image: 2 * 1024 * 1024, video: 100 * 1024 * 1024 },
        kinds: ['image', 'video', 'audio'],
        mimeTypes: ['image/png', 'video/mp4'],
      },
    })

    const imageOverrides = { kinds: ['image' as const], maxFiles: 1 }
    expect(getAcceptAttribute(imageOverrides)).toBe('image/png')
    expect(maxSizeLabel(imageOverrides)).toBe('2.0 MB')

    const validPng = new File([new Uint8Array(64)], 'ok.png', { type: 'image/png' })
    const wrongKind = new File([new Uint8Array(64)], 'clip.mp4', { type: 'video/mp4' })
    const wrongMime = new File([new Uint8Array(64)], 'photo.jpg', { type: 'image/jpeg' })
    const tooLarge = new File([new Uint8Array(3 * 1024 * 1024)], 'huge.png', { type: 'image/png' })

    expect(validateMediaFile(validPng, imageOverrides)).toBeNull()
    expect(validateMediaFile(wrongKind, imageOverrides)?.reason).toBe('kind')
    expect(validateMediaFile(wrongMime, imageOverrides)?.reason).toBe('type')
    expect(validateMediaFile(tooLarge, imageOverrides)?.reason).toBe('size')
  })

  it('provides localized replacement strings in en, cs, sk, and pl', () => {
    const locales = [
      { code: 'en', data: enEditor },
      { code: 'cs', data: csEditor },
      { code: 'sk', data: skEditor },
      { code: 'pl', data: plEditor },
    ]
    const requiredPickerKeys = [
      'replaceTitle',
      'replaceExplainer',
      'replaceDropTitle',
      'replaceDropHere',
      'replaceChooseAnother',
      'replaceConstraintsHint',
      'replaceAction',
      'dropzoneLabel',
      'errorDecode',
      'errorImageOnly',
      'errorSingleOnly',
    ] as const

    for (const { code, data } of locales) {
      const picker = data.canvasTool.mediaPicker as Record<string, string>
      for (const key of requiredPickerKeys) {
        expect(typeof picker[key], `${code}.${key}`).toBe('string')
        expect(picker[key].trim().length, `${code}.${key} non-empty`).toBeGreaterThan(0)
      }
      expect(typeof data.mediaSlot.doubleClickToReplace, `${code}.doubleClickToReplace`).toBe('string')
      expect(data.mediaSlot.doubleClickToReplace.trim().length).toBeGreaterThan(0)
    }

    expect(csEditor.canvasTool.mediaPicker.replaceTitle).toBe('Nahradit obrázek')
    expect(skEditor.canvasTool.mediaPicker.replaceTitle).toBe('Nahradiť obrázok')
    expect(plEditor.canvasTool.mediaPicker.replaceTitle).toBe('Zamień obraz')
    expect(enEditor.canvasTool.mediaPicker.replaceTitle).toBe('Replace image')
  })
})
