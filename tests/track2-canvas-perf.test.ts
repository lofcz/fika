import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach } from '@rstest/core'
import { appendTrailingBreaks } from '@/utils/prosemirror'
import { findElementInSlides } from '@/utils/prosemirror/commitPolicy'
import { collectTableCellIds, forgetTableStyleTarget, rememberTableStyleTarget, resolveTableStyleTarget } from '@/utils/tableStyleTarget'
import { computeUniformTableHeight } from '@/views/components/element/TableElement/gridCompare'
import { areEditableElementPropsEqual } from '@/views/Editor/Canvas/EditableElement.equal'
import { clearVerifiedFitCache, readVerifiedFit, runVerifyBatch, shouldSkipDomVerify, verifiedFitKey, type PendingVerifyJob } from '@/views/components/element/hooks/textFitBatcher'
import type { PPTShapeElement, PPTTextElement, Slide, TableCell } from '@/types/slides'

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

  it('shouldSkipDomVerify only skips when Pretext confirms scale=1 with >=15% and >=0.5 line headroom (and never on text-transform or <img>)', () => {
    const base = {
      estimate: 1,
      pretextHeight: 60,
      boxHeight: 100,
      maxLinePx: 24,
      isScaling: false,
      liveEdit: false,
      isVertical: false,
      hasMath: false,
      fontsReady: true,
      contentHtml: '<p>Hello world</p>',
    }
    expect(shouldSkipDomVerify(base)).toBe(true)
    expect(shouldSkipDomVerify({ ...base, pretextHeight: 86 })).toBe(false)
    expect(shouldSkipDomVerify({ ...base, pretextHeight: 90, boxHeight: 100, maxLinePx: 24 })).toBe(false)
    expect(shouldSkipDomVerify({ ...base, pretextHeight: 30, boxHeight: 40, maxLinePx: 24 })).toBe(false) // 10px < 12px (0.5 line)
    expect(shouldSkipDomVerify({ ...base, estimate: 0.95 })).toBe(false)
    expect(shouldSkipDomVerify({ ...base, hasMath: true })).toBe(false)
    expect(shouldSkipDomVerify({ ...base, isVertical: true })).toBe(false)
    expect(shouldSkipDomVerify({ ...base, liveEdit: true })).toBe(false)
    expect(shouldSkipDomVerify({ ...base, fontsReady: false })).toBe(false)
    // Hardening H6: text-transform and <img> must always verify against real DOM
    expect(shouldSkipDomVerify({ ...base, contentHtml: '<p style="text-transform: uppercase">Title</p>' })).toBe(false)
    expect(shouldSkipDomVerify({ ...base, contentHtml: '<p><img src="x.png" /></p>' })).toBe(false)
  })

  it('Blocker 12 & Remaining #4: runVerifyBatch converges on 2-line step-function titles to <= 0.1px within 12 rounds via bisection fallback', () => {
    let writes = 0
    let currentScale = 0.85
    const boxHeight = 80
    const baseFont = 48
    const cliff = 0.617
    const host = {
      isConnected: true,
      style: { setProperty: () => {}, removeProperty: () => {} },
    } as unknown as HTMLElement
    // Pure 2-line -> 3-line step function (no slope on either side, which stalls pure secant)
    const content = {
      get scrollHeight() {
        return currentScale <= cliff ? 64 : 112
      },
    } as unknown as HTMLElement

    runVerifyBatch([{
      host,
      content,
      box: null,
      elementId: 'step-title',
      height: boxHeight,
      floor: 0.2,
      estimate: 0.85,
      params: { innerWidth: 300, innerHeight: boxHeight, lineHeight: 1.2, defaultFontFamily: 'Arial', defaultSize: baseFont },
      contentHtml: '<p>Two line title wrap cliff</p>',
      cacheKey: 'key:step-title',
      commitScale: (scale: number) => {
        writes += 1
        currentScale = scale
      },
      isAlive: () => true,
      low: 0.2,
      high: 1,
      probe: 0.85,
      lastCommitted: 0.85,
      hasUpperBound: false,
      maxFontSize: baseFont,
      maxLinePx: 58,
    }])

    expect(writes).toBeLessThanOrEqual(12)
    const settled = readVerifiedFit('key:step-title')?.scale ?? 0
    expect(settled).toBeGreaterThanOrEqual(cliff - 0.1 / baseFont)
    expect(settled).toBeLessThanOrEqual(cliff)
  })

  it('Blocker 5 & Remaining #3: resolveTableStyleTarget is pure, tracks cell IDs across row insertions, and survives unmount', () => {
    const cell = (id: string, text = ''): TableCell => ({ id, text, colspan: 1, rowspan: 1 })
    const initial: TableCell[][] = [
      [cell('c00', 'H1'), cell('c01', 'H2')],
      [cell('c10', 'Target'), cell('c11', 'B2')],
    ]
    const ids = collectTableCellIds(initial, ['1_0'])
    expect(ids).toEqual(['c10'])
    rememberTableStyleTarget('tbl-b6', ['1_0'], ids)

    // Insert a row above row 1: 'c10' shifts from 1_0 -> 2_0
    const afterInsert: TableCell[][] = [
      initial[0],
      [cell('new0'), cell('new1')],
      initial[1],
    ]
    expect(resolveTableStyleTarget('tbl-b6', afterInsert)).toEqual(['2_0'])

    // Delete the target row: returns null WITHOUT mutating the map (pure resolver!)
    const afterDelete: TableCell[][] = [initial[0], [cell('new0'), cell('new1')]]
    expect(resolveTableStyleTarget('tbl-b6', afterDelete)).toBeNull()
    expect(resolveTableStyleTarget('tbl-b6', afterDelete)).toBeNull()
    // Undo restores the row — remembered target is still intact because resolveTableStyleTarget was pure
    expect(resolveTableStyleTarget('tbl-b6', initial)).toEqual(['1_0'])

    // Explicit forget clears remembered target (returns [] whole-table default)
    forgetTableStyleTarget('tbl-b6')
    expect(resolveTableStyleTarget('tbl-b6', initial)).toEqual([])
  })

  it('Remaining #2: static table grows to uniform tallestRow * rows in 1 write without feedback loop', () => {
    // 3 rows with minHeight 36; row 2 wraps to 70px -> total 142px, uniform target is 70*3 = 210px in 1 write
    expect(computeUniformTableHeight([36, 36, 70], 36, 142)).toBe(210)
    // Includes 1px outer border overhead without clipping
    expect(computeUniformTableHeight([36, 36, 70], 36, 143)).toBe(211)
    // Respects cellMinHeight floor when rows are shorter
    expect(computeUniformTableHeight([24, 24], 40, 48)).toBe(80)
  })

  it('Opus Blockers 1/4/5/6/7/9/11 & Remaining #2/#3/#4 & Hardening H4/H5/H6/H9 invariants', () => {
    const root = process.cwd()
    const textElSrc = readFileSync(join(root, 'src/views/components/element/TextElement/index.tsx'), 'utf8')
    expect(textElSrc).toContain('wasActiveForCleanupRef')
    expect(textElSrc).toContain('setPlaceholderTextEditing(false)')
    expect(textElSrc).toContain('checkEmptyText.cancel()')
    expect(textElSrc).toContain('addHistorySnapshotRef.current()')
    expect(textElSrc).toContain('flushElementSizeSync(elementId)')

    const remarkSrc = readFileSync(join(root, 'src/views/Editor/Remark/index.tsx'), 'utf8')
    expect(remarkSrc).toContain('key={slideId}')

    const cellStyleSrc = readFileSync(join(root, 'src/utils/tableCellStyle.ts'), 'utf8')
    expect(cellStyleSrc).toContain('if (resolved === null)')
    expect(cellStyleSrc).toContain('forgetTableStyleTarget(elementId)')

    const tableElSrc = readFileSync(join(root, 'src/views/components/element/TableElement/index.tsx'), 'utf8')
    expect(tableElSrc).toContain('wasEditableRef')
    // Remaining #3: must NOT forget remembered table style target on unmount (Present <Activity> / slide switch)
    expect(tableElSrc).not.toContain('forgetTableStyleTarget')
    expect(tableElSrc).toContain('flushElementSizeSync(id)')
    expect(tableElSrc).toContain('<StaticTable')
    expect(tableElSrc).toContain('computeUniformTableHeight')
    // Blocker 6: ResizeObserver runs for StaticTable too (not gated by `if (!mountEditable) return`)
    expect(tableElSrc).not.toMatch(/useEffect\(\(\) => \{\s*if \(!mountEditable\) return;\s*const wrapper/)
    // H5: safe 0.5px threshold
    expect(tableElSrc).toContain('>= 0.5')

    const staticTableSrc = readFileSync(join(root, 'src/views/components/element/TableElement/StaticTable.tsx'), 'utf8')
    // Blocker 7: search highlighting selector support
    expect(staticTableSrc).toContain('data-cell-index={`${rowIndex}_${colIndex}`}')
    // Remaining #2: tr height stays at cellMinHeight (no height / rowCount feedback loop!)
    expect(staticTableSrc).not.toContain('Math.floor((height ?? 0) / rowCount)')

    const editableTableSrc = readFileSync(join(root, 'src/views/components/element/TableElement/EditableTable.tsx'), 'utf8')
    // H5: seeded initial row height & out-of-range cell clamp
    expect(editableTableSrc).toContain('initialHeight')
    expect(editableTableSrc).toContain('clampCellCoord')

    const chartElSrc = readFileSync(join(root, 'src/views/components/element/ChartElement/index.tsx'), 'utf8')
    const baseChartSrc = readFileSync(join(root, 'src/views/components/element/ChartElement/BaseChartElement.tsx'), 'utf8')
    // Blocker 9: retryable lazy + error boundary
    expect(chartElSrc).toContain('createRetryableLazy')
    expect(chartElSrc).toContain('LazyChunkBoundary')
    expect(baseChartSrc).toContain('createRetryableLazy')
    expect(baseChartSrc).toContain('LazyChunkBoundary')

    const batchedSrc = readFileSync(join(root, 'src/views/Editor/Canvas/batchedHeightSync.ts'), 'utf8')
    // Blocker 11 & H4: geometry-only store write + flush on unmount
    expect(batchedSrc).toContain('updateSlideElementGeometry')
    expect(batchedSrc).not.toContain('updateSlide(')
    expect(batchedSrc).toContain('export function flushElementSizeSync')

    const useTextFitSrc = readFileSync(join(root, 'src/views/components/element/hooks/useTextFit.ts'), 'utf8')
    expect(useTextFitSrc).toContain('if (!cancelled) refreshFonts()')
    expect(useTextFitSrc).toContain('cancelled = true')
    // H6: estimate-only skip must not poison verifiedFitCache
    expect(useTextFitSrc).not.toContain('writeVerifiedFit(')

    const shapeElSrc = readFileSync(join(root, 'src/views/components/element/ShapeElement/index.tsx'), 'utf8')
    // H9: microtask-deferred stopEdit guard
    expect(shapeElSrc).toContain('queueMicrotask(')
  })
})
