import { flushCommitQueue } from '@/utils/commitQueue'
import { clonePlain } from '@/utils/clonePlain'
import { setFikaDesignThemes } from '@/configs/designThemes'
import { setFikaAiSlideInsert } from '@/configs/aiSlideInsert'
import { useSlidesStore } from '@/store/slides'
import { useScreenStore } from '@/store/screen'
import { useMainStore } from '@/store/main'
import type { FikaController, FikaDocument, FikaImportPptxOptions } from './types'
import { applyLocale } from './localeBridge'
import type { Locales } from '@/i18n/locale'
import { createAgenticApi } from './agentic/createAgenticApi'
import {
  createDocumentChangeWatcher,
  DOCUMENT_STORE_FIELDS,
  hasDocumentStateChanged,
} from './documentChangeWatch'
import { renderDeckAtlas, renderSlideImage } from './render'
import { revealSlide, type FikaRevealOptions } from './reveal'
import type { Slide } from '@/types/slides'

export { DOCUMENT_STORE_FIELDS, hasDocumentStateChanged }

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

function clampSlideIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.min(Math.trunc(index), Math.max(length - 1, 0)))
}

async function assertLegacyCommand(command: Promise<{ ok: boolean; errors?: Array<{ message: string }> }>) {
  const result = await command
  if (!result.ok) throw new Error(result.errors?.map(error => error.message).join('; ') || 'Fika command failed')
}

