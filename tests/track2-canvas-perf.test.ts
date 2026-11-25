import { describe, it, expect, beforeEach } from '@rstest/core'
import { appendTrailingBreaks } from '@/utils/prosemirror'
import { findElementInSlides } from '@/utils/prosemirror/commitPolicy'
import { areEditableElementPropsEqual } from '@/views/Editor/Canvas/EditableElement.equal'
import { clearVerifiedFitCache, readVerifiedFit, runVerifyBatch, verifiedFitKey, type PendingVerifyJob } from '@/views/components/element/hooks/textFitBatcher'
import type { PPTShapeElement, PPTTextElement, Slide } from '@/types/slides'

function makeTextEl(id: string, content: string, overrides: Partial<PPTTextElement> = {}): PPTTextElement {
  return {
    type: 'text',
    id,
    left: 20,
    top: 30,
    width: 300,
    height: 80,
    rotate: 0,
    content,
    defaultFontName: 'Arial',
    defaultColor: '#111111',
    ...overrides,
  }
}

function makeSlide(id: string, elements: Slide['elements']): Slide {
  return {
    id,
    elements,
    background: { type: 'solid', color: '#ffffff' },
  }
}

describe('Track 2 Canvas, ProseMirror & FastDOM TextFit', () => {
  beforeEach(() => {
    clearVerifiedFitCache()
  })

  it('findElementInSlides pins lookup to preferredSlideId even after active slide switches', () => {
    const slideA = makeSlide('slide-a', [makeTextEl('shared-id', '<p>Original A</p>')])
    const slideB = makeSlide('slide-b', [makeTextEl('shared-id', '<p>Original B</p>')])

    // Active slide switched to index 1 (slide-b), but pending commit was scheduled on slide-a
    const pinned = findElementInSlides([slideA, slideB], 1, 'shared-id', 'slide-a')
    expect(pinned?.slideId).toBe('slide-a')
    expect((pinned?.el as PPTTextElement | undefined)?.content).toBe('<p>Original A</p>')

    // If preferredSlideId was deleted, never silently fall through to slide-b
    const missing = findElementInSlides([slideB], 0, 'shared-id', 'slide-a')
    expect(missing).toBeNull()
  })

  it('areEditableElementPropsEqual compares structurally without JSON.stringify and skips owned content while editing', () => {
    const a = makeTextEl('t1', '<p>Hello</p>')
    const b = makeTextEl('t1', '<p>Hello</p>')
    const c = makeTextEl('t1', '<p>Edited</p>')
    const d = makeTextEl('t1', '<p>Edited</p>', { fill: '#ff0000' })

    expect(areEditableElementPropsEqual(
      { elementInfo: a, elementIndex: 1, isMultiSelect: false, isEditing: false },
      { elementInfo: b, elementIndex: 1, isMultiSelect: false, isEditing: false },
    )).toBe(true)

    expect(areEditableElementPropsEqual(
      { elementInfo: a, elementIndex: 1, isMultiSelect: false, isEditing: false },
      { elementInfo: c, elementIndex: 1, isMultiSelect: false, isEditing: false },
    )).toBe(false)

    // Owned content echo while editing is ignored
    expect(areEditableElementPropsEqual(
      { elementInfo: a, elementIndex: 1, isMultiSelect: false, isEditing: true },
      { elementInfo: c, elementIndex: 1, isMultiSelect: false, isEditing: true },
    )).toBe(true)

    // Non-content chrome change while editing still re-renders
    expect(areEditableElementPropsEqual(
      { elementInfo: c, elementIndex: 1, isMultiSelect: false, isEditing: true },
      { elementInfo: d, elementIndex: 1, isMultiSelect: false, isEditing: true },
    )).toBe(false)

    // Shape text.content echo while editing vs text style change
    const shapeA: PPTShapeElement = {
      type: 'shape',
      id: 's1',
      left: 10,
      top: 10,
      width: 100,
      height: 100,
      rotate: 0,
      viewBox: [200, 200],
      path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
      fill: '#eee',
      fixedRatio: false,
      text: { content: '<p>One</p>', defaultFontName: 'Arial', defaultColor: '#000', align: 'middle' },
    }
    const shapeB: PPTShapeElement = {
      ...shapeA,
      text: { ...shapeA.text!, content: '<p>Two</p>' },
    }
    const shapeC: PPTShapeElement = {
      ...shapeA,
      text: { ...shapeA.text!, content: '<p>Two</p>', align: 'top' },
    }

    expect(areEditableElementPropsEqual(
      { elementInfo: shapeA, elementIndex: 1, isMultiSelect: false, isEditing: true },
      { elementInfo: shapeB, elementIndex: 1, isMultiSelect: false, isEditing: true },
    )).toBe(true)
    expect(areEditableElementPropsEqual(
      { elementInfo: shapeB, elementIndex: 1, isMultiSelect: false, isEditing: true },
      { elementInfo: shapeC, elementIndex: 1, isMultiSelect: false, isEditing: true },
    )).toBe(false)
  })

  it('runVerifyBatch batches DOM writes before reads across multiple boxes and caches verified settled scales', () => {
    const ops: string[] = []
    const makeJob = (id: string, naturalHeight: number, boxHeight: number, estimate: number): PendingVerifyJob => {
      let currentScale = estimate
      const host = {
        isConnected: true,
        style: { setProperty: () => {}, removeProperty: () => {} },
      } as unknown as HTMLElement
      const content = {
        get scrollHeight() {
          ops.push(`R:${id}`)
          return Math.ceil(naturalHeight * currentScale)
        },
      } as unknown as HTMLElement
      return {
        host,
        content,
        box: null,
        elementId: id,
        height: boxHeight,
        floor: 0.2,
        estimate,
        params: { innerWidth: 300, innerHeight: boxHeight, lineHeight: 1.5, defaultFontFamily: 'Arial', defaultSize: 16 },
        contentHtml: `<p>${id}</p>`,
        cacheKey: `key:${id}`,
        commitScale: (scale: number) => {
          ops.push(`W:${id}`)
          currentScale = scale
        },
        isAlive: () => true,
        low: 0.2,
        high: 1,
        probe: estimate,
        lastCommitted: estimate,
        hasUpperBound: false,
      }
    }

    // Box 1 fits at 1.0 (zero writes, 1 read); Box 2 & Box 3 overflow and must bisect in lockstep
    const j1 = makeJob('fit1', 60, 100, 1)
    const j2 = makeJob('shrink2', 200, 100, 0.55)
    const j3 = makeJob('shrink3', 160, 100, 0.65)
    runVerifyBatch([j1, j2, j3])

    // First 3 ops are ALL reads (no interleaved write-read on initial pass!)
    expect(ops.slice(0, 3)).toEqual(['R:fit1', 'R:shrink2', 'R:shrink3'])
    // Next phase writes both converging boxes before reading either
    expect(ops.slice(3, 7)).toEqual(['W:shrink2', 'W:shrink3', 'R:shrink2', 'R:shrink3'])

    // Verified scales cached accurately
    expect(readVerifiedFit('key:fit1')?.scale).toBe(1)
    expect(readVerifiedFit('key:shrink2')?.scale).toBeGreaterThan(0.49)
    expect(readVerifiedFit('key:shrink2')?.scale).toBeLessThanOrEqual(0.501)
    expect(readVerifiedFit('key:shrink3')?.scale).toBeGreaterThan(0.61)
    expect(readVerifiedFit('key:shrink3')?.scale).toBeLessThanOrEqual(0.626)
  })

  it('appendTrailingBreaks mirrors ProseMirror live DOM for empty paragraphs and Shift+Enter <p>Line<br></p>', () => {
    type FakeNode = {
      nodeType: number
      tagName?: string
      classList: { contains: (cls: string) => boolean }
    }
    const makeNode = (tagName: string | undefined, classes: string[] = []): FakeNode => ({
      nodeType: tagName ? 1 : 3,
      tagName,
      classList: { contains: (cls: string) => classes.includes(cls) },
    })
    const makeParagraph = (children: FakeNode[]) => ({
      children,
      get lastChild() { return children[children.length - 1] ?? null },
      appendChild(node: FakeNode) { children.push(node); return node },
    })

    const emptyP = makeParagraph([])
    const shiftEnterP = makeParagraph([makeNode(undefined), makeNode('BR')])
    const alreadyTrailingP = makeParagraph([makeNode(undefined), makeNode('BR'), makeNode('BR', ['ProseMirror-trailingBreak'])])
    const plainP = makeParagraph([makeNode(undefined)])

    const root = {
      querySelectorAll: () => [emptyP, shiftEnterP, alreadyTrailingP, plainP] as unknown as Element[],
    }
    appendTrailingBreaks(root, () => makeNode('BR', ['ProseMirror-trailingBreak']) as unknown as Element)

    expect(emptyP.children).toHaveLength(1)
    expect(emptyP.children[0].classList.contains('ProseMirror-trailingBreak')).toBe(true)

    expect(shiftEnterP.children).toHaveLength(3)
    expect(shiftEnterP.children[2].tagName).toBe('BR')
    expect(shiftEnterP.children[2].classList.contains('ProseMirror-trailingBreak')).toBe(true)

    expect(alreadyTrailingP.children).toHaveLength(3)
    expect(plainP.children).toHaveLength(1)
  })

  it('verifiedFitKey preserves quarter-pixel box dimensions so 300.4 and 299.6 never collide', () => {
    const params = { innerWidth: 300, innerHeight: 100, lineHeight: 1.5, defaultFontFamily: 'Arial', defaultSize: 16 }
    const k1 = verifiedFitKey('<p>Hi</p>', Math.round(300.4 * 4), Math.round(100 * 4), params, false)
    const k2 = verifiedFitKey('<p>Hi</p>', Math.round(299.6 * 4), Math.round(100 * 4), params, false)
    const k3 = verifiedFitKey('<p>Hi</p>', Math.round(300.25 * 4), Math.round(100 * 4), params, false)
    expect(k1).not.toBe(k2)
    expect(k1).not.toBe(k3)
  })
})
