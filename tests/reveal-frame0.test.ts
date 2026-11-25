import { beforeEach, describe, expect, it, rs } from '@rstest/core'
import type { PPTElement, Slide } from '../src/types/slides'

const observedFrames: PPTElement[][] = []
let slidesState: Slide[] = []
const updateSlideSpy = rs.fn((props: Partial<Slide>, slideId?: string) => {
  if (props.elements) observedFrames.push(props.elements)
  slidesState = slidesState.map(s => (s.id === slideId ? { ...s, ...props } : s))
})
const setAiRevealSpy = rs.fn()

rs.mock('@/store', () => ({
  useSlidesStore: {
    getState: () => ({
      slides: slidesState,
      updateSlide: updateSlideSpy,
    }),
  },
  useMainStore: {
    getState: () => ({
      setAiReveal: setAiRevealSpy,
    }),
  },
}))

rs.mock('../src/utils/revealHtml', () => ({
  revealUnits: (text: string) => text.replace(/<[^>]+>/g, '').length,
  revealPrefix: (text: string, units: number) => text.slice(0, units),
}))

import { revealSlide, type RevealDeps } from '../src/embed/reveal'

const element = (id: string, type: string, left: number, top: number, width: number, height: number, extra = {}) =>
  ({ id, type, left, top, width, height, rotate: 0, ...extra }) as PPTElement

const titleEl = element('title', 'text', 40, 40, 500, 60, { content: '<p>Zlomky</p>' })
const photoEl = element('photo', 'image', 560, 100, 320, 240, { src: 'https://example.org/a.jpg' })
const shapeEl = element('decor', 'shape', 40, 120, 200, 100)

function makeSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: 'slide-1',
    elements: [],
    background: { type: 'solid', color: '#ffffff' },
    ...overrides,
  }
}

describe('revealSlide frame-0 and populated-slide guards', () => {
  beforeEach(() => {
    slidesState = []
    observedFrames.length = 0
    updateSlideSpy.mockClear()
    setAiRevealSpy.mockClear()
  })

  it('keeps non-text structural elements visible on frame 0 for skeleton slides (never flashes elements: [])', async () => {
    slidesState = [makeSlide({ id: 'slide-skel', skeleton: true, elements: [] })]

    const prevDoc = (globalThis as { document?: unknown }).document
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { visibilityState: 'visible' },
    })

    const controller = new AbortController()
    const deps: RevealDeps = {
      mute: rs.fn(),
      unmute: rs.fn(),
      commit: rs.fn(async () => {}),
      isDestroyed: () => false,
    }

    try {
      const promise = revealSlide(
        'slide-skel',
        { elements: [titleEl, photoEl, shapeEl] },
        { signal: controller.signal, charsPerSecond: 80 },
        deps,
      )
      controller.abort()
      await promise

      expect(observedFrames.length).toBeGreaterThanOrEqual(1)
      // Frame 0 keeps non-text structure (photo + standalone shape), never empty []
      expect(observedFrames[0].map(el => el.id)).toEqual(['photo', 'decor'])
      expect(deps.commit).toHaveBeenCalledTimes(1)
    }
    finally {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: prevDoc })
    }
  })

  it('never wipes or animates a slide that already has non-skeleton elements', async () => {
    slidesState = [makeSlide({ id: 'slide-live', skeleton: false, elements: [titleEl, photoEl] })]

    const prevDoc = (globalThis as { document?: unknown }).document
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { visibilityState: 'visible' },
    })

    const deps: RevealDeps = {
      mute: rs.fn(),
      unmute: rs.fn(),
      commit: rs.fn(async () => {}),
      isDestroyed: () => false,
    }

    try {
      await revealSlide('slide-live', { elements: [titleEl, photoEl, shapeEl] }, { charsPerSecond: 80 }, deps)
      expect(deps.mute).not.toHaveBeenCalled()
      expect(updateSlideSpy).not.toHaveBeenCalled()
      expect(deps.commit).toHaveBeenCalledTimes(1)
    }
    finally {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: prevDoc })
    }
  })
})
