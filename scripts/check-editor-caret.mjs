import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  clampPointToRect,
  caretDomAtPoint,
  placeCaretAtClientPoint,
  setPendingCaret,
  clearPendingCaret,
  consumePendingCaret,
} = await import(pathToFileURL(join(root, 'src/utils/prosemirror/caret.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const rect = { left: 100, top: 50, right: 300, bottom: 90 }
assert(clampPointToRect({ left: 180, top: 70 }, rect).left === 180, 'point inside the rect is unchanged')
assert(clampPointToRect({ left: 180, top: 70 }, rect).top === 70, 'point inside the rect keeps top')

const left = clampPointToRect({ left: 10, top: 70 }, rect)
assert(left.left === 101, 'clamps left edge inward by 1px')
const right = clampPointToRect({ left: 500, top: 70 }, rect)
assert(right.left === 299, 'clamps right edge inward by 1px')
const above = clampPointToRect({ left: 180, top: 0 }, rect)
assert(above.top === 51, 'clamps top edge inward by 1px')
const below = clampPointToRect({ left: 180, top: 400 }, rect)
assert(below.top === 89, 'clamps bottom edge inward by 1px')

const caretDoc = {
  caretRangeFromPoint(x, y) {
    if (x === 12 && y === 8) {
      return { startContainer: { nodeName: '#text' }, startOffset: 4 }
    }
    return null
  },
}
const caret = caretDomAtPoint(12, 8, caretDoc)
assert(caret && caret.offset === 4, 'caretRangeFromPoint maps to a DOM offset (rich text / wrapping)')

const missed = caretDomAtPoint(0, 0, caretDoc)
assert(missed === null, 'no caret when the point misses every glyph')

const emptyView = {
  posAtCoords: () => null,
  posAtDOM: () => {
    throw new Error('outside')
  },
  dom: {
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10 }),
    contains: () => false,
  },
  focus() {},
}
assert(placeCaretAtClientPoint(emptyView, { left: 3, top: 3 }) === false, 'returns false when the point cannot be mapped')

{
  setPendingCaret('box-1', { left: 12, top: 8 })
  const rangeView = {
    state: { selection: { empty: false, from: 2, to: 9 } },
    posAtCoords() {
      throw new Error('must not place caret over a selected range')
    },
  }
  assert(consumePendingCaret('box-1', rangeView) === false, 'skips pending caret when a range is already selected')

  const later = {
    ...emptyView,
    state: { selection: { empty: true, from: 1, to: 1 } },
    posAtCoords() {
      throw new Error('pending caret must be cleared after a range skip')
    },
  }
  assert(consumePendingCaret('box-1', later) === false, 'clears pending caret instead of applying it later')
}

{
  setPendingCaret('box-1', { left: 12, top: 8 })
  clearPendingCaret()
  const view = {
    ...emptyView,
    state: { selection: { empty: true, from: 1, to: 1 } },
    posAtCoords() {
      throw new Error('cleared pending caret must not be consumed')
    },
  }
  assert(consumePendingCaret('box-1', view) === false, 'mousedown-style clear drops the pending caret')
}

if (failures.length) {
  console.error('editor caret checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('editor caret checks passed')
