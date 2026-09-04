import { describe, expect, it } from '@rstest/core'
import { applyTextRunStyle, markdownToHtml } from '@/utils/markdown'

describe('applyTextRunStyle', () => {
  it('wraps paragraph content in one styled span and sets alignment', async () => {
    const html = await markdownToHtml('Jak program **běží**')
    const styled = applyTextRunStyle(html, { fontSize: 44, fontName: 'Calibri', color: '#0F172A', bold: true, align: 'left' })
    expect(styled).toBe('<p style="text-align:left"><span style="font-size:44px;font-family:Calibri;color:#0F172A"><strong>Jak program <strong>běží</strong></strong></span></p>')
  })

  it('styles list items and mirrors size/color onto the list container', async () => {
    const html = await markdownToHtml('- Napiš kód\n- Spusť program')
    const styled = applyTextRunStyle(html, { fontSize: 28, fontName: 'Calibri', color: 'rgb(0, 0, 0)' })
    expect(styled).toContain('<ul style="font-size:28px;color:rgb(0, 0, 0)">')
    expect(styled).toContain('<li><span style="font-size:28px;font-family:Calibri;color:rgb(0, 0, 0)">Napiš kód</span></li>')
    expect(styled).toContain('<li><span style="font-size:28px;font-family:Calibri;color:rgb(0, 0, 0)">Spusť program</span></li>')
  })

  it('leaves nested list structure intact', async () => {
    const html = await markdownToHtml('- Parent\n  - Child')
    const styled = applyTextRunStyle(html, { fontSize: 20 })
    expect(styled).toContain('<li><span style="font-size:20px">Parent</span>')
    expect(styled).toContain('<li><span style="font-size:20px">Child</span></li>')
    expect((styled.match(/<ul/g) ?? []).length).toBe(2)
    expect((styled.match(/<\/ul>/g) ?? []).length).toBe(2)
  })

  it('is a no-op without a style or with an empty style', async () => {
    const html = await markdownToHtml('Plain')
    expect(applyTextRunStyle(html, undefined)).toBe(html)
    expect(applyTextRunStyle(html, {})).toBe(html)
  })
})
