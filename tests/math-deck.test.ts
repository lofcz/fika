import { describe, expect, it } from '@rstest/core'
import { containsTexSource, isTexFormulaSource } from '@/utils/markdown'
import { deckHasMath, htmlContainsMath } from '@/utils/math'

describe('deck math detection', () => {
  it('finds typeset fractions in text boxes', () => {
    const html = '<p><span class="fika-math" data-latex="\\frac{3}{8}">8 3</span></p>'
    expect(htmlContainsMath(html)).toBe(true)
    expect(deckHasMath([{ elements: [{ type: 'text', content: html }] }])).toBe(true)
  })

  it('ignores decks without math', () => {
    expect(deckHasMath([{ elements: [{ type: 'text', content: '<p>3/8</p>' }] }])).toBe(false)
  })
})

describe('tex source', () => {
  it('treats any control word as TeX, not a symbol list', () => {
    expect(isTexFormulaSource(String.raw`\frac{3}{8}`)).toBe(true)
    expect(isTexFormulaSource(String.raw`\sqrt{2}+\sum_{i=1}^{n} i`)).toBe(true)
    expect(isTexFormulaSource(String.raw`\alpha \leq \beta`)).toBe(true)
    expect(isTexFormulaSource('$x^2$')).toBe(true)
    expect(containsTexSource(String.raw`see \int_0^1 x\,dx`)).toBe(true)
    expect(isTexFormulaSource('3/8')).toBe(false)
    expect(containsTexSource('porovnávání zlomků')).toBe(false)
  })
})
