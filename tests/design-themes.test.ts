import { afterEach, describe, expect, it } from '@rstest/core'
import { resolveDesignThemes, setFikaDesignThemes, listFikaDesignThemes, getFikaDesignTheme, useDesignThemes, type FikaDesignTheme } from '@/configs/designThemes'
import { applyDesignTheme } from '@/utils/applyDesignTheme'
import type { Slide, SlideTheme } from '@/types/slides'
import { matchPresetTheme, PRESET_THEMES, resolvePresetBackground } from '@/configs/theme'
import tinycolor from 'tinycolor2'

const paper: FikaDesignTheme = {
  id: 'host-paper', name: 'Paper', background: '#FAF8F4', fontColor: '#2B3445',
  fontname: 'Inter', colors: ['#D25F2B', '#2A7FA3'],
}
afterEach(() => setFikaDesignThemes())
describe('embed design catalog', () => {
  it('replaces defaults in host order and uses custom presets for layout matching', () => {
    setFikaDesignThemes([paper, { ...paper, id: 'white', name: 'White', colors: ['#365FA0'], background: '#FFFFFF' }])
    const themes = useDesignThemes.getState().themes
    expect(themes.map(theme => theme.id)).toEqual(['host-paper', 'white'])
    expect(matchPresetTheme(paper.colors, themes)?.id).toBe('host-paper')
    expect(resolvePresetBackground(themes[0])).toEqual({ type: 'solid', color: '#FAF8F4' })
  })
  it('supports an empty catalog and restores defaults without sharing mutable arrays', () => {
    setFikaDesignThemes([])
    expect(useDesignThemes.getState().themes).toEqual([])
    setFikaDesignThemes()
    expect(useDesignThemes.getState().themes).toEqual(PRESET_THEMES)
    expect(useDesignThemes.getState().themes).not.toBe(PRESET_THEMES)
    const source = [{ ...paper, colors: [...paper.colors] }]
    setFikaDesignThemes(source)
    source[0].colors[0] = '#000000'
    expect(useDesignThemes.getState().themes[0].colors[0]).toBe('#D25F2B')
  })
  it('rejects invalid catalogs before changing the active configuration', () => {
    setFikaDesignThemes([paper])
    expect(() => setFikaDesignThemes([paper, paper])).toThrow(/Duplicate/)
    expect(() => resolveDesignThemes([{ ...paper, colors: [] }])).toThrow(/accent/)
    expect(() => resolveDesignThemes([{ ...paper, background: 'invalid' }])).toThrow(/color/)
    expect(useDesignThemes.getState().themes[0].id).toBe('host-paper')
  })
})


