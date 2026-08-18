import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const {
  resolveImportApply,
  normalizeImportApplyOptions,
} = await import(pathToFileURL(join(root, 'src/utils/importApply.ts')).href)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

{
  const d = resolveImportApply(1)
  assert(d.apply === 'replace' && d.needsConfirm === false, 'single slide replaces without confirm')
}

{
  const d = resolveImportApply(0)
  assert(d.apply === 'replace' && d.needsConfirm === false, 'empty deck (deleted starter) replaces without confirm')
}

{
  const d = resolveImportApply(3)
  assert(d.apply === 'replace' && d.needsConfirm === true, 'multiple slides ask before replace')
}

{
  const d = resolveImportApply(3, { confirm: false })
  assert(d.apply === 'replace' && d.needsConfirm === false, 'controller can skip confirm and still replace')
}

{
  const d = resolveImportApply(3, { mode: 'append' })
  assert(d.apply === 'append' && d.needsConfirm === false, 'explicit append skips confirm')
}

{
  const d = resolveImportApply(3, { cover: false })
  assert(d.apply === 'append' && d.needsConfirm === false, 'legacy cover:false appends')
}

{
  const d = resolveImportApply(3, { cover: true })
  assert(d.apply === 'replace' && d.needsConfirm === true, 'legacy cover:true replaces with confirm in UI')
}

{
  const d = resolveImportApply(0, { mode: 'append' })
  assert(d.apply === 'replace' && d.needsConfirm === false, 'cannot append onto an empty deck — replace')
}

{
  const d = resolveImportApply(1, { mode: 'append' })
  assert(d.apply === 'append' && d.needsConfirm === false, 'append is allowed when a slide already exists')
}

{
  const d = resolveImportApply(5, { mode: 'replace', confirm: false, cover: false })
  assert(d.apply === 'replace' && d.needsConfirm === false, 'mode wins over cover')
}

assert(normalizeImportApplyOptions(true).cover === true, 'boolean true normalizes to cover')
assert(normalizeImportApplyOptions(false).cover === false, 'boolean false normalizes to cover')
assert(normalizeImportApplyOptions({ mode: 'append' }).mode === 'append', 'object options pass through')
assert(normalizeImportApplyOptions().mode === undefined, 'missing options stay empty')

{
  const { readFileSync } = await import('node:fs')
  const importHook = readFileSync(join(root, 'src/hooks/useImport.ts'), 'utf8')
  const header = readFileSync(join(root, 'src/views/Editor/EditorHeader/index.tsx'), 'utf8')
  const dialog = readFileSync(join(root, 'src/views/Editor/ImportReplaceDialog.tsx'), 'utf8')
  const controller = readFileSync(join(root, 'src/embed/createController.ts'), 'utf8')
  assert(!/\bwindow\.(confirm|alert)\s*\(/.test(importHook), 'useImport must not use native confirm/alert')
  assert(importHook.includes('export function getImportApi()'), 'click/embed callers use getImportApi, not useImport()')
  assert(importHook.includes('useSyncExternalStore'), 'overlay progress subscribes via useSyncExternalStore')
  assert(header.includes('name.endsWith(\'.json\')') && header.includes('name.endsWith(\'.pptx\')'), 'header routes json vs pptx by extension')
  assert(header.includes('file.type === PPTX_MIME') || header.includes('file.type === \'application/vnd.openxmlformats-officedocument.presentationml.presentation\''), 'header also routes PPTX by accept MIME')
  assert(dialog.includes('useImportConfirmStore.getState().register()'), 'confirm dialog registers on mount via getState')
  assert(!dialog.includes('useMemo(() => confirmStore.register()'), 'confirm dialog must not register in useMemo')
  assert(controller.includes('getImportApi()') && controller.includes('confirm: importOptions?.confirm ?? false'), 'embed importPptx skips confirm by default')
  assert(controller.includes('turningMode: importOptions?.turningMode'), 'embed importPptx forwards turningMode')
  assert(importHook.includes('applyImportTransitions'), 'file import applies configurable transitions')
  assert(dialog.includes('transitionKeep') && dialog.includes('transitionAll'), 'confirm dialog can keep or override transitions')
  assert(importHook.includes('resetEditorSelection'), 'file import clears selection before swapping slides')
  assert(importHook.includes('drainCommitQueue()'), 'file import drains the live editor instead of clearing editing beside it')
  assert(importHook.includes('updateSelectedSlidesIndex([])'), 'file import drops multi-selected thumbnail indexes')
  const addSlides = readFileSync(join(root, 'src/hooks/useAddSlidesOrElements.ts'), 'utf8')
  assert(addSlides.includes('clonePlain(slides)'), 'append remaps ids on a clone, not the parsed slides')
  assert(addSlides.includes('clonePlain(elements)'), 'pasted elements are cloned before id remap')
  const slideHandler = readFileSync(join(root, 'src/hooks/useSlideHandler.ts'), 'utf8')
  assert(slideHandler.includes('addSlidesFromData([slide])'), 'template insert goes through the same clone+remap path')
  assert(!slideHandler.includes('element.id = elIdMap'), 'template insert does not mutate the layout slide in place')
}

{
  const { useImportConfirmStore } = await import(pathToFileURL(join(root, 'src/store/importConfirm.ts')).href)
  const live = () => useImportConfirmStore.getState()

  const skipped = await live().request(4)
  assert(skipped === null && live().visible === false, 'confirm without a mounted dialog does not hang')

  const unregister = live().register()
  const pending = live().request(6)
  assert(live().visible === true && live().slideCount === 6, 'confirm opens with the current slide count')
  live().settle({ apply: 'append', turningMode: 'keep' })
  const chosen = await pending
  assert(chosen?.apply === 'append' && chosen?.turningMode === 'keep', 'append choice is returned to import')
  assert(live().visible === false, 'confirm closes after a choice')

  const cancelled = live().request(3)
  live().settle(null)
  assert(await cancelled === null, 'dismissing the dialog cancels import')
  unregister()
}

if (failures.length) {
  console.error('import apply checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('import apply checks passed')
