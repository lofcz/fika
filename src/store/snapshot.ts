import { create } from 'zustand'
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import { db, type Snapshot } from '@/utils/database'
import type { Slide, SlideTemplate, SlideTheme } from '@/types/slides'
import { useSlidesStore } from './slides'
import { useMainStore } from './main'

enablePatches()

const SNAPSHOT_LIMIT = 20

let cursorSlides: Slide[] | null = null

function diffSlides(prev: Slide[], next: Slide[]): [Patch[], Patch[]] {
  const [, patches, inversePatches] = produceWithPatches(prev, draft => {
    draft.length = next.length
    for (let i = 0; i < next.length; i++) {
      if (!Object.is(draft[i], next[i])) draft[i] = next[i]
    }
  })
  return [patches ?? [], inversePatches ?? []]
}

function materializeSlides(snapshots: Snapshot[], cursor: number): Slide[] {
  const baseline = snapshots[0]?.slides
  if (!baseline) return []
  let slides = baseline
  for (let i = 1; i <= cursor; i++) {
    const patches = snapshots[i]?.patches
    if (patches?.length) slides = applyPatches(slides, patches)
  }
  return slides
}

function restoreSlides(slides: Slide[], index: number, extras?: {
  title?: string
  theme?: SlideTheme
  viewportSize?: number
  viewportRatio?: number
  templates?: SlideTemplate[]
}) {
  const slideIndex = index > slides.length - 1 ? slides.length - 1 : index
  const slidesStore = useSlidesStore.getState()
  slidesStore.setSlides(slides, extras?.theme, { clone: false })
  slidesStore.updateSlideIndex(slideIndex)
  if (extras?.title !== undefined) slidesStore.setTitle(extras.title)
  if (extras?.viewportSize !== undefined) slidesStore.setViewportSize(extras.viewportSize)
  if (extras?.viewportRatio !== undefined) slidesStore.setViewportRatio(extras.viewportRatio)
  if (extras?.templates) slidesStore.setTemplates(extras.templates)
  cursorSlides = slides
  useMainStore.getState().setActiveElementIdList([])
}

export interface SnapshotState {
  snapshotCursor: number
  snapshotLength: number
}

export interface SnapshotActions {
  setSnapshotCursor: (cursor: number) => void
  setSnapshotLength: (length: number) => void
  initSnapshotDatabase: () => Promise<void>
  addSnapshot: () => Promise<void>
  unDo: () => Promise<void>
  reDo: () => Promise<void>
}

export type SnapshotStore = SnapshotState & SnapshotActions

export const selectCanUndo = (state: SnapshotState) => state.snapshotCursor > 0
export const selectCanRedo = (state: SnapshotState) => state.snapshotCursor < state.snapshotLength - 1

