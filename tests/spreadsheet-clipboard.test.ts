import { describe, expect, it, rs } from '@rstest/core'
rs.mock('../src/i18n/getLL', () => ({ getLL: () => ({}) }))
import { pasteExcelClipboardString } from '../src/utils/clipboard'

describe('spreadsheet clipboard TSV', () => {
  it('preserves quoted line breaks, tabs, and escaped quotes inside cells', () => {
    expect(pasteExcelClipboardString('"First\r\nsecond"\t"Say ""Hi"""\r\n"A\tB"\tC\r\n'))
      .toEqual([['First\nsecond', 'Say "Hi"'], ['A\tB', 'C']])
  })
  it('preserves empty cells and accepts platform line endings', () => {
    for (const newline of ['\n', '\r', '\r\n']) {
      expect(pasteExcelClipboardString(`A\t${newline}\tB${newline}`)).toEqual([['A', ''], ['', 'B']])
    }
  })
  it('leaves plain text and malformed or ragged data to the text paste path', () => {
    for (const text of ['', 'ordinary text', '"unfinished\tB', 'A\tB\nC', '"A"oops\tB']) {
      expect(pasteExcelClipboardString(text)).toBeNull()
    }
  })
})
