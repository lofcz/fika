import { describe, expect, it } from '@rstest/core'
import { containsTexSource, isTexFormulaSource } from '@/utils/markdown'
import { latexFallbackText } from '@/utils/inlineMathBox'
import { deckHasMath, estimateInlineMathBox, htmlContainsMath, normalizeImportedLatex } from '@/utils/math'

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

describe('latex fallback text', () => {
  it('keeps a readable stand-in for quadratic and fraction latex', () => {
    expect(latexFallbackText(String.raw`ax^2 + bx + c = 0`)).toBe('ax² + bx + c = 0')
    expect(latexFallbackText(String.raw`a \neq 0`)).toBe('a ≠ 0')
    expect(latexFallbackText(String.raw`\frac{1}{3} = \frac{4}{12}`)).toBe('(1)/(3) = (4)/(12)')
  })
})

describe('inline math box estimate', () => {
  it('makes stacked fractions taller than a simple symbol', () => {
    const frac = estimateInlineMathBox(String.raw`\frac{-b\pm\sqrt{D}}{2a}`, 20, false)
    const simple = estimateInlineMathBox('x', 20, false)
    expect(frac.height).toBeGreaterThan(simple.height)
    expect(frac.width).toBeGreaterThan(simple.width)
  })
})

describe('normalizeImportedLatex', () => {
  it('decodes XML entities with the entities decoder', () => {
    expect(normalizeImportedLatex('\\frac{3}{8}&lt;\\frac{5}{8}')).toBe('\\frac{3}{8}<\\frac{5}{8}')
  })

  it('unwraps the \\< artifact left by encoding & then HTML-decoding', () => {
    expect(normalizeImportedLatex('\\frac{3}{8}\\<\\frac{5}{8}')).toBe('\\frac{3}{8}<\\frac{5}{8}')
  })
})
