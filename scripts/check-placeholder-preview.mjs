import { existsSync } from 'node:fs'
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
      join(srcDir, without),
      join(srcDir, without + '.ts'),
      join(srcDir, without + '.js'),
      join(srcDir, without, 'index.ts'),
    ]
    const file = candidates.find(path => existsSync(path))
    if (!file) return nextResolve(specifier, context)
    return { url: pathToFileURL(file).href, shortCircuit: true }
  },
})
const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const { isUnfilledPlaceholder, shouldRasterPreviewText } = await import(
  pathToFileURL(join(root, 'src/utils/placeholderPaint.ts')).href
)
const { applyLiveLayoutOntoStore } = await import(
  pathToFileURL(join(root, 'src/utils/liveLayoutCommit.ts')).href
)
const { shouldWriteEditorHtml } = await import(
  pathToFileURL(join(root, 'src/utils/prosemirror/commitPolicy.ts')).href
)

const cycle = [
  { name: 'cover title', placeholder: 'Click to add title' },
  { name: 'cover subtitle', placeholder: 'Click to add subtitle' },
  { name: 'body list', placeholder: 'Click to add text' },
]
for (const slot of cycle) {
  const empty = { placeholder: slot.placeholder, content: '' }
  const para = { placeholder: slot.placeholder, content: '<p></p>' }
  const typed = { placeholder: slot.placeholder, content: `<p>${slot.name}</p>` }
  const cleared = { placeholder: slot.placeholder, content: '<p><br></p>' }
  assert(isUnfilledPlaceholder(empty) && !shouldRasterPreviewText(empty), `${slot.name}: empty must not rasterize`)
  assert(isUnfilledPlaceholder(para) && !shouldRasterPreviewText(para), `${slot.name}: empty <p> must not rasterize`)
  assert(!isUnfilledPlaceholder(typed) && shouldRasterPreviewText(typed), `${slot.name}: typed text must rasterize`)
  assert(isUnfilledPlaceholder(cleared) && !shouldRasterPreviewText(cleared), `${slot.name}: cleared text must not rasterize`)
}

const live = [
  { type: 'text', id: 'a', left: 200, top: 10, width: 100, height: 40, rotate: 0, content: '', defaultFontName: '', defaultColor: '#000' },
]
const store = [
  { type: 'text', id: 'a', left: 20, top: 10, width: 100, height: 40, rotate: 0, content: '<p>kept</p>', defaultFontName: '', defaultColor: '#000', placeholder: 'Click to add title' },
]
const next = applyLiveLayoutOntoStore(live, store)
assert(next[0].left === 200, 'live left wins')
assert(next[0].content === '<p>kept</p>', 'store content survives a move')
assert(next[0].placeholder === 'Click to add title', 'placeholder chrome stays on the store element')
assert(shouldRasterPreviewText(next[0]) === true, 'moved filled placeholder still rasterizes')

const emptied = { ...next[0], content: '' }
assert(shouldRasterPreviewText(emptied) === false, 'after content is removed, preview must drop the slot')

assert(shouldWriteEditorHtml({ nextHtml: '<p>x</p>', storeHtml: '', isAuthoritative: false }) === true, 'filled live HTML always writes')
assert(shouldWriteEditorHtml({ nextHtml: '', storeHtml: '<p>x</p>', isAuthoritative: false }) === false, 'unfocused empty view cannot wipe store text')
assert(shouldWriteEditorHtml({ nextHtml: '', storeHtml: '<p>x</p>', isAuthoritative: true }) === true, 'authoritative clear is allowed')

if (failures.length) {
  console.error(`check-placeholder-preview: ${failures.length} failed`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('check-placeholder-preview: ok')
