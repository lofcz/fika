import { describe, expect, it, rs } from '@rstest/core'
import type { PPTShapeElement, Slide } from '@/types/slides'
import { inferViewportFromSlides } from '@/embed/inferViewport'

rs.mock('../src/utils/font', () => ({ collectSlidesFonts: () => [], loadGoogleFonts: () => {} }))
rs.mock('../src/i18n/getLL', () => ({ getLL: () => ({ editor: { presentation: { untitled: () => 'Untitled' } } }) }))
import { applyDocumentToStores } from '@/embed/initialDocument'
import { useSlidesStore } from '@/store/slides'

const shape = (left: number, top: number, width: number, height: number): PPTShapeElement => ({
  id: 'decoration', type: 'shape', left, top, width, height, rotate: 0,
  fill: '#f4dfd2', path: 'M0 0 L100 0 L100 100 L0 100 Z', viewBox: [100, 100], fixedRatio: false,
})
const deck = (...elements: PPTShapeElement[]): Slide[] => [
  { id: 'cover', elements },
  { id: 'content', elements: [shape(44, 80, 1192, 600)] },
]

describe('authored viewport ownership', () => {
  it('keeps a 1280×720 deck when a cover decoration bleeds below the page', () => {
    const slides = deck(shape(52, 580, 180, 200), shape(980, 0, 300, 300))
    const original = structuredClone(slides)
    expect(inferViewportFromSlides(slides, { size: 1280, ratio: 9 / 16 }))
      .toEqual({ size: 1280, ratio: 9 / 16 })
    expect(slides).toEqual(original)
  })

  it('preserves explicit default, custom and physical canvases with off-canvas objects', () => {
    for (const viewport of [
      { size: 1000, ratio: 9 / 16 },
      { size: 800, ratio: 1.5 },
      { size: 1280, ratio: 9 / 16, widthInches: 13.333 },
    ]) {
      expect(inferViewportFromSlides(deck(shape(-100, -200, 3000, 4000)), viewport))
        .toEqual(viewport)
    }
  })

  it('infers legacy documents only when their viewport is missing', () => {
    expect(inferViewportFromSlides(deck(shape(0, 0, 1280, 720))))
      .toEqual({ size: 1280, ratio: 9 / 16 })
    expect(inferViewportFromSlides([{ id: 'small', elements: [shape(20, 20, 200, 100)] }]))
      .toBeUndefined()
    expect(inferViewportFromSlides([])).toBeUndefined()
  })

  it('keeps the viewport and every element through mount, save and remount', () => {
    const document = {
      slides: deck(shape(52, 580, 180, 200)),
      viewport: { size: 1280, ratio: 9 / 16 },
    }
    applyDocumentToStores(document)
    const mounted = useSlidesStore.getState()
    expect(mounted.viewportSize).toBe(1280)
    expect(mounted.viewportRatio).toBe(9 / 16)
    expect(mounted.slides).toEqual(document.slides)
    applyDocumentToStores({
      slides: structuredClone(mounted.slides),
      viewport: { size: mounted.viewportSize, ratio: mounted.viewportRatio },
    })
    expect(useSlidesStore.getState().viewportSize).toBe(1280)
    expect(useSlidesStore.getState().slides).toEqual(document.slides)
  })
})
