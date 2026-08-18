import { useSlidesStore } from '@/store/slides'
import { useScreenStore } from '@/store/screen'
import { getImportApi } from '@/hooks/useImport'
import type { FikaController, FikaDocument, FikaImportPptxOptions } from './types'
import { applyLocale } from './localeBridge'
import type { Locales } from '@/i18n/locale'
import { createAgenticApi } from './agentic/createAgenticApi'
import { debounce } from '@/utils/debounce'
import { rewritePersistableMediaSrcs } from '@/utils/mediaIntern'

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

  const emitChange = options.onChange
    ? debounce(() => {
        const slidesStore = useSlidesStore.getState()
        options.onChange?.({
          title: slidesStore.title,
          // Never hand session-scoped blob: URLs to the host: they die with
          // the session and persisting them loses the media permanently.
          slides: rewritePersistableMediaSrcs(
            JSON.parse(JSON.stringify(slidesStore.slides)) as FikaDocument['slides'],
          ),
          theme: { ...slidesStore.theme },
          viewport: {
            size: slidesStore.viewportSize,
            ratio: slidesStore.viewportRatio,
          },
        })
      }, options.onChangeDebounceMs ?? 400)
    : null

  const stopChangeWatch = emitChange
    ? useSlidesStore.subscribe(() => emitChange())
    : null

  const stopPresentationModeWatch = options.onPresentationModeChange
    ? useScreenStore.subscribe((state, prev) => {
        if (state.screening !== prev.screening) options.onPresentationModeChange?.(state.screening)
      })
    : null

  let destroyed = false

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
      return agentic.api.deck.get()
    },

    setDocument(document: FikaDocument) {
      if (destroyed) return
      runLegacyCommand(agentic.api.deck.set(document, { source: 'host' }))
      emitChange?.()
    },

    async importPptx(data: File | Blob | ArrayBuffer, importOptions?: FikaImportPptxOptions) {
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
      if (ok) emitChange?.()
      return ok
    },

    setTitle(title: string) {
      if (destroyed) return
      runLegacyCommand(agentic.api.deck.setTitle(title, { source: 'host' }))
    },

    async setLocale(locale: Locales) {
      if (destroyed) return
      await assertLegacyCommand(agentic.api.view.setLocale(locale))
    },

    goToSlide(slideIdOrIndex: string | number) {
      if (destroyed) return
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
      destroyed = true
      stopChangeWatch?.()
      stopPresentationModeWatch?.()
      emitChange?.cancel()
      agentic.stop()
    },
  }

  return controller
}
