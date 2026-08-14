import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  followHyperlinkModifier,
  isFollowHyperlinkClick,
  isSafeHyperlinkHref,
  openHyperlink,
} = await import(pathToFileURL(join(root, 'src/utils/hyperlinkFollow.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

assert(followHyperlinkModifier('Win32') === 'Ctrl+Click', 'Windows uses Ctrl+Click')
assert(followHyperlinkModifier('MacIntel') === '⌘+Click', 'macOS uses ⌘+Click')
assert(isFollowHyperlinkClick({ button: 0, ctrlKey: true, metaKey: false }), 'Ctrl+click follows')
assert(isFollowHyperlinkClick({ button: 0, ctrlKey: false, metaKey: true }), 'Cmd+click follows')
assert(!isFollowHyperlinkClick({ button: 0, ctrlKey: false, metaKey: false }), 'plain click edits, does not follow')
assert(!isFollowHyperlinkClick({ button: 1, ctrlKey: true, metaKey: false }), 'middle click does not follow')
assert(isSafeHyperlinkHref('https://stackoverflow.com/q/1'), 'https is safe')
assert(isSafeHyperlinkHref('http://example.com'), 'http is safe')
assert(!isSafeHyperlinkHref('javascript:alert(1)'), 'javascript URLs are rejected')
assert(!isSafeHyperlinkHref('file:///etc/passwd'), 'file URLs are rejected')
assert(openHyperlink('javascript:alert(1)') === false, 'unsafe href is not opened')

const editor = readFileSync(join(root, 'src/views/components/element/ProsemirrorEditor.tsx'), 'utf8')
const editorStyle = readFileSync(join(root, 'src/views/components/element/ProsemirrorEditor.scss'), 'utf8')
assert(editor.includes('isFollowHyperlinkClick'), 'editor intercepts modifier-click on links')
assert(editor.includes('hyperlink-hover-tooltip'), 'editor shows a link hover tooltip')
assert(editor.includes('followLinkRest'), 'tooltip includes the follow-link hint')
assert(editor.includes('hyperlink-hover-tooltip__key'), 'tooltip uses a key chip for the modifier')
assert(editorStyle.includes('$ink'), 'tooltip uses the ink palette')
assert(editorStyle.includes('$boxShadow'), 'tooltip uses the ink elevation')
assert(editor.includes('openHyperlink'), 'editor opens safe http(s) links')

const en = readFileSync(join(root, 'src/i18n/en/canvas/index.ts'), 'utf8')
assert(en.includes("followLink: '{modifier} to follow link'"), 'English follow-link copy matches PowerPoint')

if (failures.length) {
  console.error('hyperlink follow checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('hyperlink follow checks passed')
