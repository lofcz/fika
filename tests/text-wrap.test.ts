import { describe, expect, it } from '@rstest/core'
import {
  DEFAULT_TEXT_FONT_FAMILY,
  breakSpacesWrapWidth,
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
})
