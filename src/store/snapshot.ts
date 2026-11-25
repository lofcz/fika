import { create } from 'zustand'
import { deepEqual } from 'fast-equals'
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import { db, type Snapshot } from '@/utils/database'
import type { Slide, SlideTemplate, SlideTheme } from '@/types/slides'
import { useSlidesStore, type SlidesState } from './slides'
import { useMainStore } from './main'

enablePatches()

const SNAPSHOT_LIMIT = 20
const SNAPSHOT_FOLD_BATCH = 10
const SNAPSHOT_HIGH_WATER = SNAPSHOT_LIMIT + SNAPSHOT_FOLD_BATCH

interface CapturedSlideState {
  index: number
  title: string
  theme: SlideTheme
  viewportSize: number
  viewportRatio: number
  viewportWidthInches: number | undefined
  templates: SlideTemplate[]
  slides: Slide[]
}

let cursorSlides: Slide[] | null = null
let cursorMeta: Omit<CapturedSlideState, 'slides'> | null = null
let snapshotQueue: Promise<void> = Promise.resolve()
let flushPendingIdle: (() => void) | null = null

function captureSlidesState(slidesStore: SlidesState): CapturedSlideState {
  return {
    index: slidesStore.slideIndex,
    title: slidesStore.title,
    theme: slidesStore.theme,
    viewportSize: slidesStore.viewportSize,
    viewportRatio: slidesStore.viewportRatio,
    viewportWidthInches: slidesStore.viewportWidthInches,
    templates: slidesStore.templates,
    slides: slidesStore.slides,
  }
}

function sameSlideRefs(a: Slide[], b: Slide[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false
  }
  return true
}

function waitForIdle(): { promise: Promise<void>; flush: () => void } {
  let done = false
  let resolve!: () => void
  let idleId: number | null = null
  let timerId: ReturnType<typeof setTimeout> | null = null

  const finish = () => {
    if (done) return
    done = true
    if (idleId !== null && typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(idleId)
      idleId = null
    }
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
    if (flushPendingIdle === finish) flushPendingIdle = null
    resolve()
  }

  const promise = new Promise<void>(res => {
    resolve = res
    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(finish, { timeout: 500 })
    }
    else {
      timerId = setTimeout(finish, 0)
    }
  })

  flushPendingIdle = finish
  return { promise, flush: finish }
}

// IndexedDB calls yield between reads and writes. Keep the cursor and database
// in the same order, even when another save or undo arrives during a write.
function queueSnapshot(operation: () => Promise<void>, options?: { flushIdle?: boolean }): Promise<void> {
  if (options?.flushIdle !== false && flushPendingIdle) {
    flushPendingIdle()
  }
  const pending = snapshotQueue.then(operation)
  snapshotQueue = pending.catch(() => {})
  return pending
}

function diffSlides(prev: Slide[], next: Slide[]): [Patch[], Patch[]] {
  const [, patches, inversePatches] = produceWithPatches(prev, draft => {
    draft.length = next.length
    for (let i = 0; i < next.length; i++) {
      if (!Object.is(draft[i], next[i])) draft[i] = next[i]
    }
  })
  return [patches ?? [], inversePatches ?? []]
}

async function materializeSlidesByKeys(keys: number[], cursor: number): Promise<Slide[]> {
  const baseline = await db.snapshots.get(keys[0])
  if (!baseline?.slides) return []
  let slides = baseline.slides
  for (let i = 1; i <= cursor; i++) {
    const row = await db.snapshots.get(keys[i])
    if (row?.patches?.length) slides = applyPatches(slides, row.patches)
  }
  return slides
}

function restoreSlides(slides: Slide[], index: number, extras?: {
  title?: string
  theme?: SlideTheme
  viewportSize?: number
  viewportRatio?: number
  viewportWidthInches?: number
  templates?: SlideTemplate[]
}) {
  const slideIndex = index > slides.length - 1 ? slides.length - 1 : index
  const slidesStore = useSlidesStore.getState()
  slidesStore.applyDocument({
    slides,
    slideIndex,
    ...(extras?.title !== undefined ? { title: extras.title } : {}),
    ...(extras?.theme ? { theme: extras.theme } : {}),
    ...(extras?.viewportSize !== undefined ? { viewportSize: extras.viewportSize } : {}),
    ...(extras?.viewportRatio !== undefined ? { viewportRatio: extras.viewportRatio } : {}),
    viewportWidthInches: extras?.viewportWidthInches,
    hasViewportWidthInches: true,
    ...(extras?.templates ? { templates: extras.templates } : {}),
  }, { clone: false })
  const after = useSlidesStore.getState()
  cursorSlides = after.slides
  cursorMeta = {
    index: after.slideIndex,
    title: after.title,
    theme: after.theme,
    viewportSize: after.viewportSize,
    viewportRatio: after.viewportRatio,
    viewportWidthInches: after.viewportWidthInches,
    templates: after.templates,
  }
  useMainStore.getState().setActiveElementIdList([])
}

