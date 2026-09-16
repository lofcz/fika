import { describe, expect, it } from '@rstest/core'
import { normalizeAgentText, markdownToHtml, applyTextRunStyle, renderInlineMarkdown, splitLinesPreservingMath } from '../src/utils/markdown'
import { unescapeAgentNewlines } from '../src/utils/agentText'

describe('generated text regression', () => {
  it('normalizes real, escaped and double escaped LF/CRLF/CR without leftover slashes', () => {
    for (const divider of ['\n', '\r\n', '\r', String.raw`\n`, String.raw`\r\n`, String.raw`\r`, String.raw`\\n`, String.raw`\\r\\n`]) {
      const result = normalizeAgentText(`Náradie${divider}**Rýľ**`)
      expect(result).toBe('Náradie\n**Rýľ**')
      expect(normalizeAgentText(result)).toBe(result)
      expect(splitLinesPreservingMath(`Náradie${divider}**Rýľ**`)).toEqual(['Náradie', '**Rýľ**'])
    }
  })
  it('preserves code spans, fenced examples and TeX control words', () => {
    const code = '`\\n` and ``\\r\\n``\n~~~js\nconst x = "\\n";\n~~~\n```js\nconst y = "\\r";\n```'
    expect(unescapeAgentNewlines(code)).toBe(code)
    expect(normalizeAgentText(String.raw`Prvý\n$\nu + \rho + \nabla$`)).toBe('Prvý\n' + String.raw`$\nu + \rho + \nabla$`)
  })
  it('creates styled editable runs with nested emphasis, links, strike and line breaks', async () => {
    const html = applyTextRunStyle(await markdownToHtml(String.raw`**Náradie _na pôdu_**\r\n- **Rýľ** a ~~lopata~~\n- ` + '`\\n`' + ' [Zdroj](https://example.com)'), { fontSize: 32, fontName: 'Arial', color: '#112233' })
    expect(html).toContain('<strong>Náradie <em>na pôdu</em></strong>')
    expect(html).toContain('<s>lopata</s>')
    expect(html).toContain('<code>\\n</code>')
    expect(html).toContain('font-size:32px')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('<ul')
    expect(html).not.toContain('\\r')
  })
  it('keeps hard breaks and literal HTML safe in inline layout slots', () => {
    const html = renderInlineMarkdown(String.raw`**Rýľ**\\n<i>pôda</i>`)
    expect(html).toContain('<strong>Rýľ</strong><br>')
    expect(html).toContain('&lt;i&gt;pôda&lt;/i&gt;')
    expect(html).not.toContain('\\')
  })
})

describe('CommonMark source boundaries', () => {
  it('preserves mismatched inner backticks and nested/unclosed fenced code', () => {
    const cases = [
      '``alpha ` \\n beta``',
      '````js\n```\nconst x = "\\n";\n````',
      '> ~~~js\n> const x = "\\r\\n";\n> ~~~',
      '~~~js\nconst x = "\\n";',
      '    const x = "\\r\\n";\n',
    ];
    for (const source of cases) expect(normalizeAgentText(source)).toBe(source);
  });
  it('keeps code entities and link destinations byte-for-byte while decoding labels', () => {
    const source = '[label\\nnext](https://example.com/a\\name) and `&amp; \\n`';
    expect(normalizeAgentText(source)).toBe('[label\nnext](https://example.com/a\\name) and `&amp; \\n`');
  });
  it('protects dollar, bracket and environment math including numeric-leading formulas', () => {
    const cases = [String.raw`$6\,\mathrm{CO}_2 + \nu$`, String.raw`\(\nu + \rho\)`, String.raw`\[\nabla\]`, String.raw`\begin{align}\nu + \rho\end{align}`];
    for (const source of cases) expect(normalizeAgentText(source)).toBe(source);
  });
  it('treats unmatched inline backticks as prose and recovers lower-case next lines', () => {
    expect(normalizeAgentText('text `unfinished\\nnext')).toBe('text `unfinished\nnext');
  });
});
