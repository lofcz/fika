/**
 * "AI is writing" reveal of a freshly generated slide.
 *
 * Non-text elements (pictures, shapes, lines, charts, formulas…) pop in one
 * after another with a tiny stagger; panels behind text wait for their copy.
 * Text boxes are then typed out and tables
 * are filled cell by cell, in element order. The store is written directly on
 * every frame (no history snapshots, host `onChange` muted) and the final
 * content lands through the regular `slides.update` command once, so undo and
 * autosave only ever see the finished slide.
 */

import type { Slide } from '@/types/slides'
import { useMainStore, useSlidesStore } from '@/store'
import { buildPlan, frameElements } from './revealPlan'

export interface FikaRevealOptions {
  /** Badge text shown next to the caret (host-localized). Omit for no badge. */
  label?: string
  /** Aborting jumps straight to the finished slide. */
  signal?: AbortSignal
  /** Typing speed in characters per second. Default 80. */
  charsPerSecond?: number
  /** Upper bound for the whole reveal in ms. Default 9000. */
  maxDurationMs?: number
  /** `false` skips the animation and applies the slide at once. */
  animate?: boolean
}

export interface RevealDeps {
  /** Suppress host change notifications while frames are written. */
  mute(): void
  unmute(): void
  /** Apply the finished slide through the command pipeline (history + change event). */
  commit(slideId: string, patch: Partial<Slide>): Promise<void>
  isDestroyed(): boolean
}

const FRAME_MS = 40
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>(resolve => {
  const timer = setTimeout(done, ms)
  function done() {
    signal?.removeEventListener('abort', done)
    clearTimeout(timer)
    resolve()
  }
  signal?.addEventListener('abort', done, { once: true })
})

export async function revealSlide(slideId: string, patch: Partial<Slide>, options: FikaRevealOptions, deps: RevealDeps): Promise<void> {
  const slides = useSlidesStore.getState()
  const current = slides.slides.find(slide => slide.id === slideId)
  if (!current) throw new Error(`Slide not found: ${slideId}`)

  const finalPatch: Partial<Slide> = { ...patch, skeleton: false }
  delete finalPatch.id
  const finalElements = patch.elements ?? current.elements
  const { elements: _elements, ...rest } = finalPatch
  const plan = buildPlan(finalElements, options)
  const totalMs = plan.staggerMs + plan.typingMs
  const label = options.label ?? ''
  const signal = options.signal
  const animate = options.animate !== false && totalMs > 0 && !signal?.aborted && typeof document !== 'undefined' && document.visibilityState !== 'hidden'

  if (animate) {
    deps.mute()
    try {
      const started = performance.now()
      let elapsed = 0
      // First frame: the skeleton gives way to the bare background at once.
      useSlidesStore.getState().updateSlide({ ...rest, elements: [] }, slideId)
      useMainStore.getState().setAiReveal({ slideId, elementId: null, label })
      while (elapsed < totalMs) {
        await sleep(FRAME_MS, signal)
        if (signal?.aborted || deps.isDestroyed() || document.visibilityState === 'hidden') break
        const store = useSlidesStore.getState()
        if (!store.slides.some(slide => slide.id === slideId)) break
        elapsed = performance.now() - started
        const frame = frameElements(plan, finalElements, Math.min(elapsed, totalMs))
        store.updateSlide({ elements: frame.elements }, slideId)
        useMainStore.getState().setAiReveal({ slideId, elementId: frame.activeId, label })
      }
    }
    finally {
      useMainStore.getState().setAiReveal(null)
      deps.unmute()
    }
  }

  if (deps.isDestroyed()) return
  if (!useSlidesStore.getState().slides.some(slide => slide.id === slideId)) return
  await deps.commit(slideId, finalPatch)
}