export interface SnapshotState {
  snapshotCursor: number
  snapshotLength: number
}

export interface SnapshotActions {
  setSnapshotCursor: (cursor: number) => void
  setSnapshotLength: (length: number) => void
  initSnapshotDatabase: (options?: { defer?: boolean }) => Promise<void>
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

  initSnapshotDatabase(options) {
    // Capture initial references synchronously before any deferred idle step so
    // an edit arriving before idle fires still gets the true initial baseline.
    const initial = captureSlidesState(useSlidesStore.getState())
    const writeInitial = async () => {
      cursorSlides = initial.slides
      cursorMeta = {
        index: initial.index,
        title: initial.title,
        theme: initial.theme,
        viewportSize: initial.viewportSize,
        viewportRatio: initial.viewportRatio,
        viewportWidthInches: initial.viewportWidthInches,
        templates: initial.templates,
      }
      await db.snapshots.clear()
      await db.snapshots.add({
        index: initial.index,
        title: initial.title,
        theme: structuredClone(initial.theme),
        viewportSize: initial.viewportSize,
        viewportRatio: initial.viewportRatio,
        viewportWidthInches: initial.viewportWidthInches,
        templates: structuredClone(initial.templates),
        slides: structuredClone(initial.slides),
      })
      set(state => (
        state.snapshotCursor === 0 && state.snapshotLength === 1
          ? state
          : { snapshotCursor: 0, snapshotLength: 1 }
      ))
    }

    if (options?.defer) {
      if (flushPendingIdle) flushPendingIdle()
      const idle = waitForIdle()
      return queueSnapshot(async () => {
        await idle.promise
        await writeInitial()
      }, { flushIdle: false })
    }

    return queueSnapshot(writeInitial)
  },

