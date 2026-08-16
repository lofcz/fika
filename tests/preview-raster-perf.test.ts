import { describe, expect, it } from '@rstest/core'
import { collectSlidePreviewSrcs, previewPaintHasMedia } from '../src/utils/imageBitmapCache'
import { isAxisAlignedRectPath, isSimpleShape, shapeTextIsEmpty } from '../src/utils/simpleShape'
import { resolveLiveTextPaint } from '../src/utils/textContrast'

describe('simple shape fast path', () => {
  it('keeps unadorned paths off the group/booth path', () => {
    expect(isSimpleShape({
      type: 'shape',
      path: 'M0 0 H10 V10 Z',
      viewBox: [10, 10],
      width: 10,
      height: 10,
      left: 0,
      top: 0,
      rotate: 0,
    } as never)).toBe(true)
  })

  it('keeps shadows, flips, text, and patterns on the full painter', () => {
    expect(isSimpleShape({
      type: 'shape',
      path: 'M0 0',
      viewBox: [1, 1],
      width: 10,
      height: 10,
      left: 0,
      top: 0,
      rotate: 15,
    } as never)).toBe(false)
    expect(isSimpleShape({
      type: 'shape',
      path: 'M0 0',
      viewBox: [1, 1],
      width: 10,
      height: 10,
      left: 0,
      top: 0,
      rotate: 0,
      text: { content: '<p>Hi</p>' },
    } as never)).toBe(false)
  })

  it('treats empty imported shape text as no text', () => {
    expect(shapeTextIsEmpty('')).toBe(true)
    expect(shapeTextIsEmpty('<p></p>')).toBe(true)
    expect(shapeTextIsEmpty('<p><br></p>')).toBe(true)
  })

  it('recognizes imported PPTX rect paths', () => {
    expect(isAxisAlignedRectPath('M 0 0 L 200 0 L 200 200 L 0 200 Z', [200, 200])).toBe(true)
    expect(isAxisAlignedRectPath('M0 0 H720 V405 H0 Z', [720, 405])).toBe(true)
    expect(isAxisAlignedRectPath('M 0 0 L 10 0 L 10 5 L 0 3 Z', [10, 5])).toBe(false)
  })
})

describe('preview image src collection', () => {
  it('includes background, pictures, posters, and shape patterns', () => {
    expect(collectSlidePreviewSrcs({
      id: 's',
      elements: [
        { id: 'img', type: 'image', src: 'photo', width: 10, height: 10, left: 0, top: 0, rotate: 0 },
        { id: 'vid', type: 'video', src: 'clip', poster: 'still', width: 10, height: 10, left: 0, top: 0, rotate: 0 },
        { id: 'shp', type: 'shape', pattern: 'fill', width: 10, height: 10, left: 0, top: 0, rotate: 0, viewBox: [1, 1], path: 'M0 0' },
      ],
      background: { type: 'image', image: { src: 'bg', size: 'cover' } },
    } as never)).toEqual(['bg', 'photo', 'still', 'fill'])
  })

  it('does not treat a covering blit as settled while an image src is missing', () => {
    expect(previewPaintHasMedia(new Set(['photo']), ['photo', 'bg'])).toBe(false)
    expect(previewPaintHasMedia(new Set(['photo', 'bg']), ['photo', 'bg'])).toBe(true)
  })
})

describe('raster contrast', () => {
  const dark = {
    background: { type: 'solid' as const, color: '#0b1220' },
    themeBackgroundColor: '#0b1220',
    themeFontColor: '#333333',
  }
  const cream = {
    background: { type: 'solid' as const, color: '#F6EBD4' },
    themeBackgroundColor: '#F6EBD4',
    themeFontColor: '#333333',
  }

  it('rewrites default ink to a light color on a dark slide', () => {
    const { ink, html } = resolveLiveTextPaint('#333333', '<p style="color: #333333">AI Workshop</p>', {
      background: dark.background,
      fallbackSurface: dark.themeBackgroundColor,
      themeFontColor: dark.themeFontColor,
    })
    expect(ink.toLowerCase()).toBe('#ffffff')
    expect(html.toLowerCase()).not.toContain('color: #333333')
  })

  it('rewrites default ink to black on a cream slide', () => {
    const { ink } = resolveLiveTextPaint('#333333', '<p style="color: #333333">Hello</p>', {
      background: cream.background,
      fallbackSurface: cream.themeBackgroundColor,
      themeFontColor: cream.themeFontColor,
    })
    expect(ink.toLowerCase()).toBe('#000000')
  })

  it('leaves explicit saturated blue alone', () => {
    const { ink, html } = resolveLiveTextPaint('#2563eb', '<p style="color: #2563eb">Hello</p>', {
      background: dark.background,
      fallbackSurface: dark.themeBackgroundColor,
      themeFontColor: dark.themeFontColor,
    })
    expect(ink.toLowerCase()).toBe('#2563eb')
    expect(html.toLowerCase()).toContain('#2563eb')
  })

  it('keeps white overlay labels on a dark chip instead of rewriting to slide-paper black', () => {
    const chip = {
      id: 'chip',
      type: 'shape' as const,
      left: 0,
      top: 0,
      width: 40,
      height: 40,
      rotate: 0,
      viewBox: [200, 200] as [number, number],
      path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
      fill: '#626c3b',
    }
    const label = {
      id: 'num',
      type: 'shape' as const,
      left: 0,
      top: 0,
      width: 40,
      height: 40,
      rotate: 0,
      viewBox: [200, 200] as [number, number],
      path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
      fill: '',
      text: { content: '<p style="color: #ffffff">1</p>', defaultColor: '#333333' },
    }
    const live = resolveLiveTextPaint('#333333', label.text.content, {
      element: label,
      elements: [chip, label],
      background: { type: 'solid' as const, color: '#ffffff' },
      fallbackSurface: '#ffffff',
      themeFontColor: '#333333',
    })
    expect(live.ink.toLowerCase()).toBe('#ffffff')
    expect(live.html.toLowerCase()).toContain('#ffffff')
    expect(live.html.toLowerCase()).not.toMatch(/color:\s*#000000/)
  })
})
