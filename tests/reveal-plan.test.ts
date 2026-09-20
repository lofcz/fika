import { describe, expect, it, rs } from '@rstest/core'
import type { PPTElement } from '../src/types/slides'
import { buildPlan, frameElements } from '../src/embed/revealPlan'

// Plain text isolates frame timing from the browser's rich-text parser.
rs.mock('../src/utils/revealHtml', () => ({
  revealUnits: (text: string) => text.length,
  revealPrefix: (text: string, units: number) => text.slice(0, units),
}))

const element = (id: string, type: string, left: number, top: number, width: number, height: number, extra = {}) =>
  ({ id, type, left, top, width, height, rotate: 0, ...extra }) as PPTElement
const title = element('title', 'text', 0, 0, 500, 60, { content: 'Title' })
const panel = element('panel', 'shape', 300, 200, 300, 150)
const copy = element('copy', 'text', 320, 200, 260, 150, { content: 'Callout copy' })
const image = element('image', 'image', 0, 100, 250, 300)
const ids = (elements: PPTElement[]) => elements.map(el => el.id)

describe('slide reveal panels', () => {
  it('waits for callout copy, preserving images and final stacking order', () => {
    const elements = [title, image, panel, copy]
    const plan = buildPlan(elements, {})
    expect(ids(frameElements(plan, elements, 0).elements)).toEqual(['image'])
    expect(ids(frameElements(plan, elements, plan.staggerMs + plan.typedEnds[0] / 2).elements)).toEqual(['title', 'image'])
    const calloutStart = plan.staggerMs + plan.typedEnds[0]
    expect(ids(frameElements(plan, elements, calloutStart).elements)).not.toContain('panel')
    const frame = frameElements(plan, elements, calloutStart + (plan.typingMs - plan.typedEnds[0]) / 2)
    expect(ids(frame.elements)).toEqual(['title', 'image', 'panel', 'copy'])
    expect(frame.activeId).toBe('copy')
    expect(frameElements(plan, elements, plan.staggerMs + plan.typingMs).elements).toEqual(elements)
  })

  it('reveals a shared panel with its first text and keeps it for later text', () => {
    const second = element('second', 'text', 320, 270, 260, 60, { content: 'Second' })
    const first = { ...copy, height: 60 }
    const elements = [panel, first, second]
    const plan = buildPlan(elements, {})
    expect(plan.backgrounds.get('panel')).toBe('copy')
    expect(ids(frameElements(plan, elements, plan.typedEnds[0] / 2).elements)).toContain('panel')
    expect(ids(frameElements(plan, elements, plan.typedEnds[0] + 1).elements)).toContain('panel')
  })

  it('delays separate panels independently', () => {
    const otherPanel = { ...panel, id: 'otherPanel', left: 650 }
    const otherCopy = { ...copy, id: 'otherCopy', left: 670 }
    const elements = [panel, copy, otherPanel, otherCopy]
    const plan = buildPlan(elements, {})
    expect(ids(frameElements(plan, elements, plan.typedEnds[0] / 2).elements)).toEqual(['panel', 'copy'])
    expect(ids(frameElements(plan, elements, plan.typingMs).elements)).toEqual(ids(elements))
  })

  it('leaves standalone, foreground, overlapping and text-bearing shapes in the initial stagger', () => {
    const outside = { ...panel, id: 'outside', left: 900 }
    const overlap = { ...panel, id: 'overlap', width: 30 }
    const ownText = { ...panel, id: 'ownText', text: { content: 'Shape text' } }
    const foreground = { ...panel, id: 'foreground' }
    const elements = [outside, overlap, ownText, copy, foreground]
    const plan = buildPlan(elements, {})
    expect(plan.backgrounds.size).toBe(0)
    expect(ids(plan.instant)).toEqual(['outside', 'overlap', 'ownText', 'foreground'])
  })

  it('shows table backgrounds when their table starts', () => {
    const table = element('table', 'table', 320, 220, 260, 100, { data: [[{ text: 'Cell' }]] })
    const elements = [title, panel, table]
    const plan = buildPlan(elements, {})
    expect(ids(frameElements(plan, elements, plan.typedEnds[0] / 2).elements)).not.toContain('panel')
    expect(ids(frameElements(plan, elements, plan.typedEnds[0] + 1).elements)).toEqual(['title', 'panel', 'table'])
  })

  it('keeps an empty panel visible when there is no text to type', () => {
    const elements = [panel, { ...copy, content: '' } as PPTElement]
    const plan = buildPlan(elements, {})
    expect(plan.backgrounds.size).toBe(0)
    expect(frameElements(plan, elements, plan.staggerMs).elements).toEqual(elements)
  })
})
