import { describe, expect, it } from '@rstest/core'
import { stripXmlIllegalChars, validateOmmlFragment } from '../src/utils/latexToOmml'

describe('OMML export sanitation', () => {
  it('drops characters XML 1.0 forbids but keeps tab / newline / text', () => {
    expect(stripXmlIllegalChars('\u0005ext{nA}')).toBe('ext{nA}')
    expect(stripXmlIllegalChars('a\u0000b\u001fc￾d')).toBe('abcd')
    expect(stripXmlIllegalChars('x\ty\nz\r')).toBe('x\ty\nz\r')
    expect(stripXmlIllegalChars('π ≠ 😀')).toBe('π ≠ 😀')
    expect(stripXmlIllegalChars('lone\uD83Dsurrogate')).toBe('lonesurrogate')
  })

  it('validates OMML the same way pptxgenjs does', () => {
    expect(validateOmmlFragment('<m:oMath><m:r><m:t>a&lt;b</m:t></m:r></m:oMath>')).toBeNull()
    expect(validateOmmlFragment('<m:oMath><m:r><m:t>\u0005</m:t></m:r></m:oMath>')).toMatch(/character/i)
    expect(validateOmmlFragment('<m:oMath><m:r><m:t>a<b</m:t></m:r></m:oMath>')).not.toBeNull()
  })
})
