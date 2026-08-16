import { describe, expect, it } from '@rstest/core'
import { normalizeFittedFontSizes } from '@/utils/prosemirror'

const CALC_HTML = '<p><span style="font-size: calc(var(--text-fit-scale, 1) * 57px);">big</span></p>'

describe('fitted font sizes', () => {
  it('normalizes calc() back to plain px', () => {
    expect(normalizeFittedFontSizes(CALC_HTML)).toBe('<p><span style="font-size: 57px;">big</span></p>')
  })

  it('leaves plain px html untouched', () => {
    expect(normalizeFittedFontSizes('<p><span style="font-size: 57px;">big</span></p>'))
      .toBe('<p><span style="font-size: 57px;">big</span></p>')
  })

  it('parses calc html into plain px marks (browser only)', async () => {
    if (typeof window === 'undefined') return
    const { createDocument } = await import('@/utils/prosemirror')
    const doc = createDocument(CALC_HTML)
    const text = doc.textContent || ''
    expect(text).toBe('big')
    // the parsed doc must not carry the render-only variable anywhere
    expect(JSON.stringify(doc.toJSON())).not.toContain('--text-fit-scale')
  })
})
