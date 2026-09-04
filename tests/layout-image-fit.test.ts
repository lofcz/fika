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
