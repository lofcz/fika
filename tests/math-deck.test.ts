import { describe, expect, it } from '@rstest/core'
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
