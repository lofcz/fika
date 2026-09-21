import { describe, expect, it } from '@rstest/core'
import { stripThemeInlineStyles } from '@/embed/agentic/themeFormatting'

describe('partial theme formatting', () => {
  const html = `<p style="color:red;background-color:blue;border-color:green;font-family:'Times New Roman';font-size:24px">color:red;</p>`
  it('changes only the font family, preserving colors, sizes and literal text', () => {
    expect(stripThemeInlineStyles(html, { fontName: 'Calibri' })).toBe(`<p style="color:red;background-color:blue;border-color:green;font-size:24px">color:red;</p>`)
  })
  it('changes text color without corrupting background or border declarations', () => {
    expect(stripThemeInlineStyles(html, { fontColor: '#000' })).toBe(`<p style="background-color:blue;border-color:green;font-family:'Times New Roman';font-size:24px">color:red;</p>`)
  })
  it('does not strip inline styling for a background-only change', () => {
    expect(stripThemeInlineStyles(html, {})).toBe(html)
  })
})