export const useSnapshotStore = create<SnapshotStore>()((set, get) => ({
  snapshotCursor: -1,
  snapshotLength: 0,

  setSnapshotCursor(cursor) {
    set(state => state.snapshotCursor === cursor ? state : { snapshotCursor: cursor })
  },
  setSnapshotLength(length) {
    set(state => state.snapshotLength === length ? state : { snapshotLength: length })
  },

  async initSnapshotDatabase() {
    const slidesStore = useSlidesStore.getState()
    cursorSlides = slidesStore.slides
    await db.snapshots.clear()
    await db.snapshots.add({
      index: slidesStore.slideIndex,
      title: slidesStore.title,
      theme: structuredClone(slidesStore.theme),
      viewportSize: slidesStore.viewportSize,
      viewportRatio: slidesStore.viewportRatio,
      templates: structuredClone(slidesStore.templates),
      slides: structuredClone(slidesStore.slides),
    })
    set(state => (
      state.snapshotCursor === 0 && state.snapshotLength === 1
        ? state
        : { snapshotCursor: 0, snapshotLength: 1 }
    ))
  },

  async addSnapshot() {
    const slidesStore = useSlidesStore.getState()
    const nextSlides = slidesStore.slides
    const slideIndex = slidesStore.slideIndex
    const cursor = get().snapshotCursor
    const allKeys = await db.snapshots.orderBy('id').primaryKeys() as number[]

    const redoKeys = cursor >= 0 && cursor < allKeys.length - 1
      ? allKeys.slice(cursor + 1)
      : []
    const keptOldKeys = cursor >= 0 ? allKeys.slice(0, cursor + 1) : []

    const title = slidesStore.title
    const theme = structuredClone(slidesStore.theme)
    const viewportSize = slidesStore.viewportSize
    const viewportRatio = slidesStore.viewportRatio
    const templates = structuredClone(slidesStore.templates)
    let entry: Omit<Snapshot, 'id'>
    if (!cursorSlides || keptOldKeys.length === 0) {
      entry = { index: slideIndex, title, theme, viewportSize, viewportRatio, templates, slides: structuredClone(nextSlides) }
    }
    else {
      const [patches, inversePatches] = diffSlides(cursorSlides, nextSlides)
      entry = { index: slideIndex, title, theme, viewportSize, viewportRatio, templates, patches, inversePatches }
    }

    await db.transaction('rw', db.snapshots, async () => {
      if (redoKeys.length) await db.snapshots.bulkDelete(redoKeys)

      if (keptOldKeys.length >= 1) {
        await db.snapshots.update(keptOldKeys[keptOldKeys.length - 1], { index: slideIndex })
      }

      await db.snapshots.add(entry)

      if (keptOldKeys.length + 1 > SNAPSHOT_LIMIT) {
        const oldestKey = keptOldKeys[0]
        const nextKey = keptOldKeys[1]
        const oldest = await db.snapshots.get(oldestKey)
        const next = await db.snapshots.get(nextKey)
        if (oldest?.slides && next) {
          const promoted = next.patches?.length
            ? applyPatches(oldest.slides, next.patches)
            : oldest.slides
          delete next.patches
          delete next.inversePatches
          next.slides = structuredClone(promoted)
          await db.snapshots.put(next)
        }
        await db.snapshots.delete(oldestKey)
      }
    })

    cursorSlides = nextSlides
    const snapshotLength = Math.min(keptOldKeys.length + 1, SNAPSHOT_LIMIT)
    const snapshotCursor = snapshotLength - 1
    set(state => (
      state.snapshotCursor === snapshotCursor && state.snapshotLength === snapshotLength
        ? state
        : { snapshotCursor, snapshotLength }
    ))
  },

  async unDo() {
    if (get().snapshotCursor <= 0) return

    const snapshotCursor = get().snapshotCursor - 1
    const snapshots: Snapshot[] = await db.snapshots.orderBy('id').toArray()
    const leaving = snapshots[get().snapshotCursor]
    const arriving = snapshots[snapshotCursor]
    if (!arriving) return

    const base = cursorSlides ?? materializeSlides(snapshots, get().snapshotCursor)
    const slides = leaving?.inversePatches
      ? applyPatches(base, leaving.inversePatches)
      : materializeSlides(snapshots, snapshotCursor)

    restoreSlides(slides, arriving.index, arriving)
    get().setSnapshotCursor(snapshotCursor)
  },

  async reDo() {
    if (get().snapshotCursor >= get().snapshotLength - 1) return

    const snapshotCursor = get().snapshotCursor + 1
    const snapshots: Snapshot[] = await db.snapshots.orderBy('id').toArray()
    const arriving = snapshots[snapshotCursor]
    if (!arriving) return

    const base = cursorSlides ?? materializeSlides(snapshots, get().snapshotCursor)
    const slides = arriving.patches
      ? applyPatches(base, arriving.patches)
      : materializeSlides(snapshots, snapshotCursor)

    restoreSlides(slides, arriving.index, arriving)
    get().setSnapshotCursor(snapshotCursor)
  },
}))
