import type { SlidesState } from '@/store/slides'
import { clonePlain } from '@/utils/clonePlain'
import { debounce } from '@/utils/debounce'
import { cloneSlidesForPersistence } from '@/utils/mediaIntern'
import type { FikaDocument } from './types'

/**
 * Single source of truth for document-bearing fields in `useSlidesStore`.
 * Both persisted document snapshots and `onChange` dirty detection derive from
 * this list so UI-only fields (`slideIndex`, etc.) never trigger serialization
 * and future document fields cannot silently drift out of sync.
 */
export const DOCUMENT_STORE_FIELDS = [
  'title',
  'slides',
  'theme',
  'viewportSize',
  'viewportRatio',
  'viewportWidthInches',
] as const satisfies ReadonlyArray<keyof SlidesState>

export function hasDocumentStateChanged(state: SlidesState, prev: SlidesState): boolean {
  for (const field of DOCUMENT_STORE_FIELDS) {
    if (!Object.is(state[field], prev[field])) return true
  }
  return false
}

export function buildPersistedDocument(
  state: Pick<SlidesState, typeof DOCUMENT_STORE_FIELDS[number]>,
): FikaDocument {
  return {
    title: state.title,
    // Never hand session-scoped blob: URLs to the host: they die with
    // the session and persisting them loses the media permanently.
    slides: cloneSlidesForPersistence(state.slides),
    theme: clonePlain(state.theme),
    viewport: {
      size: state.viewportSize,
      ratio: state.viewportRatio,
      widthInches: state.viewportWidthInches,
    },
  }
}

export type DocumentChangeWatcher = {
  /** Manually schedule a debounced emit (e.g. after host setDocument / importPptx). */
  emit(): void
  /** Cancel any pending queued or debounced emit. */
  cancel(): void
  /** Synchronously flush any queued microtask or debounced emit. */
  flush(): void
  /** Mute store-driven emits during transient animations (reveal frames). */
  mute(): void
  unmute(): void
  /** Flush pending edits, stop watching, and prevent future emits. */
  destroy(): void
}

export function createDocumentChangeWatcher(
  store: {
    getState: () => SlidesState
    subscribe: (listener: (state: SlidesState, prev: SlidesState) => void) => () => void
  },
  onChange: ((document: FikaDocument) => void) | undefined,
  debounceMs = 400,
): DocumentChangeWatcher {
  if (!onChange) {
    return {
      emit() {},
      cancel() {},
      flush() {},
      mute() {},
      unmute() {},
      destroy() {},
    }
  }
  const emitDebounced = debounce(() => {
    onChange(buildPersistedDocument(store.getState()))
  }, debounceMs)

  let destroyed = false
  let muted = 0
  let queued = false

  const schedule = () => {
    if (destroyed || muted || queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!destroyed && !muted) emitDebounced()
    })
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (muted || destroyed) return
    if (!hasDocumentStateChanged(state, prev)) return
    schedule()
  })

  return {
    emit() {
      if (!destroyed) emitDebounced()
    },
    cancel() {
      queued = false
      emitDebounced.cancel()
    },
    flush() {
      if (queued) {
        queued = false
        emitDebounced()
      }
      emitDebounced.flush()
    },
    mute() {
      muted++
      queued = false
      emitDebounced.cancel()
    },
    unmute() {
      muted = Math.max(0, muted - 1)
    },
    destroy() {
      if (destroyed) return
      if (queued) {
        queued = false
        emitDebounced()
      }
      emitDebounced.flush()
      destroyed = true
      unsubscribe()
      emitDebounced.cancel()
    },
  }
}
