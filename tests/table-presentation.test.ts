import { describe, expect, it } from '@rstest/core'
import { escapeCellText, getCellStyle } from '../src/views/components/element/TableElement/utils'

describe('table presentation', () => {
  it('keeps Czech prose breakable at spaces and escapes text without losing line breaks', () => {
    expect(escapeCellText('posílila své velmocenské postavení')).toBe('posílila své velmocenské postavení')
    expect(escapeCellText('A < B & C\r\nD  E')).toBe('A &lt; B &amp; C<br>D  E')
    expect(escapeCellText('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })
  it('keeps the outline for old tables and respects explicit zero-width paper edges', () => {
    const outline = { style: 'solid' as const, width: 1, color: '#ddd' }
    expect(getCellStyle(outline).borderWidth).toBe('1px')
    const style = getCellStyle(outline, { borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 1.5, borderLeftWidth: 0 })
    expect(style.borderTopWidth).toBe(0)
    expect(style.borderRightWidth).toBe(0)
    expect(style.borderBottomWidth).toBe(1.5)
    expect(style.borderLeftWidth).toBe(0)
  })
})
