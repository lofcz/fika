import { describe, expect, it } from '@rstest/core'
import { fitLatexBoxToSlide } from '../src/utils/latex'

describe('latex box', () => {
  it('fits an oversized measure into the slide and centers it', () => {
    const box = fitLatexBoxToSlide(600, 800, 1000, 562.5)
    expect(box.width).toBeLessThanOrEqual(920)
    expect(box.height).toBeLessThanOrEqual(482.5)
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.left + box.width).toBeLessThanOrEqual(1000)
    expect(box.top + box.height).toBeLessThanOrEqual(562.5)
  })
})