describe('host design application shared by picker and agent', () => {
  it('applies tech headings and readable panel/table/badge ink without changing geometry', () => {
    const tech = { ...paper, id: 'tech', background: '#0F172A', fontColor: '#F1F5F9', headingFontColor: '#2ECC71', colors: ['#2ECC71', '#67D8F5'], preserveColorRoles: true };
    const theme: SlideTheme = { backgroundColor: paper.background, fontColor: paper.fontColor, fontName: 'Inter', themeColors: paper.colors, outline: {}, shadow: { h: 0, v: 0, blur: 0, color: '#000' } };
    const text = (id: string, top: number): Slide['elements'][number] => ({ id, type: 'text', left: 20, top, width: 400, height: 50, rotate: 0, defaultColor: '#2B3445', defaultFontName: 'Inter', content: '<p style="color:#2B3445;font-size:24px">Keep text</p>', textType: id === 'title' ? 'title' : 'content' });
    const slide: Slide = { id: 'slide', elements: [text('title', 20), text('body', 100), { id: 'badge', type: 'shape', left: 20, top: 200, width: 40, height: 40, rotate: 0, path: '', viewBox: [40,40], fixedRatio: false, fill: paper.colors[0], text: { align: 'middle', defaultColor: '#fff', defaultFontName: 'Inter', content: '<p style="color:#fff">1</p>' } }] };
    const result = applyDesignTheme([slide], theme, tech);
    const [title, body, badge] = result.slides[0].elements;
    expect(title.type === 'text' && title.defaultColor).toBe(tech.headingFontColor);
    expect(title.type === 'text' && title.content).toContain(tech.headingFontColor);
    expect(body.type === 'text' && body.defaultColor).toBe(tech.fontColor);
    expect(badge.type === 'shape' && tinycolor.readability(badge.fill, badge.text!.defaultColor)).toBeGreaterThanOrEqual(4.5);
    expect(result.theme.headingFontColor).toBe(tech.headingFontColor);
    expect(result.slides[0].elements.map(({ id, left, top, width }) => ({ id, left, top, width }))).toEqual(slide.elements.map(({ id, left, top, width }) => ({ id, left, top, width })));
    expect(applyDesignTheme(result.slides, result.theme, tech).slides).toEqual(result.slides);
  });
  it('discovers and applies the active host design without changing content or the input', () => {
    setFikaDesignThemes([paper])
    expect(listFikaDesignThemes().map(item => item.id)).toEqual(['host-paper'])
    expect(() => getFikaDesignTheme('aurora')).toThrow(/Unknown design/)
    const current: SlideTheme = { backgroundColor: '#FFFFFF', fontColor: '#000000', fontName: 'Arial', themeColors: ['#123456'], outline: { color: '#123456', width: 1, style: 'solid' }, shadow: { h: 0, v: 2, blur: 8, color: '#000000' }, styleId: 'house-templates' }
    const slides: Slide[] = [{ id: 'first', elements: [{ id: 'text', type: 'text', left: 20, top: 30, width: 400, height: 50, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p style="font-size:24px;color:#000000">My material</p>' }] }, { id: 'second', elements: [] }]
    const original = structuredClone(slides)
    const result = applyDesignTheme(slides, current, getFikaDesignTheme('host-paper'))
    expect(result.slides.map(slide => slide.id)).toEqual(['first', 'second'])
    expect(result.slides.every(slide => slide.background?.color === paper.background)).toBe(true)
    expect(result.theme.themeColors).toEqual(paper.colors)
    expect(result.theme.styleId).toBe('house-templates')
    const text = result.slides[0].elements[0]
    expect(text.type === 'text' && text.defaultFontName).toBe('Inter')
    expect(text.type === 'text' && text.content).toContain('My material')
    expect(text.type === 'text' && text.content).toContain('font-size:24px')
    expect(slides).toEqual(original)
    expect(current.fontName).toBe('Arial')
  })
})

it('restyles legacy dark feature slides with soft panels and readable badges, consistently on reapply', () => {
  const current: SlideTheme = { backgroundColor: paper.background, fontColor: paper.fontColor, fontName: 'Inter', themeColors: paper.colors, outline: { color: '#eee', width: 1, style: 'solid' }, shadow: { h: 0, v: 0, blur: 0, color: '#000' } };
  const elements: Slide['elements'] = [
    { id: 'panel', type: 'shape', left: 100, top: 100, width: 600, height: 200, rotate: 0, path: '', viewBox: [100, 100], fixedRatio: false, fill: '#2A3D5C' },
    { id: 'copy', type: 'text', left: 120, top: 120, width: 500, height: 100, rotate: 0, content: '<p style="color:#ffffff;font-size:30px">Feature</p>', defaultColor: '#fff', defaultFontName: 'Inter' },
    { id: 'badge', type: 'shape', left: 800, top: 100, width: 60, height: 60, rotate: 0, path: '', viewBox: [100, 100], fixedRatio: false, fill: paper.colors[1], text: { content: '<p style="color:#fff">1</p>', defaultColor: '#fff', defaultFontName: 'Inter', align: 'middle' } },
  ];
  const result = applyDesignTheme([{ id: 'legacy', background: { type: 'solid', color: '#1B2A41' }, elements }], current, { ...paper, preserveColorRoles: true });
  expect(result.slides[0].background?.color).toBe(paper.background);
  const [panel, copy, badge] = result.slides[0].elements;
  expect(panel.type === 'shape' && panel.fill).not.toBe(paper.colors[0]);
  expect(copy.type === 'text' && copy.defaultColor).toBe(paper.fontColor);
  expect(copy.type === 'text' && copy.content).toContain(paper.fontColor);
  expect(badge.type === 'shape' && badge.text?.defaultColor).toBe('#ffffff');
  const again = applyDesignTheme(result.slides, result.theme, { ...paper, preserveColorRoles: true });
  expect(again.slides).toEqual(result.slides);
});
