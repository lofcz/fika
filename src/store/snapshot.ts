import { create } from 'zustand'
import type { IndexableTypeArray } from 'dexie'
import { db, type Snapshot } from '@/utils/database'
import { useSlidesStore } from './slides'
import { useMainStore } from './main'

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

    const newFirstSnapshot = {
      index: slidesStore.slideIndex,
      slides: JSON.parse(JSON.stringify(slidesStore.slides)),
    }
    await db.snapshots.add(newFirstSnapshot)
    set(state => (
      state.snapshotCursor === 0 && state.snapshotLength === 1
        ? state
        : { snapshotCursor: 0, snapshotLength: 1 }
    ))
  },

  async addSnapshot() {
    const allKeys = await db.snapshots.orderBy('id').keys()

    let needDeleteKeys: IndexableTypeArray = []

    if (get().snapshotCursor >= 0 && get().snapshotCursor < allKeys.length - 1) {
      needDeleteKeys = allKeys.slice(get().snapshotCursor + 1)
    }

    const slidesStore = useSlidesStore.getState()
    const snapshot = {
      index: slidesStore.slideIndex,
      slides: JSON.parse(JSON.stringify(slidesStore.slides)),
    }
    await db.snapshots.add(snapshot)

    let snapshotLength = allKeys.length - needDeleteKeys.length + 1

    const snapshotLengthLimit = 20
    if (snapshotLength > snapshotLengthLimit) {
      needDeleteKeys.push(allKeys[0])
      snapshotLength--
    }

    if (snapshotLength >= 2) {
      db.snapshots.update(allKeys[snapshotLength - 2] as number, { index: useSlidesStore.getState().slideIndex })
    }

    await db.snapshots.bulkDelete(needDeleteKeys as number[])

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
    const snapshot = snapshots[snapshotCursor]
    const { index, slides } = snapshot

    const slideIndex = index > slides.length - 1 ? slides.length - 1 : index

    const slidesStore = useSlidesStore.getState()
    slidesStore.setSlides(slides)
    slidesStore.updateSlideIndex(slideIndex)
    get().setSnapshotCursor(snapshotCursor)
    useMainStore.getState().setActiveElementIdList([])
  },

  async reDo() {
    if (get().snapshotCursor >= get().snapshotLength - 1) return

    const snapshotCursor = get().snapshotCursor + 1
    const snapshots: Snapshot[] = await db.snapshots.orderBy('id').toArray()
    const snapshot = snapshots[snapshotCursor]
    const { index, slides } = snapshot

    const slideIndex = index > slides.length - 1 ? slides.length - 1 : index

    const slidesStore = useSlidesStore.getState()
    slidesStore.setSlides(slides)
    slidesStore.updateSlideIndex(slideIndex)
    get().setSnapshotCursor(snapshotCursor)
    useMainStore.getState().setActiveElementIdList([])
  },
}))
