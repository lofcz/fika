import { i18nObject } from '@/i18n/i18n-util'
import { loadAllLocales } from '@/i18n/i18n-util.sync'
import type { Locales } from '@/i18n/i18n-types'
import { describe, expect, it } from '@rstest/core'
import { createMynaDocument, createMynaPage, createMynaTextPair, MYNA_FORMATS, MYNA_TEMPLATES, validMynaSize } from '@/views/Myna/catalog'

describe('Myna editable designs', () => {
  it('localizes newly inserted designs without modifying previously created content', () => {
    loadAllLocales()
    const titles = new Set<string>()
    const english = createMynaDocument(i18nObject('en').myna)
    const snapshot = JSON.stringify(english)
    for (const locale of ['en', 'cs', 'sk', 'pl'] as Locales[]) {
      const t = i18nObject(locale).myna
      const document = createMynaDocument(t)
      titles.add(document.title)
      expect(document.title).toBe(t.untitled())
      expect(document.slides[0].elements.some(element => element.type === 'text' && element.content.includes(t.studioEyebrow()))).toBe(true)
      expect(createMynaTextPair('Heading', 'Arial', 1080, 1080, '#222', t)[1].content).toContain(t.storyStarts())
    }
    expect(titles.size).toBe(3) // Czech and Slovak share the same natural title.
    expect(JSON.stringify(english)).toBe(snapshot)
  })
  it('starts with a square design and independent document identities', () => {
    const a = createMynaDocument(), b = createMynaDocument()
    expect(a.viewport).toEqual({ size: 1080, ratio: 1 })
    expect(a.slides[0].id).not.toBe(b.slides[0].id)
    expect(a.slides[0].elements[0].id).not.toBe(b.slides[0].elements[0].id)
    a.slides[0].elements[0].left = -500
    expect(b.slides[0].elements[0].left).toBeGreaterThanOrEqual(0)
  })
  it('keeps all template elements within every supported design format', () => {
    for (const template of MYNA_TEMPLATES) for (const format of MYNA_FORMATS) {
      const page = createMynaPage(template.id, format.width, format.height)
      expect(new Set(page.elements.map(el => el.id)).size).toBe(page.elements.length)
      expect(page.elements.some(el => el.type === 'text')).toBe(true)
      for (const element of page.elements) {
        expect(element.left).toBeGreaterThanOrEqual(0)
        expect(element.top).toBeGreaterThanOrEqual(0)
        expect(element.left + element.width).toBeLessThanOrEqual(format.width)
        if ('height' in element) expect(element.top + element.height).toBeLessThanOrEqual(format.height)
        expect(element.type === 'text' || element.type === 'shape').toBe(true)
      }
    }
  })
  it('creates a grouped font pairing with escaped, independently editable text', () => {
    const pair = createMynaTextPair('<Hello & goodbye>', 'Georgia', 1080, 1080, '#222222')
    expect(pair).toHaveLength(2)
    expect(pair[0].groupId).toBe(pair[1].groupId)
    expect(pair[0].id).not.toBe(pair[1].id)
    expect(pair[0].content).toContain('&lt;Hello &amp; goodbye&gt;')
    expect(pair[0].defaultFontName).toBe('Georgia')
    expect(pair[1].defaultFontName).toBe('Arial')
  })
  it('rejects invalid sizes and unknown templates before producing content', () => {
    for (const size of [NaN, Infinity, -1, 0, 99, 100.5, 8193]) {
      expect(validMynaSize(size, 1080)).toBe(false)
      expect(() => createMynaPage('studio', size, 1080)).toThrow()
    }
    expect(validMynaSize(100, 8192)).toBe(true)
    expect(() => createMynaPage('unknown', 1080, 1080)).toThrow()
  })
})
