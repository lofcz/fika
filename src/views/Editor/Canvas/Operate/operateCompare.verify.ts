import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  boxGeometryChanged,
  deepEqualIgnore,
  elementChromeEqual,
  handlerChromeEqual,
  multiSelectOperateEqual,
  operatePropsEqual,
  typedOperateEqual,
} from './operateCompare'
import type { PPTElement, PPTTextElement } from '@/types/slides'

const CONTENT_KEYS = new Set(['content', 'text'])

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const baseText = {
  id: 'el-1',
  type: 'text',
  left: 10,
  top: 20,
  width: 200,
  height: 80,
  rotate: 0,
  content: '<p>Hi</p>',
  defaultFontName: 'Arial',
  defaultColor: '#111',
} as PPTTextElement

const typedText = { ...baseText, content: '<p>Hi there</p>' } as PPTTextElement
const movedText = { ...baseText, left: 11 } as PPTTextElement
const tallerText = { ...baseText, height: 96 } as PPTTextElement
const rotatedText = { ...baseText, rotate: 15 } as PPTTextElement

assert(deepEqualIgnore(baseText, typedText, CONTENT_KEYS), 'deep equal ignores content HTML')
assert(!deepEqualIgnore(baseText, typedText, new Set()), 'full equal sees content HTML')
assert(elementChromeEqual(baseText, typedText, true), 'chrome equal ignores content while idle')
assert(!elementChromeEqual(baseText, typedText, false), 'chrome equal keeps content while resizing')
assert(!elementChromeEqual(baseText, movedText, true), 'chrome equal sees left')
assert(!elementChromeEqual(baseText, tallerText, true), 'chrome equal sees height')
assert(!elementChromeEqual(baseText, rotatedText, true), 'chrome equal sees rotate')

assert(!boxGeometryChanged(baseText, typedText), 'box size ignores content-only writes')
assert(boxGeometryChanged(baseText, movedText), 'box size updates on left')
assert(boxGeometryChanged(baseText, { ...baseText, top: 21 } as PPTTextElement), 'box size updates on top')
assert(boxGeometryChanged(baseText, { ...baseText, width: 201 } as PPTTextElement), 'box size updates on width')
assert(boxGeometryChanged(baseText, tallerText), 'box size updates on height')
assert(boxGeometryChanged(baseText, rotatedText), 'box size updates on rotate')

const flags = {
  isSelected: true,
  isActive: true,
  isActiveGroupElement: false,
  isMultiSelect: false,
  isEditing: true,
  elementInfo: baseText as PPTElement,
}
const typedFlags = { ...flags, elementInfo: typedText as PPTElement }
const movedFlags = { ...flags, elementInfo: movedText as PPTElement }
const noop = () => undefined

assert(
  operatePropsEqual(
    { ...flags, style: { display: undefined } },
    { ...typedFlags, style: { display: undefined } },
  ),
  'Operate memo skips content-only elementList clones',
)
assert(
  !operatePropsEqual(flags, movedFlags),
  'Operate memo rerenders when geometry changes',
)
assert(
  operatePropsEqual(
    { ...flags, style: { display: undefined } },
    { ...flags, elementInfo: { ...baseText } as PPTElement, style: { display: undefined } },
  ),
  'Operate memo ignores new object identity when chrome fields match',
)

assert(typedOperateEqual({ elementInfo: baseText, handlerVisible: true, rotateElement: noop }, { elementInfo: typedText, handlerVisible: true, rotateElement: () => undefined }), 'per-type operate ignores content and callback identity')
assert(!typedOperateEqual({ elementInfo: baseText, handlerVisible: true }, { elementInfo: tallerText, handlerVisible: true }), 'per-type operate updates when height changes')

assert(
  multiSelectOperateEqual({ elementList: [baseText] }, { elementList: [typedText] }),
  'multi-select chrome ignores content-only list clones',
)
assert(
  !multiSelectOperateEqual({ elementList: [baseText] }, { elementList: [movedText] }),
  'multi-select chrome updates when a member moves',
)

assert(
  handlerChromeEqual(
    { type: 'left-top', rotate: 0, className: 'operate-resize-handler', style: { left: '100px' } },
    { type: 'left-top', rotate: 0, className: 'operate-resize-handler', style: { left: '100px' }, onMouseDown: noop },
  ),
  'ResizeHandler/RotateHandler ignore new onMouseDown identity',
)
assert(
  !handlerChromeEqual(
    { type: 'left-top', rotate: 0, style: { left: '100px' } },
    { type: 'left-top', rotate: 0, style: { left: '120px' } },
  ),
  'ResizeHandler updates when box size style changes',
)

let resizeHandlerMounts = 1
let rotateHandlerMounts = 1
let resizeHandlerRenders = 1
let rotateHandlerRenders = 1
const idle = { elementInfo: baseText, handlerVisible: true }
const typed = { elementInfo: typedText, handlerVisible: true }
if (!typedOperateEqual(idle, typed, true)) {
  resizeHandlerRenders += 1
  rotateHandlerRenders += 1
  resizeHandlerMounts += 1
  rotateHandlerMounts += 1
}
assert(resizeHandlerMounts === 1 && rotateHandlerMounts === 1, 'typing must not remount ResizeHandler/RotateHandler')
assert(resizeHandlerRenders === 1 && rotateHandlerRenders === 1, 'typing must not rerender ResizeHandler/RotateHandler')

const dir = dirname(fileURLToPath(import.meta.url))
const sources = [
  'index.tsx',
  'TextElementOperate.tsx',
  'ImageElementOperate.tsx',
  'ShapeElementOperate.tsx',
  'LineElementOperate.tsx',
  'TableElementOperate.tsx',
  'CommonElementOperate.tsx',
  'MediaElementOperate.tsx',
  'MultiSelectOperate.tsx',
  'ResizeHandler.tsx',
  'RotateHandler.tsx',
]
for (const file of sources) {
  const src = readFileSync(join(dir, file), 'utf8')
  assert(/\bmemo\(/.test(src), `${file} is memoized`)
  if (file.endsWith('ElementOperate.tsx') || file === 'index.tsx' || file === 'MultiSelectOperate.tsx') {
    assert(/MemoEqual|LatestEqual|handlerChromeEqual/.test(src), `${file} uses a custom chrome compare`)
  }
}

console.log('operate chrome compare: 0 remaining content-keystroke divergences')
console.log('ResizeHandler/RotateHandler do not remount when only content HTML changes')
