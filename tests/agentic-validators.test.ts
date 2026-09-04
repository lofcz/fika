import { describe, expect, it } from '@rstest/core'
import { assertColorFields } from '@/embed/agentic/validators'

describe('assertColorFields', () => {
  it('accepts the empty string the importer and reads use for "no fill"', () => {
    // Exactly what `pptx_read` returns for an imported text box; a read → write
    // round-trip (copy an element's style) must not be rejected.
    expect(() => assertColorFields({ type: 'text', fill: '', defaultColor: '#000000' }, 'element')).not.toThrow()
    expect(() => assertColorFields({ fill: '', outline: { color: 'transparent' } }, 'patch')).not.toThrow()
  })

  it('still rejects malformed colors', () => {
    expect(() => assertColorFields({ fill: 'not a color;' }, 'element')).toThrow(/valid color/)
    expect(() => assertColorFields({ fill: 12 }, 'element')).toThrow(/must be a string/)
    expect(() => assertColorFields({ fill: null }, 'element')).toThrow(/must be a string/)
  })
})
