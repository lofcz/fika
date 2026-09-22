import { describe, expect, it } from '@rstest/core'
import { parseExportPages } from '@/views/Myna/exportPages'
describe('Myna export page selection', () => {
  it('preserves explicit order while deduplicating overlapping ranges', () => {
    expect(parseExportPages('5, 1-3, 2, 4–5', 6)).toEqual([4, 0, 1, 2, 3])
  })
  it('rejects malformed, empty, reversed and out-of-range input', () => {
    for (const value of ['', '1,', '0', '4', '2-1', '1.5', '-1', '1-999999999', 'NaN']) expect(parseExportPages(value, 3)).toBeNull()
    expect(parseExportPages('1', 0)).toBeNull()
  })
})
