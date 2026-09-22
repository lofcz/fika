import { describe, expect, it } from '@rstest/core'
import { summarizeCanvas } from '@/embed/agentic/canvasContext'
import type { Slide } from '@/types/slides'

describe('compact canvas context', () => {
  const slides = [{ id: 'page', canvasName: 'Invitation', canvasPosition: { x: -200, y: 150 }, elements: Array.from({ length: 110 }, (_, n) => ({ id: `e${n}`, type: 'text', content: '<p>' + 'x'.repeat(2000) + '</p>', left: n, top: 30, width: 400, height: 120, src: 'SECRET_IMAGE_DATA' })) }] as unknown as Slide[]
  it('bounds context and supplies stable ids and pagination without binary or HTML data', () => {
    const result = summarizeCanvas(slides, 'page', ['e1'], 1000, 1)
    expect(result.elements.length).toBe(40)
    expect(result.nextOffset).toBe(40)
    expect(result.elements[0].text?.length).toBe(160)
    expect(result.pages[0].x).toBe(-200)
    expect(JSON.stringify(result)).not.toContain('SECRET_IMAGE_DATA')
    expect(JSON.stringify(result)).not.toContain('<p>')
    expect(summarizeCanvas(slides, 'page', [], 1000, 1, { offset: 100, limit: 10000, textLimit: 10000 }).elements[0].text?.length).toBe(500)
  })
  it('does not silently read a different page when an explicit id is missing', () => {
    expect(summarizeCanvas(slides, 'page', [], 1000, 1, { pageId: 'missing' }).elements).toEqual([])
  })
})
