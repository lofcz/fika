import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  areTableElementInfosEqual,
  areTableCellViewEqual,
  rememberTableCellWrite,
  forgetTableCellWrite,
  tableGridStructureEqual,
  tableGridTextEqual,
} = await import(pathToFileURL(join(root, 'src/views/components/element/TableElement/gridCompare.ts')).href)

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
assert(mounts.a === 1, `active editor must stay mounted while typing (mounts=${mounts.a})`)
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
assert(compareSrc.includes('if (next.isActive) return true'), 'active editor ignores store HTML so it stays mounted')

if (failures.length) {
  console.error('table cell edit checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('table cell edit checks passed (0 remaining table-edit rerender divergences)')
