import { useSlidesStore } from '@/store'
import type { FikaDocument } from './types'
import type { FikaDeckViewport } from './agentic/types'
import { inferViewportFromSlides } from './inferViewport'

export type FikaInitialDocument = FikaDocument & { viewport?: Partial<FikaDeckViewport> }

/**
 * Write a document straight into the stores (title, slides, theme, viewport).
 *
 * `mountFika` calls this synchronously for `options.document` BEFORE the first
 * render, so the controller it resolves with already reflects the document.
 * Doing it in EmbedRoot's mount effect instead left a window where a host
 * command issued right after `await mountFika(...)` (e.g. inserting the first
 * streamed slide) was overwritten by the late `setSlides(init.document.slides)`.
 */
export function applyDocumentToStores(document: FikaInitialDocument): void {
  const store = useSlidesStore.getState()
  store.setTitle(document.title)
  store.setSlides(document.slides, document.theme)
  const viewport = inferViewportFromSlides(document.slides, document.viewport) ?? document.viewport
  if (viewport?.size) store.setViewportSize(viewport.size)
  if (viewport?.ratio) store.setViewportRatio(viewport.ratio)
}