export function createController(
  options: {
    onChange?: (document: FikaDocument) => void
    onChangeDebounceMs?: number
    onPresentationModeChange?: (screening: boolean) => void
    unmount?: () => void
  },
): FikaController {
  const agentic = createAgenticApi({
    async setLocale(locale) {
      await applyLocale(locale)
    },
    unmount: options.unmount,
  })

  const changeWatcher = createDocumentChangeWatcher(
    useSlidesStore,
    options.onChange,
    options.onChangeDebounceMs ?? 400,
  )

  const stopPresentationModeWatch = options.onPresentationModeChange
    ? useScreenStore.subscribe((state, prev) => {
        if (state.screening !== prev.screening) options.onPresentationModeChange?.(state.screening)
      })
    : null

  let destroyed = false
  let revealChain: Promise<void> = Promise.resolve()
  let revealing: { slideId: string; patch: Partial<Slide> } | null = null

  const runLegacyCommand = (command: Promise<unknown>) => {
    void command
  }

  const resolveSlideIndex = (slideIdOrIndex: string | number) => {
    const slides = useSlidesStore.getState().slides
    const index = typeof slideIdOrIndex === 'number'
      ? clampSlideIndex(slideIdOrIndex - 1, slides.length)
      : slides.findIndex(slide => slide.id === slideIdOrIndex)
    if (index < 0) throw new Error(`Slide not found: ${slideIdOrIndex}`)
    return index
  }

  const controller: FikaController = {
    ...agentic.api,

    getDocument(): FikaDocument {
      const doc = agentic.api.deck.get()
      // Animation frames are paint-only. A host snapshot/reconnect must see
      // the complete target slide, never a prefix marked as finished.
      const target = revealing
      if (target) doc.slides = doc.slides.map(slide => slide.id === target.slideId
        ? { ...slide, ...target.patch, id: slide.id, skeleton: false }
        : slide)
      return doc
    },

    setDocument(document: FikaDocument) {
      if (destroyed) return
      runLegacyCommand(agentic.api.deck.set(document, { source: 'host' }))
      changeWatcher.emit()
    },

    async importPptx(data: File | Blob | ArrayBuffer, importOptions?: FikaImportPptxOptions) {
      if (destroyed) return false
      let getImportApi: typeof import('@/hooks/useImport').getImportApi
      try {
        ({ getImportApi } = await import('@/hooks/useImport'))
      } catch (error) {
        console.error('[fika] failed to load PPTX import module', error)
        return false
      }
      if (destroyed) return false
      const { importPPTXFile } = getImportApi()
      const file = data instanceof File
        ? data
        : new File([data], 'import.pptx', { type: PPTX_MIME })
      const ok = await importPPTXFile([file], {
        mode: importOptions?.mode,
        cover: importOptions?.cover,
        confirm: importOptions?.confirm ?? false,
        fixedViewport: importOptions?.fixedViewport ?? false,
        fixContrast: importOptions?.fixContrast ?? false,
        turningMode: importOptions?.turningMode,
        defaultTurningMode: importOptions?.defaultTurningMode,
      })
      if (ok) changeWatcher.emit()
      return ok
    },

    setTitle(title: string) {
      if (destroyed) return
      runLegacyCommand(agentic.api.deck.setTitle(title, { source: 'host' }))
    },

    setDesignThemes(themes) {
      if (!destroyed) setFikaDesignThemes(themes)
    },
    setAiSlideInsert(config) {
      if (!destroyed) setFikaAiSlideInsert(config)
    },
    async setLocale(locale: Locales) {
      if (destroyed) return
      await assertLegacyCommand(agentic.api.view.setLocale(locale))
    },

    async renderSlide(slideIdOrIndex, options) {
      if (destroyed) return null
      const state = useSlidesStore.getState()
      const index = slideIdOrIndex === undefined ? state.slideIndex : resolveSlideIndex(slideIdOrIndex)
      const slide = state.slides[index]
      if (!slide) return null
      return renderSlideImage({
        slide,
        theme: state.theme,
        viewportSize: state.viewportSize,
        viewportRatio: state.viewportRatio,
      }, options)
    },

    async renderAtlas(options) {
      if (destroyed) return []
      const state = useSlidesStore.getState()
      return renderDeckAtlas({
        slides: state.slides,
        theme: state.theme,
        viewportSize: state.viewportSize,
        viewportRatio: state.viewportRatio,
      }, options)
    },

    goToSlide(slideIdOrIndex: string | number) {
      if (destroyed) return
      // Hosts follow their own edits (AI bridge, streamed generation). Never
      // pull the slide out from under a drag/resize/rotate the teacher is doing.
      if (useMainStore.getState().isGesturing) return
      const storeIndex = resolveSlideIndex(slideIdOrIndex)
      runLegacyCommand(agentic.api.view.goToSlide(
        typeof slideIdOrIndex === 'number' ? storeIndex + 1 : slideIdOrIndex,
        { source: 'host' },
      ))
    },

    nextSlide() {
      if (destroyed) return
      runLegacyCommand(agentic.api.view.nextSlide({ source: 'host' }))
    },

    previousSlide() {
      if (destroyed) return
      runLegacyCommand(agentic.api.view.previousSlide({ source: 'host' }))
    },

    setZoom(scale: number) {
      if (destroyed) return
      runLegacyCommand(agentic.api.view.setZoom(scale, { source: 'host' }))
    },

    setReadOnly(readOnly: boolean) {
      if (destroyed) return
      useMainStore.getState().setReadOnly(readOnly)
    },

    isReadOnly() {
      return useMainStore.getState().readOnly
    },

    revealSlide(slideId: string, patch: Partial<Slide>, options: FikaRevealOptions = {}) {
      if (destroyed) return Promise.resolve()
      const run = async () => {
        revealing = { slideId, patch: clonePlain(patch) }
        try {
          await revealSlide(slideId, patch, options, {
            mute() {
              changeWatcher.mute()
            },
            unmute() {
              changeWatcher.unmute()
            },
            async commit(id, finalPatch) {
              await assertLegacyCommand(agentic.api.slides.update(id, finalPatch, { source: 'host' }))
            },
            isDestroyed: () => destroyed,
          })
        } finally {
          revealing = null
        }
      }
      const next = revealChain.then(run, run)
      revealChain = next.catch(() => undefined)
      return next
    },

    enterPresentation() {
      if (destroyed) return
      runLegacyCommand(agentic.api.view.enterPresentation())
    },

    exitPresentation() {
      if (destroyed) return
      runLegacyCommand(agentic.api.view.exitPresentation())
    },

    destroy() {
      if (destroyed) return
      flushCommitQueue()
      changeWatcher.destroy()
      destroyed = true
      useMainStore.getState().setAiReveal(null)
      stopPresentationModeWatch?.()
      agentic.stop()
    },
  }

  return controller
}
