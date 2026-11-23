import { describe, expect, it } from '@rstest/core'
import PptxGen from 'pptxgenjs-plus'
import { JSZip } from '@node-projects/jszip'
import { applyPptxLanguage } from '../src/utils/exportLanguage'
import { pptxLanguageTag } from '../src/configs/exportLanguage'
import { recordPptxExport, type PptxExportCommand } from '../src/utils/pptxExportCommands'

async function replay(commands: PptxExportCommand[]) {
  const deck = new PptxGen()
  const slides: any[] = []
  for (const command of commands) {
    const target: any = command.target === -1 ? deck : slides[command.target]
    if (command.args) {
      const result = await target[command.property](...command.args)
      if (command.slide !== undefined) slides[command.slide] = result
    } else target[command.property] = command.value
  }
  const zip = await JSZip.loadAsync(await deck.write({ outputType: 'arraybuffer' }) as ArrayBuffer)
  return zip.file('ppt/slides/slide1.xml')!.async('string')
}

describe('PPTX proofing language', () => {
  it('turns BCP-47 tags into the region-qualified tags PowerPoint knows', () => {
    expect(pptxLanguageTag('cs')).toBe('cs-CZ')
    expect(pptxLanguageTag('sk')).toBe('sk-SK')
    expect(pptxLanguageTag('pl-PL')).toBe('pl-PL')
    expect(pptxLanguageTag('en')).toBe('en-US')
    expect(pptxLanguageTag('not a tag')).toBeNull()
    expect(pptxLanguageTag('')).toBeNull()
    expect(pptxLanguageTag(undefined)).toBeNull()
  })

  it('tags text runs, table cells and paragraph ends, keeping explicit languages', async () => {
    const { pptx, commands } = recordPptxExport()
    const slide = pptx.addSlide()
    slide.addText([
      { text: 'Příliš žluťoučký kůň ', options: { bold: true } },
      { text: 'carpe diem', options: { lang: 'la' } },
    ], { x: 0, y: 0, w: 4, h: 1 })
    slide.addText('Úpěl ďábelské ódy', { x: 0, y: 1, w: 4, h: 1 })
    slide.addTable([[{ text: 'Řešení' }, { text: 'Výsledek', options: { bold: true } }]], { x: 0, y: 2, w: 4 })
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 3, w: 1, h: 1 })
    applyPptxLanguage(commands, pptxLanguageTag('cs'))
    const xml = await replay(commands)
    expect(xml).not.toMatch(/lang="en-US"(?! )/)
    expect(xml.match(/<a:rPr lang="cs-CZ"/g)?.length).toBeGreaterThanOrEqual(4)
    expect(xml).toContain('lang="la"')
    expect(xml).not.toMatch(/<a:rPr lang="en-US"/)
    expect(xml).not.toMatch(/<a:endParaRPr lang="en-US"/)
  })

  it('leaves the deck untouched without a language', async () => {
    const { pptx, commands } = recordPptxExport()
    pptx.addSlide().addText('Hello', { x: 0, y: 0, w: 4, h: 1 })
    const before = JSON.stringify(commands)
    applyPptxLanguage(commands, null)
    expect(JSON.stringify(commands)).toBe(before)
  })
})