  addSnapshot() {
    const captured = captureSlidesState(useSlidesStore.getState())
    return queueSnapshot(async () => {
      const nextSlides = captured.slides
      const slideIndex = captured.index
      const cursor = get().snapshotCursor
      const allKeys = await db.snapshots.orderBy('id').primaryKeys() as number[]

      const redoKeys = cursor >= 0 && cursor < allKeys.length - 1
        ? allKeys.slice(cursor + 1)
        : []
      const keptOldKeys = cursor >= 0 ? allKeys.slice(0, cursor + 1) : []

      const { title, viewportSize, viewportRatio, viewportWidthInches } = captured

      // Fast O(1) reference check before cloning theme/templates or running deepEqual.
      if (cursorSlides && keptOldKeys.length) {
        const slidesUnchanged = sameSlideRefs(cursorSlides, nextSlides) || deepEqual(cursorSlides, nextSlides)
        if (slidesUnchanged) {
          if (
            cursorMeta
            && cursorMeta.title === title
            && cursorMeta.viewportSize === viewportSize
            && cursorMeta.viewportRatio === viewportRatio
            && cursorMeta.viewportWidthInches === viewportWidthInches
            && Object.is(cursorMeta.theme, captured.theme)
            && Object.is(cursorMeta.templates, captured.templates)
          ) {
            return
          }
          const current = await db.snapshots.get(keptOldKeys[keptOldKeys.length - 1])
          if (current && current.title === title
            && current.viewportSize === viewportSize && current.viewportRatio === viewportRatio
            && current.viewportWidthInches === viewportWidthInches
            && deepEqual(current.theme, captured.theme) && deepEqual(current.templates, captured.templates)) {
            return
          }
        }
      }

      const theme = structuredClone(captured.theme)
      const templates = structuredClone(captured.templates)

      let entry: Omit<Snapshot, 'id'>
      if (!cursorSlides || keptOldKeys.length === 0) {
        entry = { index: slideIndex, title, theme, viewportSize, viewportRatio, viewportWidthInches, templates, slides: structuredClone(nextSlides) }
      }
      else {
        const [patches, inversePatches] = diffSlides(cursorSlides, nextSlides)
        entry = { index: slideIndex, title, theme, viewportSize, viewportRatio, viewportWidthInches, templates, patches, inversePatches }
      }

      let nextLength = keptOldKeys.length + 1
      await db.transaction('rw', db.snapshots, async () => {
        if (redoKeys.length) await db.snapshots.bulkDelete(redoKeys)

        if (keptOldKeys.length >= 1) {
          await db.snapshots.update(keptOldKeys[keptOldKeys.length - 1], { index: slideIndex })
        }

        await db.snapshots.add(entry)

        // Batch-fold history: allow growth up to SNAPSHOT_HIGH_WATER (30) and
        // fold the oldest SNAPSHOT_FOLD_BATCH (10) entries into the new baseline
        // in one transaction instead of rewriting a full baseline on every edit.
        if (nextLength > SNAPSHOT_HIGH_WATER) {
          const foldCount = nextLength - SNAPSHOT_LIMIT
          const foldKeys = keptOldKeys.slice(0, foldCount + 1)
          const rows = typeof db.snapshots.bulkGet === 'function'
            ? await db.snapshots.bulkGet(foldKeys)
            : await Promise.all(foldKeys.map(key => db.snapshots.get(key)))
          const oldest = rows[0]
          const newBaseline = rows[foldCount]
          if (oldest?.slides && newBaseline) {
            let promoted = oldest.slides
            for (let i = 1; i <= foldCount; i++) {
              const row = rows[i]
              if (row?.patches?.length) promoted = applyPatches(promoted, row.patches)
            }
            delete newBaseline.patches
            delete newBaseline.inversePatches
            newBaseline.slides = structuredClone(promoted)
            await db.snapshots.put(newBaseline)
            await db.snapshots.bulkDelete(keptOldKeys.slice(0, foldCount))
            nextLength = SNAPSHOT_LIMIT
          }
        }
      })

      cursorSlides = nextSlides
      cursorMeta = {
        index: slideIndex,
        title,
        theme: captured.theme,
        viewportSize,
        viewportRatio,
        viewportWidthInches,
        templates: captured.templates,
      }
      const snapshotLength = nextLength
      const snapshotCursor = snapshotLength - 1
      set(state => (
        state.snapshotCursor === snapshotCursor && state.snapshotLength === snapshotLength
          ? state
          : { snapshotCursor, snapshotLength }
      ))
    })
  },

  unDo() {
    return queueSnapshot(async () => {
      const prevCursor = get().snapshotCursor
      if (prevCursor <= 0) return

      const snapshotCursor = prevCursor - 1
      const keys = await db.snapshots.orderBy('id').primaryKeys() as number[]
      const leavingKey = keys[prevCursor]
      const arrivingKey = keys[snapshotCursor]
      if (arrivingKey === undefined) return

      const [leaving, arriving] = await Promise.all([
        leavingKey !== undefined ? db.snapshots.get(leavingKey) : Promise.resolve(undefined),
        db.snapshots.get(arrivingKey),
      ])
      if (!arriving) return

      const slides = cursorSlides && leaving?.inversePatches
        ? applyPatches(cursorSlides, leaving.inversePatches)
        : await materializeSlidesByKeys(keys, snapshotCursor)

      restoreSlides(slides, arriving.index, arriving)
      get().setSnapshotCursor(snapshotCursor)
    })
  },

  reDo() {
    return queueSnapshot(async () => {
      const prevCursor = get().snapshotCursor
      if (prevCursor >= get().snapshotLength - 1) return

      const snapshotCursor = prevCursor + 1
      const keys = await db.snapshots.orderBy('id').primaryKeys() as number[]
      const arrivingKey = keys[snapshotCursor]
      if (arrivingKey === undefined) return

      const arriving = await db.snapshots.get(arrivingKey)
      if (!arriving) return

      const slides = cursorSlides && arriving.patches
        ? applyPatches(cursorSlides, arriving.patches)
        : await materializeSlidesByKeys(keys, snapshotCursor)

      restoreSlides(slides, arriving.index, arriving)
      get().setSnapshotCursor(snapshotCursor)
    })
  },
}))
