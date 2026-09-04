import { describe, expect, it } from '@rstest/core'
import { deckHasAuthoredStyle, inferStylePresetFromDeck } from '@/embed/agentic/inheritedStyle'
import type { PPTTextElement, Slide } from '@/types/slides'

/**
 * The pptx importer nests one <span> per property. This is the exact markup an
 * imported Calibri deck carried in production; a flat "innermost span only"
 * regex saw zero runs here and inherited the default (Arial 40px) preset.
 */
const nestedSpan = (text: string, size: number, color = 'rgb(0, 0, 0)', font = 'Calibri') =>
  `<p style="line-height: 1.2;"><strong><span style="font-size: ${size}px;"><span style="font-family: ${font};"><span style="color: ${color};">${text}</span></span></span></strong></p>`

const bulletList = (items: string[], size: number) =>
  `<ul style="font-size: ${size}px; color: rgb(0, 0, 0);">${items
    .map(
      item =>
        `<li><p style="line-height: 1.32;"><span style="font-size: ${size}px;"><span style="font-family: Calibri;"><span style="color: rgb(0, 0, 0);">${item}</span></span></span></p></li>`,
    )
    .join('')}</ul>`

let nextId = 0
const text = (content: string, box: Partial<PPTTextElement> = {}): PPTTextElement => ({
  id: `t${nextId++}`,
  type: 'text',
  left: 77,
  top: 50,
  width: 1126,
  height: 56,
  rotate: 0,
  content,
  defaultFontName: '',
  defaultColor: '#000000',
  ...box,
})

const slide = (elements: PPTTextElement[]): Slide => ({
  id: `s${nextId++}`,
  elements,
  background: { type: 'solid', color: '#FFFFFF' },
})

const importedDeck: Slide[] = [
  slide([text(nestedSpan('Programování v C#', 44, 'rgb(15, 23, 42)')), text(nestedSpan('Úvod pro 5. třídu', 28, 'rgb(100, 116, 139)'))]),
  slide([
    text(nestedSpan('Spuštění programu', 44, 'rgb(15, 23, 42)')),
    text(bulletList(['1. Napiš kód.', '2. Spusť program tlačítkem ▶.', '3. Sleduj výstup v konzoli.', '4. Změň text a spusť program znovu.'], 28)),
    text(nestedSpan('Console.WriteLine("Moje první aplikace");', 28, 'rgb(15, 23, 42)')),
    text(nestedSpan('Chyba? Přečti si hlášení a zkontroluj závorky, uvozovky a středník.', 22, 'rgb(100, 116, 139)')),
  ]),
  slide([
    text(nestedSpan('Proměnná uchovává hodnotu', 44, 'rgb(15, 23, 42)')),
    text(bulletList(['Proměnná je pojmenovaná krabička.', 'Do krabičky uložíme hodnotu.', 'Hodnotu můžeme později změnit.'], 28)),
  ]),
]

describe('inferStylePresetFromDeck', () => {
  it('reads fonts, sizes and inks through nested importer spans', () => {
    expect(deckHasAuthoredStyle(importedDeck)).toBe(true)
    const preset = inferStylePresetFromDeck(importedDeck, undefined, 1280)
    expect(preset).toBeDefined()
    expect(preset!.fonts.heading).toBe('Calibri')
    expect(preset!.fonts.body).toBe('Calibri')
    expect(preset!.palette.background).toBe('#FFFFFF')
    // slate-900 title ink, not the #000000 element default
    expect(preset!.palette.title).toBe('#0F172A')
    // Scale is expressed on the 1000px reference: 44px @1280 → 34, 28px @1280 → 22.
    expect(preset!.scale.title).toBe(34)
    expect(preset!.scale.body).toBe(22)
  })

  it('does not misfile 28px body copy as a title next to 44px headings', () => {
    const preset = inferStylePresetFromDeck(importedDeck, undefined, 1280)!
    // Body must come from the 28px bullets, not from the 22px captions.
    expect(preset.scale.body).toBeGreaterThanOrEqual(21)
    expect(preset.scale.title).toBeGreaterThan(preset.scale.body)
  })

  it('handles flat single-span markup and paragraph-level styles', () => {
    const flat: Slide[] = [
      slide([
        text('<p style="font-size: 36px; font-family: Georgia; color: #1A2B3C;">Heading</p>'),
        text('<p><span style="font-size: 20px; font-family: Georgia; color: #333333;">A body paragraph with enough text to count as authored content for inheritance.</span></p>'),
      ]),
    ]
    const preset = inferStylePresetFromDeck(flat, undefined, 1000)!
    expect(preset.fonts.heading).toBe('Georgia')
    expect(preset.fonts.body).toBe('Georgia')
    expect(preset.scale.title).toBe(36)
    expect(preset.scale.body).toBe(20)
  })

  it('ignores void tags and self-closing tags when tracking the style stack', () => {
    const withBreaks: Slide[] = [
      slide([
        text('<p><span style="font-size: 40px; font-family: Verdana; color: #222222;">Line one<br/>Line two<br>Line three</span></p>'),
        text('<p><span style="font-size: 24px; font-family: Verdana; color: #444444;">Body text that follows the heading and is long enough.</span></p>'),
      ]),
    ]
    const preset = inferStylePresetFromDeck(withBreaks, undefined, 1000)!
    expect(preset.fonts.heading).toBe('Verdana')
    expect(preset.scale.title).toBe(40)
    expect(preset.scale.body).toBe(24)
  })
})
