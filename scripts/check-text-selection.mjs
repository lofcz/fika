import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  clampRangeToDoc,
  rememberTextSelection,
  forgetTextSelection,
  resolveRememberedRange,
  restoreTextSelection,
  autoSelectAll,
  richTextHtmlEqual,
} = await import(pathToFileURL(join(root, 'src/utils/prosemirror/selection.ts')).href)
const { isTypingTarget } = await import(pathToFileURL(join(root, 'src/utils/hotkeyTarget.ts')).href)
const { isAppOwnedEvent, APP_SHELL_ID } = await import(pathToFileURL(join(root, 'src/utils/portal.ts')).href)
const { readFileSync } = await import('node:fs')

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

function mockView({ from, to, size = 40, empty = from === to }) {
  return {
    state: {
      selection: { empty, from, to },
      doc: { content: { size } },
      tr: {
        setSelection() {
          throw new Error('should not rebuild selection when range is live')
        },
      },
    },
    dispatch() {
      throw new Error('should not dispatch when range is live')
    },
  }
}

assert(clampRangeToDoc(2, 8, 40)?.from === 2 && clampRangeToDoc(2, 8, 40)?.to === 8, 'keeps an in-range selection')
assert(clampRangeToDoc(-4, 8, 40)?.from === 0, 'clamps from to 0')
assert(clampRangeToDoc(2, 99, 40)?.to === 40, 'clamps to to doc size')
assert(clampRangeToDoc(8, 8, 40) === null, 'rejects a collapsed range')
assert(clampRangeToDoc(12, 4, 40) === null, 'rejects an inverted range')

assert(richTextHtmlEqual('<p>Hi</p>', '<p>Hi</p>'), 'identical HTML is equal')
assert(richTextHtmlEqual('<p style="">Hi</p>', '<p>Hi</p>'), 'empty style="" does not count as a change')
assert(richTextHtmlEqual("<p style=''>Hi</p>", '<p>Hi</p>'), "empty style='' does not count as a change")
assert(!richTextHtmlEqual('<p><em>Hi</em></p>', '<p>Hi</p>'), 'mark changes are not equal')

{
  const view = mockView({ from: 2, to: 8 })
  rememberTextSelection(view)
  assert(resolveRememberedRange(view)?.from === 2 && resolveRememberedRange(view)?.to === 8, 'live range is used as-is')

  view.state.selection = { empty: true, from: 8, to: 8 }
  const restored = resolveRememberedRange(view)
  assert(restored?.from === 2 && restored?.to === 8, 'collapsed selection falls back to the last range')

  forgetTextSelection(view)
  assert(resolveRememberedRange(view) === null, 'mousedown in the editor forgets the range')
}

{
  const view = mockView({ from: 2, to: 8 })
  rememberTextSelection(view)
  view.state.selection = { empty: true, from: 8, to: 8 }
  view.state.doc.content.size = 5
  const clamped = resolveRememberedRange(view)
  assert(clamped?.from === 2 && clamped?.to === 5, 'remembered range is clamped after a doc replace')
}

{
  const view = mockView({ from: 2, to: 8 })
  assert(restoreTextSelection(view) === true, 'restore is a no-op when a range is already selected')
  autoSelectAll(view)
}

assert(isTypingTarget({ isContentEditable: true }) === true, 'contenteditable is a typing target')
assert(isTypingTarget({ closest: sel => sel === '.ProseMirror' ? {} : null }) === true, 'ProseMirror is a typing target')
assert(isTypingTarget({ tagName: 'INPUT' }) === true, 'input is a typing target')
assert(isTypingTarget({ tagName: 'DIV', closest: () => null }) === false, 'plain div is not a typing target')
assert(isTypingTarget(null) === false, 'null is not a typing target')

{
  const hotkeySrc = readFileSync(join(root, 'src/hooks/useGlobalHotkey.ts'), 'utf8')
  const required = [
    'isAppOwnedEvent',
    'KEYS.C',
    'KEYS.X',
    'KEYS.D',
    'KEYS.Z',
    'KEYS.Y',
    'KEYS.A',
    'KEYS.L',
    'KEYS.G',
    'KEYS.F',
    'KEYS.B',
    'KEYS.P',
    'KEYS.DELETE',
    'KEYS.BACKSPACE',
    'KEYS.UP',
    'KEYS.DOWN',
    'KEYS.LEFT',
    'KEYS.RIGHT',
    'KEYS.PAGEUP',
    'KEYS.PAGEDOWN',
    'KEYS.ENTER',
    'KEYS.TAB',
    'KEYS.T',
    'KEYS.R',
    'KEYS.O',
    "setDialogForExport('pptx')",
    'ElementOrderCommands.TOP',
    'ElementOrderCommands.BOTTOM',
    'useMainStore.getState()',
  ]
  for (const token of required) {
    assert(hotkeySrc.includes(token), `useGlobalHotkey must keep shortcut ${token}`)
  }
  assert(!/useMainStore\(\s*s\s*=>\s*s\.activeElementIdList/.test(hotkeySrc), 'useGlobalHotkey must not subscribe to activeElementIdList')
  assert(!hotkeySrc.includes('useScaleCanvas()'), 'useGlobalHotkey must call scaleCanvas via getState, not the subscribing hook')

  for (const file of [
    'src/hooks/useDeleteElement.ts',
    'src/hooks/useCopyAndPasteElement.ts',
    'src/hooks/useLockElement.ts',
    'src/hooks/useMoveElement.ts',
    'src/hooks/useOrderElement.ts',
    'src/hooks/useSelectElement.ts',
  ]) {
    const src = readFileSync(join(root, file), 'utf8')
    assert(src.includes('useMainStore.getState()') || src.includes('selectCurrentSlide(useSlidesStore.getState())'), `${file} must read store at call time`)
    assert(!/useMainStore\(\s*s\s*=>\s*s\.activeElementIdList/.test(src), `${file} must not subscribe to activeElementIdList`)
  }
}

{
  if (typeof globalThis.Element === 'undefined') globalThis.Element = class Element {}
  if (typeof globalThis.Node === 'undefined') globalThis.Node = class Node {}
  const overlay = { id: 'react-scan-root', closest: () => null }
  const body = { tagName: 'BODY', closest: () => null }
  const html = { tagName: 'HTML', closest: () => null }
  const previous = globalThis.document
  const doc = {
    getElementById: id => (id === APP_SHELL_ID ? { id: APP_SHELL_ID } : null),
    querySelector: () => null,
    documentElement: html,
    body,
  }
  globalThis.document = doc
  const eventOf = (target, path) => ({
    target,
    composedPath: () => path,
  })
  try {
    assert(isAppOwnedEvent(eventOf(body, [body, html])) === true, 'body-targeted keys are app-owned while the shell is mounted')
    assert(isAppOwnedEvent(eventOf(html, [html])) === true, 'documentElement-targeted keys are app-owned while the shell is mounted')
    assert(isAppOwnedEvent(eventOf(doc, [doc])) === true, 'document-targeted keys are app-owned while the shell is mounted')
    assert(isAppOwnedEvent(eventOf(overlay, [overlay, body, html])) === false, 'react-scan overlay keys are not app-owned')
    doc.getElementById = () => null
    assert(isAppOwnedEvent(eventOf(body, [body, html])) === false, 'body keys are not app-owned when Fika is unmounted')
  }
  finally {
    globalThis.document = previous
  }
}

if (failures.length) {
  console.error('text selection checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('text selection checks passed')
