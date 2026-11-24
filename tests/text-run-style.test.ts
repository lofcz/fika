import { describe, expect, it } from '@rstest/core'
import {
  applyTextRunStyle,
  extractDominantTextRunStyle,
  markdownToHtml,
  mergeTextRunStyles,
} from '@/utils/markdown'

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

  it('preserves distinct markerColor and list layout properties on list containers', async () => {
    const html = await markdownToHtml('- Primární cívka\n- Sekundární cívka')
    const styled = applyTextRunStyle(html, {
      fontSize: 36,
      fontName: 'Lato',
      color: '#2B3445',
      markerColor: '#D25F2B',
      listStylePosition: 'outside',
      listPaddingLeft: '0.4em',
      listMargin: '0',
    })
    expect(styled).toContain('<ul style="font-size:36px;color:#D25F2B;list-style-position:outside;padding-left:0.4em;margin:0">')
    expect(styled).toContain('<li><span style="font-size:36px;font-family:Lato;color:#2B3445">Primární cívka</span></li>')
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

describe('extractDominantTextRunStyle', () => {
  it('extracts dominant size, font, text color, and distinct list marker styles from compiled bullet lists', () => {
    const html = '<ul style="font-size:36px;color:#D25F2B;list-style-position:outside;padding-left:0.4em;margin:0">'
      + '<li><span style="font-size:36px;color:#2B3445;font-family:Lato"><strong>Primární cívka</strong> vytváří magnetické pole</span></li>'
      + '<li><span style="font-size:36px;color:#2B3445;font-family:Lato">Sekundární cívka indukuje napětí</span></li>'
      + '</ul>'
    expect(extractDominantTextRunStyle(html)).toEqual({
      fontSize: 36,
      fontName: 'Lato',
      color: '#2B3445',
      markerColor: '#D25F2B',
      listStylePosition: 'outside',
      listPaddingLeft: '0.4em',
      listMargin: '0',
    })
  })

  it('detects whole-run boldness on headings without marking partially bold body bullets as bold', () => {
    const heading = '<p style="text-align:center"><span style="font-size:40px;color:#1E293B;font-family:Montserrat"><strong>Jak funguje transformátor</strong></span></p>'
    expect(extractDominantTextRunStyle(heading)).toEqual({
      fontSize: 40,
      fontName: 'Montserrat',
      color: '#1E293B',
      bold: true,
      align: 'center',
    })

    const partialBoldBullets = '<ul style="font-size:28px;color:#2B3445">'
      + '<li><span style="font-size:28px;color:#2B3445;font-family:Lato"><strong>Jádro</strong> vede magnetický tok</span></li>'
      + '</ul>'
    const extracted = extractDominantTextRunStyle(partialBoldBullets)
    expect(extracted.bold).toBeUndefined()
    expect(extracted.fontSize).toBe(28)
    expect(extracted.markerColor).toBeUndefined()
  })

  it('ignores MathLive internal spans and supports text-fit calc() sizes and defaults fallback', () => {
    const html = '<p><span style="font-size:calc(var(--text-fit-scale, 1) * 34px);color:#2B3445">'
      + 'Poměr napětí <eq><span class="fika-math"><span style="font-family:KaTeX_Main;font-size:12px"><strong>U</strong></span></span></eq> platí vždy'
      + '</span></p>'
    expect(extractDominantTextRunStyle(html, { defaultFontName: 'Lato', defaultColor: '#000000' })).toEqual({
      fontSize: 34,
      fontName: 'Lato',
      color: '#2B3445',
    })
  })

  it('merges explicit overrides on top of inherited style including explicit bold: false', () => {
    const inherited = { fontSize: 40, fontName: 'Lato', color: '#2B3445', bold: true, align: 'center' as const }
    expect(mergeTextRunStyles(inherited, { fontSize: 24, bold: false, color: '#000000' })).toEqual({
      fontSize: 24,
      fontName: 'Lato',
      color: '#000000',
      bold: false,
      align: 'center',
    })
  })
})
