import type { PPTElement, PPTTableElement, PPTTextElement, TableCell } from '../types/slides'
import { revealPrefix, revealUnits } from '../utils/revealHtml'
import type { FikaRevealOptions } from './reveal'

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
  /** Background shape ID → first contained typed element ID. */
  backgrounds: Map<string, string>
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

export function buildPlan(elements: PPTElement[], options: FikaRevealOptions): Plan {
  const instant: PPTElement[] = []
  const typed: TypedPlan[] = []
  for (const element of elements) {
    const t = planTyped(element)
    if (t) typed.push(t)
    else instant.push(element)
  }
  // A panel and its copy are separate elements. Keep the panel hidden until
  // the first text/table above it starts, preserving the final stacking order.
  const backgrounds = new Map<string, string>()
  const order = new Map(elements.map((element, index) => [element.id, index]))
  for (let i = instant.length - 1; i >= 0; i--) {
    const panel = instant[i]
    if (panel.type !== 'shape' || panel.text?.content || panel.rotate) continue
    const owner = typed.find(({ element }) =>
      order.get(element.id)! > order.get(panel.id)! && !element.rotate &&
      element.left >= panel.left - 1 && element.top >= panel.top - 1 &&
      element.left + element.width <= panel.left + panel.width + 1 &&
      element.top + element.height <= panel.top + panel.height + 1,
    )
    if (owner) {
      backgrounds.set(panel.id, owner.element.id)
      instant.splice(i, 1)
    }
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
  return { instant, backgrounds, typed, staggerGap, staggerMs, typingMs, typedEnds }
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
export function frameElements(plan: Plan, finalElements: PPTElement[], elapsed: number): { elements: PPTElement[]; activeId: string | null } {
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
    const ownerId = plan.backgrounds.get(el.id)
    const owner = ownerId ? partial.get(ownerId) : undefined
    const backgroundVisible = owner && (owner.type !== 'text' || owner.content.length > 0)
    if (instantIds.has(el.id) || backgroundVisible) elements.push(el)
    else {
      const p = partial.get(el.id)
      if (p) elements.push(p)
    }
  }
  return { elements, activeId }
}

