import { describe, expect, it } from '@rstest/core'
import { canvasOperationCommand } from '@/embed/agentic/canvasOperations'
import type { FikaCanvasOperation } from '@/embed/agentic/types'

const photo = { op: 'image', id: 'photo', pageId: 'card', src: 'https://example.test/photo.jpg', x: 20, y: 40, width: 200, height: 200, natural: { width: 800, height: 400 } } as const
const element = (operation: FikaCanvasOperation) => (canvasOperationCommand(operation).payload as { element: Record<string, any> }).element

describe('compact canvas image authoring', () => {
  it('keeps the complete photo visible by default without changing its aspect ratio', () => {
    expect(element(photo)).toMatchObject({ id: 'photo', type: 'image', left: 20, top: 90, width: 200, height: 100, fixedRatio: true })
    expect(element(photo).clip).toBeUndefined()
  })
  it('supports editable center cropping and retains the citation', () => {
    expect(element({ ...photo, fit: 'cover', sourceUrl: 'https://example.test/source' })).toMatchObject({
      left: 20, top: 40, width: 200, height: 200,
      clip: { shape: 'rect', range: [[25, 0], [75, 100]] },
      link: { type: 'web', target: 'https://example.test/source' },
    })
  })
  it('rejects invalid source geometry before any canvas operation is applied', () => {
    for (const width of [0, -1, NaN, Infinity]) expect(() => element({ ...photo, natural: { width, height: 400 } })).toThrow('natural width and height')
    expect(() => element({ ...photo, fit: 'stretch' } as unknown as FikaCanvasOperation)).toThrow('fit must be')
  })
})
