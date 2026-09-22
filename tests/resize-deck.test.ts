import { describe, expect, it } from '@rstest/core';
import { resizeDeckSlides } from '@/utils/resizeDeck';
import type { PPTElement, PPTTextElement, Slide } from '@/types/slides';
const wide = { width: 1000, height: 562.5 };
const standard = { width: 1000, height: 750 };
const text = (id: string, left: number, top: number, width: number, height: number): PPTTextElement => ({ id, type: 'text', left, top, width, height, rotate: 0, content: '<p style="font-size:24px">24px stays literal</p>', defaultColor: '#222', defaultFontName: 'Inter' });
const slide = (elements: PPTElement[]): Slide[] => [{ id: 's', elements }];

describe('content-aware deck resizing', () => {
  it('distributes additional height between rows without stretching text or photos', () => {
    const original = slide([text('heading', 50, 30, 900, 50), text('row1', 50, 150, 900, 100), text('row2', 50, 350, 900, 100)]);
    const result = resizeDeckSlides(original, wide, standard);
    const [heading, row1, row2] = result[0].elements;
    expect(row2.top - row1.top).toBeGreaterThan(200);
    expect(heading.width).toBe(900);
    expect(row1.height).toBe(100);
    expect(original[0].elements[2].top).toBe(350);
    const restored = resizeDeckSlides(result, standard, wide)[0].elements[2];
    expect(restored.height).toBe(100);
    expect(restored.top + restored.height).toBeLessThanOrEqual(wide.height);
    expect(row2.top + row2.height).toBeGreaterThan(standard.height * 0.9);
  });
  it('fills independent source columns while keeping each badge, title and URL together', () => {
    const elements: PPTElement[] = [text('heading', 50, 30, 900, 50)];
    for (const [column, left] of [50, 540].entries()) {
      for (let row = 0; row < 3; row++) {
        const top = 130 + row * (column ? 90 : 75);
        elements.push(text(`${column}-${row}-badge`, left, top, 25, 25));
        elements.push(text(`${column}-${row}-title`, left + 40, top, 360, 30));
        elements.push(text(`${column}-${row}-url`, left + 40, top + 30, 360, 20));
      }
    }
    const result = resizeDeckSlides(slide(elements), wide, standard)[0].elements;
    expect(result[0].top).toBe(30);
    for (let i = 1; i < result.length; i += 3) {
      expect(result[i].top).toBeCloseTo(result[i + 1].top);
      expect(result[i + 2].top - result[i + 1].top).toBeCloseTo(30);
    }
    expect(result[9].top + result[9].height).toBeCloseTo(720);
    expect(result[18].top + result[18].height).toBeCloseTo(720);
  });
  it('scales typography, inset, table cells and chart labels together on a smaller canvas', () => {
    const original = slide([text('a', 50, 100, 400, 100), {
      id: 'table', type: 'table', left: 50, top: 240, width: 400, height: 100, rotate: 0, cellMinHeight: 40, colWidths: [1], outline: { color: '#222', width: 2, style: 'solid' }, data: [[{ id: 'c', colspan: 1, rowspan: 1, text: 'Value', style: { fontsize: '20px' } }]],
    }, { id: 'chart', type: 'chart', left: 550, top: 100, width: 400, height: 200, rotate: 0, chartType: 'bar', themeColors: ['#123456'], data: { labels: [], legends: [], series: [] } }]);
    const result = resizeDeckSlides(original, wide, { width: 500, height: 281.25 });
    const [a, table, chart] = result[0].elements;
    expect(a.type === 'text' && a.content).toContain('font-size:12px');
    expect(a.type === 'text' && a.content).toContain('24px stays literal');
    expect(a.type === 'text' && a.inset).toEqual([5, 5, 5, 5]);
    expect(table.type === 'table' && table.cellMinHeight).toBe(20);
    expect(table.type === 'table' && table.data[0][0].style?.fontsize).toBe('10px');
    expect(chart.type === 'chart' && chart.options?.fontSize).toBe(6);
  });
  it('preserves grouped relative positions, media proportions and connector attachment', () => {
    const a = { ...text('a', 50, 50, 200, 50), groupId: 'pair' };
    const b = { ...text('b', 50, 150, 200, 50), groupId: 'pair' };
    const image: PPTElement = { id: 'photo', type: 'image', left: 600, top: 100, width: 300, height: 200, rotate: 0, src: 'x', fixedRatio: true };
    const line: PPTElement = { id: 'line', type: 'line', left: 250, top: 75, width: 2, start: [0, 0], end: [350, 125], style: 'solid', color: '#222', points: ['', 'arrow'] };
    const result = resizeDeckSlides(slide([a, b, image, line]), wide, standard)[0].elements;
    expect(result[1].top - result[0].top).toBe(100);
    expect(result[2].width / result[2].height).toBe(1.5);
    const connector = result[3];
    expect(connector.type === 'line' && connector.left + connector.end[0]).toBeCloseTo(result[2].left);
    expect(connector.type === 'line' && connector.top + connector.end[1]).toBeCloseTo(result[2].top + 100);
  });
  it('fills vector backdrops, anchors decorations, and contains a rotated portrait composition', () => {
    const bg: PPTElement = { id: 'bg', type: 'shape', left: 0, top: 0, width: 1000, height: 562.5, rotate: 0, fill: '#fff', path: '', viewBox: [100, 100], fixedRatio: false };
    const decor = { ...bg, id: 'decor', name: 'Decor', left: 850, top: 0, width: 150, height: 150 };
    const rotated = { ...text('rotated', 250, 150, 400, 100), rotate: 30 };
    const [backdrop, corner, content] = resizeDeckSlides(slide([bg, decor, rotated]), wide, { width: 500, height: 707 })[0].elements;
    expect(backdrop.height).toBe(707);
    expect(corner.left + corner.width).toBe(500);
    expect(content.width).toBe(200);
    expect(content.top).toBeGreaterThan(75);
  });
  it('is immutable and rejects invalid dimensions before transforming', () => {
    const original = slide([text('a', 50, 50, 900, 400)]);
    expect(resizeDeckSlides(original, wide, wide)).toEqual(original);
    expect(() => resizeDeckSlides(original, wide, { width: 0, height: 750 })).toThrow(/positive/);
    expect(() => resizeDeckSlides(original, wide, { width: 1000, height: Infinity })).toThrow(/finite/);
  });
});
