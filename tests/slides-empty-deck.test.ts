import { describe, expect, it, rs } from '@rstest/core'
rs.mock('../src/utils/font', () => ({ collectSlidesFonts: () => [], loadGoogleFonts: () => {} }))
rs.mock('../src/i18n/getLL', () => ({ getLL: () => ({ editor: { presentation: { untitled: () => 'Untitled' } } }) }))
import { useSlidesStore } from '../src/store/slides'

describe('inserting into an empty deck', () => {
  it('selects a valid page when insertion requests keeping the current selection', () => {
    useSlidesStore.getState().setSlides([])
    useSlidesStore.getState().addSlide({ id: 'first', elements: [] }, { select: false })
    const state = useSlidesStore.getState()
    expect(state.slideIndex).toBe(0)
    expect(state.slides[state.slideIndex]?.id).toBe('first')
  })
})
