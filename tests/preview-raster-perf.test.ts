import { afterEach, describe, expect, it } from '@rstest/core'
import { collectSlidePreviewSrcs, previewPaintHasMedia } from '../src/utils/imageBitmapCache'
import { isAxisAlignedRectPath, isSimpleShape, shapeTextIsEmpty } from '../src/previewRaster/simpleShape'
import { boothCacheKey } from '../src/previewRaster/boothKey'
import { needsHtmlBooth, readTextPaintLayout, textPaintHtml } from '../src/previewRaster/textPaintHtml'
import { resolveRasterTextPaint } from '../src/previewRaster/painters/contrast'
import { resolveLiveTextPaint } from '../src/utils/textContrast'
import {
  enqueueRaster,
  MAX_CONCURRENT_RASTERS,
  RASTER_PRIORITY_CURRENT,
  RASTER_PRIORITY_VISIBLE,
  resetRasterSchedulerForTests,
} from '../src/previewRaster/scheduler'
import { pickLqElements } from '../src/previewRaster/lqElements'
import { qualityCovers } from '../src/previewRaster/planSlideRaster'
import {
  PREVIEW_LQ_MAX_WORKING,
  PREVIEW_MAX_WORKING,
  PREVIEW_PANE_RESIZE_COMMIT_MS,
  PREVIEW_RAIL_MAX_WORKING,
  previewWorkingWidth,
} from '../src/views/Editor/Thumbnails/paneSize'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

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
    expect(isSimpleShape({
      type: 'shape',
      path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
      viewBox: [200, 200],
      width: 1000,
      height: 562,
      left: 0,
      top: 0,
      rotate: 0,
      fill: '#F6EBD4',
      text: { content: '<p></p>' },
    } as never)).toBe(true)
  })

  it('recognizes imported PPTX rect paths', () => {
    expect(isAxisAlignedRectPath('M 0 0 L 200 0 L 200 200 L 0 200 Z', [200, 200])).toBe(true)
    expect(isAxisAlignedRectPath('M0 0 H720 V405 H0 Z', [720, 405])).toBe(true)
    expect(isAxisAlignedRectPath('M 0 0 L 10 0 L 10 5 L 0 3 Z', [10, 5])).toBe(false)
  })

  it('does not treat the catalog ellipse as a Konva rect', () => {
    expect(isAxisAlignedRectPath(
      'M 100 0 A 50 50 0 1 1 100 200 A 50 50 0 1 1 100 0 Z',
      [200, 200],
    )).toBe(false)
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

describe('preview raster working size', () => {
  it('super-samples the current slide and caps at 1024', () => {
    expect(previewWorkingWidth(200, 2, 'full')).toBe(800)
    expect(previewWorkingWidth(400, 2, 'full')).toBe(PREVIEW_MAX_WORKING)
  })

  it('uses dest×DPR without super-sample for rail thumbs', () => {
    expect(previewWorkingWidth(200, 2, 'rail')).toBe(400)
    expect(previewWorkingWidth(400, 2, 'rail')).toBe(PREVIEW_RAIL_MAX_WORKING)
    expect(previewWorkingWidth(200, 2, 'rail')).toBeLessThan(previewWorkingWidth(200, 2, 'full'))
  })
})

describe('shared text layout', () => {
  it('converts imported pt sizes and keeps left align', () => {
    const layout = readTextPaintLayout('<p style="text-align: left;"><span style="font-size: 13.5pt; color: #403011">Hello</span></p>')
    expect(layout.align).toBe('left')
    expect(layout.fontSize).toBeCloseTo(18)
    expect(layout.color).toBe('#403011')
    expect(needsHtmlBooth('<p style="font-size: 13.5pt">Hello</p>')).toBe(false)
    expect(needsHtmlBooth('<ul><li><p style="font-size: 18px">One</p></li></ul>')).toBe(true)
    expect(needsHtmlBooth('<p style="font-size: 18px">A</p><p style="font-size: 28px">B</p>')).toBe(true)
  })

  it('converts em rem and px through pixel-units', () => {
    expect(readTextPaintLayout('<p style="font-size: 18px">A</p>').fontSize).toBe(18)
    expect(readTextPaintLayout('<p style="font-size: 1.2em">A</p>').fontSize).toBeCloseTo(19.2)
    expect(readTextPaintLayout('<p style="font-size: 1rem">A</p>').fontSize).toBe(16)
    expect(needsHtmlBooth('<p style="font-size: 27.5pt">A</p>')).toBe(false)
  })

  it('booths keyword and percent sizes Konva cannot resolve', () => {
    expect(needsHtmlBooth('<p style="font-size: medium">A</p>')).toBe(true)
    expect(needsHtmlBooth('<p style="font-size: 150%">A</p>')).toBe(true)
  })

  it('booths any rich text Konva.Text would flatten', () => {
    expect(needsHtmlBooth('<p>dfd<span style="color:#2563eb">sfds</span></p>')).toBe(true)
    expect(needsHtmlBooth('<p><span style="color:#000">a</span><span style="color:#00f">b</span></p>')).toBe(true)
    expect(needsHtmlBooth('<p>plain <span style="font-family: Georgia">serif</span></p>')).toBe(true)
    expect(needsHtmlBooth('<p>hello <strong>world</strong></p>')).toBe(true)
    expect(needsHtmlBooth('<p>hello <em>world</em></p>')).toBe(true)
    expect(needsHtmlBooth('<p>go <a href="#">here</a></p>')).toBe(true)
    expect(needsHtmlBooth('<p>x<sup>2</sup></p>')).toBe(true)
    expect(needsHtmlBooth('<p><span style="text-decoration: underline">u</span></p>')).toBe(true)
    expect(needsHtmlBooth('<p><span style="background-color: #fde68a">hi</span></p>')).toBe(true)
    expect(needsHtmlBooth('<p style="color:#333">Hello</p>')).toBe(false)
    expect(needsHtmlBooth('<p><span style="color:#403011;font-size:13.5pt">Hello</span></p>')).toBe(false)
    expect(needsHtmlBooth('<p><strong>All bold</strong></p>')).toBe(false)
  })
})

describe('shared ProseMirror text paint', () => {
  it('emits the live editor classes and paragraph-space variable', () => {
    const html = textPaintHtml({
      body: '<ul><li><p>One</p></li></ul>',
      inset: [0, 0, 0, 0],
      paragraphSpace: 5,
      lineHeight: 1.25,
      letterSpacing: 0,
      color: '#403011',
      fontFamily: 'Arial',
      justify: 'flex-start',
    })
    expect(html).toContain('ProseMirror-static')
    expect(html).toContain('data-fika-text-paint="prosemirror"')
    expect(html).toContain('--paragraphSpace:5px')
    expect(html).toContain('<ul><li><p>One</p></li></ul>')
    expect(html).not.toContain('• One')
  })
})

describe('booth cache key', () => {
  it('changes when html, size, or scale changes', () => {
    const a = boothCacheKey('<p>Hi</p>', 100, 40, 1)
    expect(boothCacheKey('<p>Hi</p>', 100, 40, 1)).toBe(a)
    expect(boothCacheKey('<p>Ho</p>', 100, 40, 1)).not.toBe(a)
    expect(boothCacheKey('<p>Hi</p>', 120, 40, 1)).not.toBe(a)
    expect(boothCacheKey('<p>Hi</p>', 100, 40, 2)).not.toBe(a)
  })
})

describe('LQ working size', () => {
  it('caps the first blit at 80 working pixels', () => {
    expect(previewWorkingWidth(200, 2, 'lq')).toBe(PREVIEW_LQ_MAX_WORKING)
    expect(previewWorkingWidth(200, 2, 'lq')).toBeLessThan(previewWorkingWidth(200, 2, 'rail'))
  })
})

describe('LQ element pick', () => {
  it('keeps images and the largest shapes only', () => {
    const picked = pickLqElements([
      { id: 'img', type: 'image', src: 'x', width: 40, height: 40, left: 0, top: 0, rotate: 0 },
      ...Array.from({ length: 80 }, (_, index) => ({
        id: `s${index}`,
        type: 'shape',
        width: index < 5 ? 400 : 10,
        height: index < 5 ? 200 : 10,
        left: 0,
        top: 0,
        rotate: 0,
        viewBox: [1, 1],
        path: 'M0 0',
      })),
    ] as never)
    expect(picked.some(item => item.type === 'image')).toBe(true)
    expect(picked.filter(item => item.type === 'shape')).toHaveLength(5)
  })
})

describe('raster quality covering', () => {
  it('lets a full blit satisfy a rail target so siblings are not rebuilt', () => {
    expect(qualityCovers('full', 'rail')).toBe(true)
    expect(qualityCovers('full', 'full')).toBe(true)
    expect(qualityCovers('rail', 'full')).toBe(false)
    expect(qualityCovers('lq', 'rail')).toBe(false)
    expect(qualityCovers(undefined, 'rail')).toBe(false)
  })
})

describe('onscreen parallelism', () => {
  it('runs up to three slide paints at once', () => {
    expect(MAX_CONCURRENT_RASTERS).toBe(3)
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

  it('uses the same paint pass as the live editor', () => {
    const html = '<p style="color: #333333">AI Workshop</p>'
    expect(resolveRasterTextPaint('#333333', html, undefined, dark)).toEqual(
      resolveLiveTextPaint('#333333', html, {
        background: dark.background,
        fallbackSurface: dark.themeBackgroundColor,
        themeFontColor: dark.themeFontColor,
      }),
    )
  })

  it('rewrites default ink to a light color on a dark slide', () => {
    const { ink, html } = resolveRasterTextPaint(
      '#333333',
      '<p style="color: #333333">AI Workshop</p>',
      undefined,
      dark,
    )
    expect(ink.toLowerCase()).toBe('#ffffff')
    expect(html.toLowerCase()).not.toContain('color: #333333')
  })

  it('rewrites default ink to black on a cream slide', () => {
    const { ink } = resolveRasterTextPaint('#333333', '<p style="color: #333333">Hello</p>', undefined, cream)
    expect(ink.toLowerCase()).toBe('#000000')
  })

  it('leaves explicit saturated blue alone', () => {
    const { ink, html } = resolveRasterTextPaint(
      '#2563eb',
      '<p style="color: #2563eb">Hello</p>',
      undefined,
      dark,
    )
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
    const ctx = {
      background: { type: 'solid' as const, color: '#ffffff' },
      themeBackgroundColor: '#ffffff',
      themeFontColor: '#333333',
      elements: [chip, label],
    }
    const live = resolveLiveTextPaint('#333333', label.text.content, {
      element: label,
      elements: ctx.elements,
      background: ctx.background,
      fallbackSurface: ctx.themeBackgroundColor,
      themeFontColor: ctx.themeFontColor,
    })
    const raster = resolveRasterTextPaint('#333333', label.text.content, label, ctx)
    expect(raster).toEqual(live)
    expect(live.ink.toLowerCase()).toBe('#ffffff')
    expect(live.html.toLowerCase()).toContain('#ffffff')
    expect(live.html.toLowerCase()).not.toMatch(/color:\s*#000000/)
  })
})

describe('pane dest commit', () => {
  it('debounces gutter dest rebuilds', () => {
    expect(PREVIEW_PANE_RESIZE_COMMIT_MS).toBeGreaterThanOrEqual(80)
  })
})

describe('raster scheduler', () => {
  afterEach(() => {
    resetRasterSchedulerForTests()
  })

  it('replaces a queued job for the same slide', async () => {
    const ran: string[] = []
    let release = () => {}
    const hold = new Promise<void>(resolve => {
      release = resolve
    })
    enqueueRaster(async () => { ran.push('a'); await hold }, 1, 'a')
    enqueueRaster(async () => { ran.push('b'); await hold }, 1, 'b')
    enqueueRaster(async () => { ran.push('c'); await hold }, 1, 'c')
    enqueueRaster(() => { ran.push('old') }, RASTER_PRIORITY_VISIBLE, 'slide')
    enqueueRaster(() => { ran.push('new') }, RASTER_PRIORITY_CURRENT, 'slide')
    release()
    await flush()
    await flush()
    expect(ran.filter(item => item === 'old' || item === 'new')).toEqual(['new'])
  })

  it('starts the current slide before visible thumbs once a slot frees', async () => {
    const started: string[] = []
    let release = () => {}
    const hold = new Promise<void>(resolve => {
      release = resolve
    })
    enqueueRaster(async () => { started.push('a'); await hold }, 1, 'a')
    enqueueRaster(async () => { started.push('b'); await hold }, 1, 'b')
    enqueueRaster(async () => { started.push('c'); await hold }, 1, 'c')
    enqueueRaster(() => { started.push('current') }, RASTER_PRIORITY_CURRENT, 'cur')
    enqueueRaster(() => { started.push('visible') }, RASTER_PRIORITY_VISIBLE, 'vis')
    await flush()
    expect(started.toSorted()).toEqual(['a', 'b', 'c'])
    release()
    await flush()
    await flush()
    expect(started.filter(item => item === 'current' || item === 'visible')[0]).toBe('current')
  })
})
