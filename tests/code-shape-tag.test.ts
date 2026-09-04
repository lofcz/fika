import { describe, expect, it } from '@rstest/core'
import {
  formatCodeShapeName,
  htmlToCodeLines,
  importedCodeFontSize,
  importedCodeSource,
  parseCodeShapeName,
  stripCodeLineNumberGutter,
} from '../src/utils/codeShapeTag'

describe('code shape tag', () => {
  it('round-trips language, theme and gutter through the shape name', () => {
    const name = formatCodeShapeName({ language: 'csharp', theme: 'github-dark', showLineNumbers: true })
    expect(name).toBe('fika:code:csharp:github-dark:1')
    expect(parseCodeShapeName(name)).toEqual({ language: 'csharp', theme: 'github-dark', showLineNumbers: true })
  })

  it('accepts the short python-pptx2 form and resolves aliases', () => {
    expect(parseCodeShapeName('fika:code:py')).toEqual({ language: 'python', theme: 'github-dark', showLineNumbers: false })
    expect(parseCodeShapeName('fika:code')).toEqual({ language: 'typescript', theme: 'github-dark', showLineNumbers: false })
    expect(parseCodeShapeName('fika:code:c#:dracula:0')).toEqual({ language: 'csharp', theme: 'dracula', showLineNumbers: false })
  })

  it('ignores ordinary shape names', () => {
    expect(parseCodeShapeName('TextBox 3')).toBeNull()
    expect(parseCodeShapeName('fika:codex')).toBeNull()
    expect(parseCodeShapeName(undefined)).toBeNull()
  })

  it('turns paragraph HTML into verbatim source lines', () => {
    const html = '<p style="font-size: 14pt;"><span>if (x &lt; 2)</span></p><p><span>{</span></p><p></p><p><span>    return &quot;a&quot;;</span></p><p><span>}</span></p>'
    expect(htmlToCodeLines(html)).toEqual(['if (x < 2)', '{', '', '    return "a";', '}'])
  })

  it('peels the painted gutter off when the tag says line numbers are on', () => {
    const lines = [' 1  const a = 1', ' 2  ', '10  done()']
    expect(stripCodeLineNumberGutter(lines)).toEqual(['const a = 1', '', 'done()'])
    expect(stripCodeLineNumberGutter(['const a = 1', 'done()'])).toEqual(['const a = 1', 'done()'])
    const html = '<p><span> 1  </span><span>let x</span></p><p><span> 2  </span><span>x++</span></p>'
    expect(importedCodeSource(html, { language: 'typescript', theme: 'github-dark', showLineNumbers: true })).toBe('let x\nx++')
    expect(importedCodeSource(html, { language: 'typescript', theme: 'github-dark', showLineNumbers: false })).toBe(' 1  let x\n 2  x++')
  })

  it('scales the declared point size to editor px', () => {
    expect(importedCodeFontSize('<p><span style="font-size: 14pt;">x</span></p>', 1.5)).toBe(21)
    expect(importedCodeFontSize('<p><span>x</span></p>', 1.5)).toBe(18)
  })
})
