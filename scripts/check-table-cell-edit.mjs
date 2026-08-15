import { existsSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
    const without = specifier.slice(2)
    const candidates = [
      join(srcDir, without + '.ts'),
      join(srcDir, without + '.js'),
      join(srcDir, without, 'index.ts'),
      join(srcDir, without),
    ]
    const file = candidates.find(path => existsSync(path) && statSync(path).isFile())
    if (!file) return nextResolve(specifier, context)
    return { url: pathToFileURL(file).href, shortCircuit: true }
  },
})
const {
  areTableElementInfosEqual,
  areTableCellViewEqual,
  rememberTableCellWrite,
  forgetTableCellWrite,
  tableGridStructureEqual,
  tableGridTextEqual,
} = await import(pathToFileURL(join(root, 'src/views/components/element/TableElement/gridCompare.ts')).href)
const {
  locateTableCell,
  replaceTableCellText,
  applyExcelPaste,
  insertColIntoGrid,
  growTable,
} = await import(pathToFileURL(join(root, 'src/views/components/element/TableElement/cellEdit.ts')).href)
const { classifyElementListSync } = await import(pathToFileURL(join(root, 'src/views/Editor/Canvas/elementListSync.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const cell = (id, text, extra = {}) => ({ id, text, colspan: 1, rowspan: 1, ...extra })
const table = (data, extra = {}) => ({
  id: 'table-1',
  type: 'table',
  top: 10,
  left: 20,
  width: 400,
  height: 120,
  rotate: 0,
  lock: false,
  cellMinHeight: 36,
  colWidths: [0.5, 0.5],
  outline: { style: 'solid', color: '#000', width: 1 },
  theme: { color: '#fff', rowHeader: true, rowFooter: false, colHeader: false, colFooter: false },
  data,
  ...extra,
})

const original = table([
  [cell('a', 'Hello'), cell('b', 'World')],
  [cell('c', 'Foo'), cell('d', 'Bar')],
])

const typedSameRef = structuredClone(original)
typedSameRef.data[0][0].text = 'Hello!'
rememberTableCellWrite('table-1', typedSameRef.data)

const canvasClone = JSON.parse(JSON.stringify(typedSameRef))
assert(typedSameRef.data !== canvasClone.data, 'canvas clone uses a new data array')
assert(tableGridStructureEqual(original.data, canvasClone.data), 'typing keeps grid structure')
assert(!tableGridTextEqual(original.data, canvasClone.data), 'typing changes cell HTML')
assert(
  areTableElementInfosEqual(original, canvasClone),
  'TableElement memo skips the store echo of a cell HTML write (no remount)',
)

const otherCellUnchanged = canvasClone.data[0][1].text === original.data[0][1].text
  && canvasClone.data[1][0].text === original.data[1][0].text
  && canvasClone.data[1][1].text === original.data[1][1].text
assert(otherCellUnchanged, 'only the typed cell HTML changes')

const undo = JSON.parse(JSON.stringify(original))
assert(
  !areTableElementInfosEqual(typedSameRef, undo),
  'external text restore (undo) is not treated as a typing echo',
)

const inserted = structuredClone(canvasClone)
inserted.data.push([cell('e', ''), cell('f', '')])
assert(
  !areTableElementInfosEqual(canvasClone, inserted),
  'row/col structure changes still rebuild the grid',
)

const styled = structuredClone(canvasClone)
styled.data[1][1].style = { bold: true }
assert(
  !areTableElementInfosEqual(canvasClone, styled),
  'cell style changes still rebuild the affected grid',
)

forgetTableCellWrite('table-1')

const view = (cell, rowIndex, colIndex, isActive) => ({
  cell,
  rowIndex,
  colIndex,
  isActive,
  isSelected: false,
  hide: false,
  cellMinHeight: 36,
})
const mounts = { a: 1, b: 1, c: 1, d: 1 }
const prevViews = {
  a: view(original.data[0][0], 0, 0, true),
  b: view(original.data[0][1], 0, 1, false),
  c: view(original.data[1][0], 1, 0, false),
  d: view(original.data[1][1], 1, 1, false),
}
const nextViews = {
  a: view(canvasClone.data[0][0], 0, 0, true),
  b: view(canvasClone.data[0][1], 0, 1, false),
  c: view(canvasClone.data[1][0], 1, 0, false),
  d: view(canvasClone.data[1][1], 1, 1, false),
}
for (const id of Object.keys(mounts)) {
  if (!areTableCellViewEqual(prevViews[id], nextViews[id])) mounts[id] += 1
}
assert(mounts.a === 2, `committed text reaches the active editor value (mounts=${mounts.a})`)
assert(mounts.b === 1 && mounts.c === 1 && mounts.d === 1, `typing must not remount other cells (mounts=${JSON.stringify(mounts)})`)

const indexSrc = readFileSync(join(root, 'src/views/components/element/TableElement/index.tsx'), 'utf8')
const editableSrc = readFileSync(join(root, 'src/views/components/element/TableElement/EditableTable.tsx'), 'utf8')
assert(indexSrc.includes('useSlidesStore.getState().updateElement'), 'TableElement writes via getState()')
assert(!/useSlidesStore\(\s*s\s*=>\s*s\.updateElement/.test(indexSrc), 'TableElement does not subscribe to updateElement')
assert(indexSrc.includes('rememberTableCellWrite'), 'TableElement records cell HTML writes for echo detection')
assert(indexSrc.includes('areTableElementInfosEqual'), 'TableElement memo ignores cell-HTML echoes')
assert(editableSrc.includes('TableCellView'), 'cells are isolated in TableCellView')
assert(editableSrc.includes('areTableCellViewEqual'), 'cells skip re-render when their HTML is unchanged')
assert(editableSrc.includes('isTableCellHtmlEcho'), 'EditableTable does not rebuild on cell HTML echoes')
assert(editableSrc.includes('isActive ? <CustomTextarea'), 'active cell keeps the CustomTextarea editor')
const compareSrc = readFileSync(join(root, 'src/views/components/element/TableElement/gridCompare.ts'), 'utf8')
assert(!compareSrc.includes('if (next.isActive) return true'), 'active editor still receives committed cell HTML')
assert(compareSrc.includes('return a.text === b.text'), 'active and idle cells compare text the same way')

const grid = [
  [cell('a', 'Hello'), cell('b', 'World')],
  [cell('c', 'Foo'), cell('d', 'Bar')],
]
const mutated = replaceTableCellText(grid, { cellId: 'c', row: 0, col: 0, text: 'Foo!' })
assert(mutated !== grid, 'replaceTableCellText returns a new grid')
assert(grid[1][0].text === 'Foo', 'replaceTableCellText does not mutate the source cell')
assert(grid[0][0] === mutated[0][0] && grid[0][1] === mutated[0][1] && grid[1][1] === mutated[1][1], 'replaceTableCellText copies only the changed row')
assert(mutated[1][0] !== grid[1][0] && mutated[1][0].text === 'Foo!' && mutated[1][0].id === 'c', 'replaceTableCellText writes a new cell object')
assert(replaceTableCellText(grid, { cellId: 'c', row: 1, col: 0, text: 'Foo' }) === null, 'replaceTableCellText no-ops when text is unchanged')

const relocated = replaceTableCellText(grid, { cellId: 'd', row: 0, col: 0, text: 'Bar!' })
assert(relocated[1][1].text === 'Bar!' && relocated[0][0].text === 'Hello', 'replaceTableCellText locates by cell id, not stale row/col')
assert(locateTableCell(grid, { cellId: 'missing', row: 1, col: 1 }) === null, 'locateTableCell does not fall back to an index when the id is gone')
assert(replaceTableCellText(grid, { cellId: 'missing', row: 1, col: 1, text: 'Nope' }) === null, 'a missing cell id never writes to the cell that happens to sit at that index')

const switched = replaceTableCellText(
  replaceTableCellText(grid, { cellId: 'a', row: 0, col: 0, text: 'A' }),
  { cellId: 'b', row: 0, col: 1, text: 'B' },
)
assert(switched[0][0].text === 'A' && switched[0][1].text === 'B', 'consecutive commits keep each cell\'s own text')

const grown = growTable(grid, 1, 1, () => cell('n', ''))
assert(grown !== grid && grown.length === 3 && grown[0].length === 3, 'growTable adds rows and cols')
assert(grid.length === 2 && grid[0].length === 2, 'growTable does not mutate the source grid')

const pasted = applyExcelPaste(grid, 1, 1, [['X', 'Y'], ['Z', 'W']], () => cell(`p${Math.random()}`, ''))
assert(pasted.length === 3 && pasted[0].length === 3, 'excel paste grows the grid in one write')
assert(pasted[1][1].text === 'X' && pasted[1][2].text === 'Y' && pasted[2][1].text === 'Z' && pasted[2][2].text === 'W', 'excel paste writes every pasted cell')
assert(grid[1][1].text === 'Bar' && grid.length === 2, 'excel paste does not mutate the source grid')

const withCol = insertColIntoGrid(grid, 1, () => cell('col', ''))
assert(withCol[0].length === 3 && withCol[0][1].id === 'col' && withCol[0][2].id === 'b', 'insertColIntoGrid inserts without shifting in place')
assert(grid[0].length === 2 && grid[0][1].id === 'b', 'insertColIntoGrid does not mutate source rows')

const textareaSrc = readFileSync(join(root, 'src/views/components/element/TableElement/CustomTextarea.tsx'), 'utf8')
assert(textareaSrc.includes('onCommitValue'), 'CustomTextarea exposes an immediate commit callback')
assert(textareaSrc.includes("onCommitValueRef.current?.(el.innerHTML, 'blur')"), 'CustomTextarea blur is an authoritative cell commit')
assert(textareaSrc.includes("onCommitValueRef.current?.(el.innerHTML, 'unmount')"), 'CustomTextarea unmount reports a non-authoritative commit')
assert(textareaSrc.includes('editorHtmlLooksEmpty'), 'idle empty remount does not wipe live cell HTML')
assert(textareaSrc.includes('return () =>'), 'CustomTextarea flushes via the React ref cleanup, not a cancelled debounce')

assert(editableSrc.includes('replaceTableCellText'), 'EditableTable commits through an immutable cell replace')
assert(editableSrc.includes('flushDraft'), 'EditableTable flushes the pending cell draft')
assert(editableSrc.includes('takeCommittedGrid'), 'structural edits apply the pending draft before rewriting the grid')
assert(editableSrc.includes('onCommit={handleCommit}'), 'active cells flush immediately on blur/unmount')
assert(editableSrc.includes('shouldWriteEditorHtml'), 'empty unmount commits cannot erase authored cell text')
assert(editableSrc.includes("source === 'blur'"), 'only an authoritative blur may clear a cell')
assert(editableSrc.includes('setGridRev'), 'committing a cell re-renders so the editor value is not stuck empty')
assert(editableSrc.includes('flushDraftRef.current()'), 'changing the active cell flushes the previous draft first')
assert(!editableSrc.includes('dataRef.current[rowIndex][colIndex].text'), 'EditableTable does not mutate store cells in place')
assert(!/handleInput\.cancel\(\)/.test(editableSrc), 'unmount flushes the pending draft instead of dropping it')
assert(editableSrc.includes('lastPropsDataRef'), 'local grid is not reset to a stale echo of props.data')
assert(editableSrc.includes('applyExcelPaste'), 'excel paste is a single immutable write')
assert(editableSrc.includes('insertColIntoGrid'), 'insert column copies rows instead of splicing store arrays')
assert(editableSrc.includes('data-cell-fill'), 'explicit cell fill is marked so theme stripes do not cover it')
assert(editableSrc.includes('data-cell-color'), 'explicit cell color is marked so theme header ink does not cover it')

const mixinSrc = readFileSync(join(root, 'src/assets/styles/mixin.scss'), 'utf8')
assert(mixinSrc.includes('.cell:not([data-cell-fill])'), 'theme fill yields to an explicit cell backcolor')
assert(mixinSrc.includes('.cell:not([data-cell-color]) .cell-text') || mixinSrc.includes(':not([data-cell-color]) .cell-text'), 'theme header ink yields to an explicit cell color')

const canvasSrc = readFileSync(join(root, 'src/views/Editor/Canvas/index.tsx'), 'utf8')
assert(canvasSrc.includes('classifyElementListSync'), 'canvas still classifies in-place editing patches')
assert(canvasSrc.includes("from './elementListSync'"), 'table style writes are classified outside the canvas component')

const tableEl = (data) => ({
  id: 'table-1',
  type: 'table',
  left: 0,
  top: 0,
  width: 400,
  height: 120,
  rotate: 0,
  colWidths: [0.5, 0.5],
  cellMinHeight: 36,
  outline: { style: 'solid', color: '#000', width: 1 },
  data,
})
const slideOf = (el) => ({ id: 'slide-1', elements: [el] })
const typedData = [
  [cell('a', 'Hello!'), cell('b', 'World')],
  [cell('c', 'Foo'), cell('d', 'Bar')],
]
const styledData = [
  [cell('a', 'Hello!'), cell('b', 'World')],
  [cell('c', 'Foo', { style: { backcolor: '#1d4ed8', color: '#1d4ed8' } }), cell('d', 'Bar')],
]
const baseTable = tableEl(original.data)
const typedTable = { ...baseTable, data: typedData }
const styledTable = { ...baseTable, data: styledData }
assert(
  classifyElementListSync(slideOf(baseTable), slideOf(typedTable), 'table-1') === 'skip',
  'typing while the table is being edited does not rebuild the canvas element list',
)
assert(
  classifyElementListSync(slideOf(typedTable), slideOf(styledTable), 'table-1') === 'replace',
  'cell style writes while editing still reach the canvas',
)
assert(
  classifyElementListSync(slideOf(typedTable), slideOf(styledTable), '') === 'replace',
  'cell style writes reach the canvas when the table is not in the editor',
)

const { rememberTableStyleTarget, tableStyleTarget } = await import(
  pathToFileURL(join(root, 'src/utils/tableStyleTarget.ts')).href
)
rememberTableStyleTarget('table-style-target', ['0_0'])
assert(tableStyleTarget('table-style-target').join() === '0_0', 'remembered style target is the last in-cell selection')
assert(tableStyleTarget('table-style-target', []).join() === '0_0', 'empty live selection falls back to the remembered cell')
assert(tableStyleTarget('table-style-target', ['1_2']).join() === '1_2', 'an explicit cell selection wins over the memory')

const applySrc = readFileSync(join(root, 'src/utils/tableCellStyle.ts'), 'utf8')
assert(applySrc.includes('flushCommitQueue()'), 'applyTableCellStyles persists the live cell draft first')
assert(
  applySrc.indexOf('flushCommitQueue()') < applySrc.indexOf('updateElement'),
  'the live draft is flushed before any style write reads the store grid',
)
assert(applySrc.includes('tableStyleTarget'), 'omitted cells use the remembered style target')
assert(applySrc.includes('allCells'), 'callers that mean the whole table say so explicitly')

const panelSrc = readFileSync(join(root, 'src/views/Editor/Toolbar/ElementStylePanel/TableStylePanel.tsx'), 'utf8')
assert(panelSrc.includes('setTextAttrs(prev => ({ ...prev, ...textAttrProp }))'), 'style panel keeps the chosen attrs instead of resetting from a stale selector')
assert(panelSrc.includes('applyTableCellStyles(textAttrProp)'), 'table style panel only passes style fields')
assert(!panelSrc.includes('JSON.parse(JSON.stringify'), 'table style panel does not clone grid data')
assert(!panelSrc.includes('flushCommitQueue'), 'table style panel does not flush beside applyTableCellStyles')

const multiSrc = readFileSync(join(root, 'src/views/Editor/Toolbar/MultiStylePanel.tsx'), 'utf8')
assert(multiSrc.includes('applyTableCellStyles'), 'multi-select table styles use the shared writer')
assert(!multiSrc.includes('JSON.parse(JSON.stringify'), 'multi-select panel does not clone table grids')

const toolbarSrc = readFileSync(join(root, 'src/views/Editor/Canvas/ElementFloatLayer/FloatingToolbar/TableToolbar.tsx'), 'utf8')
assert(toolbarSrc.includes('applyTableCellStyles({ backcolor })'), 'floating table fill uses the shared writer')
assert(!toolbarSrc.includes('JSON.parse(JSON.stringify'), 'floating table toolbar does not clone grid data')

assert(editableSrc.includes('skipStyleTargetSyncRef'), 'leaving cell edit keeps the style-target cells')

if (failures.length) {
  console.error('table cell edit checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('table cell edit checks passed (0 remaining table-edit rerender divergences)')
