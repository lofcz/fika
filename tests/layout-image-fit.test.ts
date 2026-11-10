import { describe, expect, it } from '@rstest/core'
import { buildLayoutSlide } from '@/embed/agentic/layouts'
import { resolveStylePreset } from '@/embed/agentic/styles'
import type { PPTImageElement } from '@/types/slides'

const preset = resolveStylePreset()
const viewport = { width: 1280, height: 720 }
const PNG = 'data:image/png;base64,iVBORw0KGgo='

const imageOf = (elements: unknown[]): PPTImageElement => {
  const image = (elements as Array<{ type: string }>).find(el => el.type === 'image')
  expect(image).toBeDefined()
  return image as PPTImageElement
}

describe('diagram layout image fit', () => {
  it('contain-fits a wide diagram into the body box and centers it', async () => {
    const result = await buildLayoutSlide('diagram', {
      title: 'Jak program běží',
      image: { src: PNG, width: 2400, height: 600 },
    }, preset, viewport)
    const image = imageOf(result.slide.elements)
    const margin = Math.round(viewport.width * 0.06)
    const cw = viewport.width - margin * 2
    expect(image.width).toBe(cw)
    expect(image.height).toBe(Math.round(cw / 4))
    expect(image.left).toBe(margin)
    expect(image.fixedRatio).toBe(true)
    expect(image.clip).toBeUndefined()
  })

  it('contain-fits a tall diagram by shrinking width and centering horizontally', async () => {
    const result = await buildLayoutSlide('diagram', {
      title: 'Sekvence',
      image: { src: PNG, width: 500, height: 1000 },
    }, preset, viewport)
    const image = imageOf(result.slide.elements)
    expect(Math.abs(image.width / image.height - 0.5)).toBeLessThan(0.01)
    const margin = Math.round(viewport.width * 0.06)
    const cw = viewport.width - margin * 2
    // centered within the content width
    expect(Math.abs(image.left + image.width / 2 - (margin + cw / 2))).toBeLessThanOrEqual(1)
    expect(image.fixedRatio).toBe(true)
  })

  it('keeps the full box (no distortion guarantees) when the natural size is unknown', async () => {
    const result = await buildLayoutSlide('diagram', { title: 'Bez rozměrů', image: PNG }, preset, viewport)
    const image = imageOf(result.slide.elements)
    const margin = Math.round(viewport.width * 0.06)
    expect(image.width).toBe(viewport.width - margin * 2)
    expect(image.fixedRatio).toBe(false)
  })
})

describe('photo layouts image fit', () => {
  it('center-crops (cover) a panoramic photo in imageText instead of stretching it', async () => {
    const result = await buildLayoutSlide('imageText', {
      title: 'Fotka',
      body: 'Popis obrázku vedle textu.',
      image: { src: PNG, width: 3000, height: 1000 },
    }, preset, viewport)
    const image = imageOf(result.slide.elements)
    expect(image.fixedRatio).toBe(true)
    expect(image.clip).toBeDefined()
    const [[x1, y1], [x2, y2]] = image.clip!.range
    // horizontal crop only, symmetric
    expect(y1).toBe(0)
    expect(y2).toBe(100)
    expect(x1).toBeGreaterThan(0)
    expect(Math.abs(100 - x2 - x1)).toBeLessThan(0.05)
    // cropped source aspect equals the box aspect
    const srcAspect = (3000 * (x2 - x1) / 100) / 1000
    expect(Math.abs(srcAspect - image.width / image.height)).toBeLessThan(0.02)
  })

  it('covers the full slide in imageFull with a vertical crop for a tall photo', async () => {
    const result = await buildLayoutSlide('imageFull', {
      title: 'Cover',
      image: { src: PNG, width: 1000, height: 1500 },
    }, preset, viewport)
    const image = imageOf(result.slide.elements)
    expect(image.width).toBe(viewport.width)
    expect(image.height).toBe(viewport.height)
    const [[x1, y1], [x2, y2]] = image.clip!.range
    expect(x1).toBe(0)
    expect(x2).toBe(100)
    expect(y1).toBeGreaterThan(0)
    expect(y2).toBeLessThan(100)
  })
})

describe('picture cards', () => {
  const images = (elements: unknown[]) =>
    (elements as PPTImageElement[]).filter(el => el.type === 'image')

  it('puts each card\'s picture on top of its card and keeps four in one row', async () => {
    const cards = ['Smetana', 'Filipovský', 'Holub', 'Diviš'].map(name => ({
      heading: name,
      body: 'Krátký popis.',
      image: { src: PNG, sourceUrl: 'https://example.org/page', width: 600, height: 600 },
    }))
    const result = await buildLayoutSlide('cards', { title: 'Osobnosti', cards }, preset, viewport)
    const placed = images(result.slide.elements)
    expect(placed).toHaveLength(4)
    // one row: all pictures share a top edge and never overlap
    expect(new Set(placed.map(image => image.top)).size).toBe(1)
    const sorted = [...placed].sort((a, b) => a.left - b.left)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].left).toBeGreaterThanOrEqual(sorted[i - 1].left + sorted[i - 1].width)
    }
    expect(placed.every(image => image.link?.target === 'https://example.org/page')).toBe(true)
    // text sits under the picture, inside the slide
    const texts = (result.slide.elements as Array<{ type: string; top: number; height: number; content?: string }>)
      .filter(el => el.type === 'text' && el.content?.includes('Krátký popis'))
    expect(texts).toHaveLength(4)
    for (const text of texts) {
      expect(text.top).toBeGreaterThanOrEqual(placed[0].top + placed[0].height)
      expect(text.top + text.height).toBeLessThanOrEqual(viewport.height)
    }
  })

  it('fits a portrait whole in a wide slot instead of cropping the subject', async () => {
    const cards = [1, 2, 3, 4, 5, 6].map(index => ({
      heading: `Místo ${index}`,
      image: index === 1 ? { src: PNG, width: 200, height: 1000 } : { src: PNG, width: 1500, height: 1000 },
    }))
    const result = await buildLayoutSlide('cards', { title: 'Tipy na výlety', cards }, preset, viewport)
    const placed = images(result.slide.elements)
    expect(placed).toHaveLength(6)
    expect(new Set(placed.map(image => image.top)).size).toBe(2)
    const portrait = placed.find(image => Math.abs(image.width / image.height - 1 / 5) < 0.02)
    expect(portrait).toBeDefined()
    expect(portrait!.clip).toBeUndefined()
    expect(placed.filter(image => image !== portrait).every(image => image.fixedRatio)).toBe(true)
  })

  it('leaves text-only cards unchanged', async () => {
    const cards = [{ heading: 'A', body: 'a' }, { heading: 'B', body: 'b' }, { heading: 'C', body: 'c' }, { heading: 'D', body: 'd' }]
    const result = await buildLayoutSlide('cards', { title: 'Bez obrázků', cards }, preset, viewport)
    expect(images(result.slide.elements)).toHaveLength(0)
    const tops = new Set((result.slide.elements as Array<{ type: string; top: number; content?: string }>)
      .filter(el => el.type === 'text' && /<p[^>]*>.*[ABCD]</.test(el.content ?? '') && !el.content?.includes('Bez'))
      .map(el => el.top))
    // four text cards still wrap into a 2×2 grid
    expect(tops.size).toBeGreaterThan(1)
  })
})
