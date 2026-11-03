import { describe, expect, it } from '@rstest/core'
import { fitFontScaleForBlocks, minimumTextFitScale, type TextFitBlock } from '../src/utils/textFit'

const mixed: TextFitBlock[] = [{ text: 'Heading and caption', size: 40, fontFamily: 'Arial', runs: [
  { text: 'Heading', size: 40 }, { text: 'caption', size: 20 },
] }]

describe('explicit minimum font size', () => {
  it('protects the smallest visible run rather than just the paragraph size', () => {
    expect(minimumTextFitScale(mixed, 16)).toBe(0.8)
    expect(minimumTextFitScale(mixed, 26)).toBe(1.3)
  })
  it('never hides an impossible box by shrinking below the requested floor', () => {
    expect(fitFontScaleForBlocks(mixed, { innerWidth: 50, innerHeight: 12, lineHeight: 1.3, minFontSize: 26 })).toBe(1.3)
    const equal = [{ text: 'Several lines of text', size: 26, fontFamily: 'Arial' }]
    expect(fitFontScaleForBlocks(equal, { innerWidth: 30, innerHeight: 10, lineHeight: 1.3, minFontSize: 26 })).toBe(1)
  })
  it('leaves legacy documents unconstrained and ignores invalid floors', () => {
    for (const value of [undefined, 0, -1, NaN, Infinity]) expect(minimumTextFitScale(mixed, value)).toBe(0)
  })
})
