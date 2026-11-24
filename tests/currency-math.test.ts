import { describe, expect, it, rs } from '@rstest/core'
import { markdownMathSegments, normalizeGeneratedMarkdown } from '../src/text'
import { containsMath, markdownToHtml, renderInlineMarkdown } from '../src/utils/markdown'

rs.mock('../src/utils/math', () => ({
  ensureMathliveReady: async () => {},
  texmathEngine: { renderToString: (value: string) => '<span data-latex="' + value + '"></span>' },
}))

describe('single-dollar math boundaries', () => {
  const cases: [string, string[]][] = [
    ['Drive gear $24 + labor $48', []],
    ['$5.00 price less $2.60 variable cost', []],
    ['$48,000 ÷ $19,200 per year', []],
    ['$1,600–$2,400, $5/$.50, and $8', []],
    ['The $ sign costs $5.', []],
    ['The price is $8. No closing delimiter.', []],
    [String.raw`Price \$5 and \$10, literally \$x\$`, []],
    ['Pay $5 for $x^2$ or $2+2$ and save $3.', ['x^2', '2+2']],
    ['Pay $5 ($x$), then $10.', ['x']],
    ['Try $x + y$; $2$; $2.5 + 3.1$.', ['x + y', '2', '2.5 + 3.1']],
    ['First $5\nsecond $x^2$', ['x^2']],
    [String.raw`$\text{cost \$5}$ and \$7`, [String.raw`\text{cost \$5}`]],
    [String.raw`A backslash \\$2+2$ and money \$4`, ['2+2']],
    ['Code `$2+2$`, then $3, $4 and **$a^2$**.', ['a^2']],
  ]

  for (const [source, formulas] of cases) {
    it(source, async () => {
      const segments = markdownMathSegments(source)
      expect(segments.map(s => s.raw).join('')).toBe(source)
      expect(segments.filter(s => s.type === 'math').map(s => s.value)).toEqual(formulas)
      expect(containsMath(source)).toBe(formulas.length > 0)
      const html = await markdownToHtml(source)
      expect([...html.matchAll(/data-latex="([^"]*)"/g)].map(m => m[1])).toEqual(formulas)
      expect(renderInlineMarkdown(source)).toBe(html.slice(3, -4))
      if (!formulas.length && !source.includes('\\')) expect(html).toBe('<p>' + source + '</p>')
    })
  }

  it('keeps Markdown escapes distinguishable when the editor reparses stored HTML', async () => {
    expect(await markdownToHtml(String.raw`\$x\$`))
      .toBe('<p><span data-literal-dollar>$</span>x<span data-literal-dollar>$</span></p>')
  })

  it('preserves TeX and display math while decoding prose between prices', () => {
    const source = String.raw`Pay $5\nthen $10. Use $\nu$ or $$\rho$$.`
    expect(normalizeGeneratedMarkdown(source)).toBe(source.replace('\\nthen', '\nthen'))
    expect(markdownMathSegments(source).filter(s => s.type === 'math').map(s => [s.value, s.display]))
      .toEqual([['\\nu', false], ['\\rho', true]])
  })
})
