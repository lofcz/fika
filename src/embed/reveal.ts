/**
 * "AI is writing" reveal of a freshly generated slide.
 *
 * Non-text elements (pictures, shapes, lines, charts, formulas…) pop in one
 * after another with a tiny stagger; text boxes are then typed out and tables
 * are filled cell by cell, in element order. The store is written directly on
 * every frame (no history snapshots, host `onChange` muted) and the final
 * content lands through the regular `slides.update` command once, so undo and
 * autosave only ever see the finished slide.
 */

import type { PPTElement, PPTTableElement, PPTTextElement, Slide, TableCell } from '@/types/slides'
import { useMainStore, useSlidesStore } from '@/store'
import { revealPrefix, revealUnits } from '@/utils/revealHtml'

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
const STAGGER_TOTAL_MS = 600
const STAGGER_MIN_MS = 30
const STAGGER_MAX_MS = 110
const MIN_TYPED_ELEMENT_MS = 160
const DEFAULT_CPS = 80
const DEFAULT_MAX_MS = 9000

interface CellPlan {
  row: number
  col: number
  units: number
}

type TypedPlan =
  | { kind: 'text'; element: PPTTextElement; units: number }
  | { kind: 'table'; element: PPTTableElement; units: number; cells: CellPlan[] }

interface Plan {
  instant: PPTElement[]
  typed: TypedPlan[]
  staggerGap: number
  staggerMs: number
  typingMs: number
  /** Cumulative end offsets (ms, from typing start) per typed element. */
  typedEnds: number[]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function planTyped(element: PPTElement): TypedPlan | null {
  if (element.type === 'text') {
    const units = revealUnits(element.content)
    return units > 0 ? { kind: 'text', element, units } : null
  }
  if (element.type === 'table') {
    const cells: CellPlan[] = []
    let units = 0
    element.data.forEach((row, r) => {
      row.forEach((cell, c) => {
        const cellUnits = Math.max(1, revealUnits(cell.text))
        cells.push({ row: r, col: c, units: cellUnits })
        units += cellUnits
      })
    })
    return units > 0 ? { kind: 'table', element, units, cells } : null
  }
  return null
}

function buildPlan(elements: PPTElement[], options: FikaRevealOptions): Plan {
  const instant: PPTElement[] = []
  const typed: TypedPlan[] = []
  for (const element of elements) {
    const t = planTyped(element)
    if (t) typed.push(t)
    else instant.push(element)
  }
  const staggerGap = instant.length ? clamp(STAGGER_TOTAL_MS / instant.length, STAGGER_MIN_MS, STAGGER_MAX_MS) : 0
  const staggerMs = instant.length ? staggerGap * instant.length : 0
  const maxMs = options.maxDurationMs ?? DEFAULT_MAX_MS
  const cps = options.charsPerSecond ?? DEFAULT_CPS
  const totalUnits = typed.reduce((sum, t) => sum + t.units, 0)
  const wanted = (totalUnits / cps) * 1000 + typed.length * MIN_TYPED_ELEMENT_MS
  const typingMs = typed.length ? clamp(wanted, MIN_TYPED_ELEMENT_MS * typed.length, Math.max(MIN_TYPED_ELEMENT_MS * typed.length, maxMs - staggerMs)) : 0
  const typedEnds: number[] = []
  let acc = 0
  for (const t of typed) {
    const share = totalUnits > 0 ? t.units / totalUnits : 1 / typed.length
    acc += typingMs * share
    typedEnds.push(acc)
  }
  return { instant, typed, staggerGap, staggerMs, typingMs, typedEnds }
}

function partialText(element: PPTTextElement, progress: number, units: number): PPTTextElement {
  const shown = Math.floor(units * progress)
  return { ...element, content: revealPrefix(element.content, shown) }
}

function partialTable(plan: Extract<TypedPlan, { kind: 'table' }>, progress: number): PPTTableElement {
  let budget = plan.units * progress
  const shown = new Map<string, string>()
  for (const cell of plan.cells) {
    const key = `${cell.row}:${cell.col}`
    if (budget >= cell.units) {
      shown.set(key, plan.element.data[cell.row][cell.col].text)
      budget -= cell.units
      continue
    }
    const text = plan.element.data[cell.row][cell.col].text
    shown.set(key, budget > 0 ? revealPrefix(text, Math.floor(revealUnits(text) * (budget / cell.units))) : '')
    budget = 0
  }
  const data: TableCell[][] = plan.element.data.map((row, r) => row.map((cell, c) => ({ ...cell, text: shown.get(`${r}:${c}`) ?? '' })))
  return { ...plan.element, data }
}

/** Elements visible at `elapsed` ms, in their final order. */
function frameElements(plan: Plan, finalElements: PPTElement[], elapsed: number): { elements: PPTElement[]; activeId: string | null } {
  const shownInstant = plan.staggerGap > 0 ? Math.min(plan.instant.length, Math.floor(elapsed / plan.staggerGap) + 1) : plan.instant.length
  const instantIds = new Set(plan.instant.slice(0, shownInstant).map(el => el.id))

  const typingElapsed = elapsed - plan.staggerMs
  const partial = new Map<string, PPTElement>()
  let activeId: string | null = null
  if (typingElapsed >= 0) {
    let start = 0
    for (let i = 0; i < plan.typed.length; i++) {
      const t = plan.typed[i]
      const end = plan.typedEnds[i]
      if (typingElapsed >= end) {
        partial.set(t.element.id, t.element)
      }
      else {
        const progress = end > start ? clamp((typingElapsed - start) / (end - start), 0, 1) : 1
        partial.set(t.element.id, t.kind === 'text' ? partialText(t.element, progress, t.units) : partialTable(t, progress))
        activeId = t.element.id
        break
      }
      start = end
    }
  }

  const elements: PPTElement[] = []
  for (const el of finalElements) {
    if (instantIds.has(el.id)) elements.push(el)
    else {
      const p = partial.get(el.id)
      if (p) elements.push(p)
    }
  }
  return { elements, activeId }
}

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
  const animate = options.animate !== false && totalMs > 0 && !signal?.aborted && typeof document !== 'undefined'

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
        if (signal?.aborted || deps.isDestroyed()) break
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
