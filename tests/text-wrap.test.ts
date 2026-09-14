import { describe, expect, it } from '@rstest/core'
import {
  DEFAULT_TEXT_FONT_FAMILY,
  breakSpacesWrapWidth,
  extractFitBlocksFromHtml,
  resolvePaintFontFamily,
} from '../src/utils/textFit'

describe('text wrap vs live editor', () => {
  it('uses the live system stack when the theme font is empty', () => {
    expect(resolvePaintFontFamily('')).toBe(DEFAULT_TEXT_FONT_FAMILY)
    expect(resolvePaintFontFamily(undefined)).toBe(DEFAULT_TEXT_FONT_FAMILY)
    expect(resolvePaintFontFamily('Calibri')).toBe('Calibri')
  })

  it('narrows the wrap column by a trailing space to match break-spaces', () => {
    expect(breakSpacesWrapWidth(225, 18)).toBe(207)
    expect(breakSpacesWrapWidth(225, 0)).toBe(225)
  })

  it('reads left-align from the inner paragraph of a list item', () => {
    if (typeof DOMParser === 'undefined') return
    const { blocks } = extractFitBlocksFromHtml(
      '<ul><li><p style="text-align: left;">dadad</p></li><li><p style="text-align:left">dsa</p></li></ul>',
      { defaultFontFamily: 'Arial', defaultSize: 66 },
    )
    expect(blocks.map(block => block.align)).toEqual(['left', 'left'])
    expect(blocks.every(block => block.listItem)).toBe(true)
  })

  it('keeps an explicit centered list item centered', () => {
    if (typeof DOMParser === 'undefined') return
    const { blocks } = extractFitBlocksFromHtml(
      '<ul><li><p style="text-align: center;">Title</p></li></ul>',
      { defaultFontFamily: 'Arial', defaultSize: 66 },
    )
    expect(blocks[0]?.align).toBe('center')
  })
})

