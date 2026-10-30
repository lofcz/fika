import { describe, expect, it } from '@rstest/core'
import { plainTextToParagraphs } from '../src/utils/textParser'

describe('literal clipboard text', () => {
  it('escapes markup without decoding entities or backslash sequences', () => {
    expect(plainTextToParagraphs(String.raw`<b>literal</b> &amp; C:\new`))
      .toBe(String.raw`<div>&lt;b&gt;literal&lt;/b&gt; &amp;amp; C:\new</div>`)
  })
  it('preserves blank lines and accepts each actual line ending', () => {
    expect(plainTextToParagraphs('first\r\n\r\nsecond\nthird\rfourth'))
      .toBe('<div>first</div><div><br></div><div>second</div><div>third</div><div>fourth</div>')
  })
})
