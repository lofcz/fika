/**
 * Commit-queue drain: one beginScreening path, one persist helper per editor.
 *
 *   node scripts/check-commit-queue.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => readFileSync(join(root, rel), 'utf8')

const { shouldWriteEditorHtml, editorHtmlLooksEmpty } = await import(
  pathToFileURL(join(root, 'src/utils/prosemirror/commitPolicy.ts')).href
)

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
}

const flushers = new Set()
const register = flush => {
  flushers.add(flush)
  return () => {
    flushers.delete(flush)
  }
}
let flushed = 0
const unreg = register(() => {
  flushed += 1
})
for (const flush of [...flushers]) flush()
assert(flushed === 1, 'drain walks every registered flusher')
unreg()
for (const flush of [...flushers]) flush()
assert(flushed === 1, 'a removed flusher is not called again')

assert(editorHtmlLooksEmpty('<p style=""><br class="ProseMirror-trailingBreak"></p>'), 'empty ProseMirror HTML looks empty')
assert(
  !shouldWriteEditorHtml({ nextHtml: '', storeHtml: '<p>kept</p>', isAuthoritative: false }),
  'empty remount must not wipe store text',
)
assert(
  shouldWriteEditorHtml({ nextHtml: '<p>KeepTitle</p>', storeHtml: '', isAuthoritative: false }),
  'typed HTML reaches the store even before blur',
)

const queue = read('src/utils/commitQueue.ts')
assert(queue.includes('export function drainCommitQueue'), 'drainCommitQueue is the persist entry')
assert(queue.includes('export function flushCommitQueue'), 'style writes can persist drafts without leaving the editor')
assert(queue.includes('flushCommitQueue()'), 'drain reuses flushCommitQueue')
assert(queue.includes('export function registerCommitFlusher'), 'editors register flushers on the queue')
assert(queue.includes('export function registerAfterCommitDrain'), 'canvas registers a post-drain sync')
assert(queue.includes('commitAllLiveEditors()'), 'drain persists every live ProseMirror view')
assert(queue.includes('setEditingElementId(\'\')'), 'drain clears the in-place editing id')
assert(queue.includes('for (const flush of [...afterDrain])'), 'drain runs every after-hook')
assert(!queue.includes('canvasSync'), 'singleton canvas sync is gone')

const screening = read('src/utils/screening.ts')
assert(screening.includes('export function beginScreening'), 'beginScreening is the shared present entry')
assert(screening.includes('drainCommitQueue()'), 'starting presentation drains the commit queue')
assert(
  screening.indexOf('drainCommitQueue()') < screening.indexOf('setScreening(true)'),
  'drain runs before setScreening(true)',
)
assert(
  screening.split('drainCommitQueue()').length - 1 === 1,
  'drain is called from exactly one screening function',
)
assert(screening.includes('beginScreening(options)'), 'fullscreen present reuses beginScreening')
assert(screening.includes('enterScreening({ fromStart: true })'), 'from-start reuses enterScreening')

const hook = read('src/hooks/useScreening.ts')
assert(hook.includes("from '@/utils/screening'"), 'the hook re-exports the shared screening helpers')
assert(!hook.includes('setScreening'), 'the hook does not reimplement screening')

const header = read('src/views/Editor/EditorHeader/index.tsx')
assert(header.includes('enterScreening()'), 'Present control enters screening through the shared helper')
assert(header.includes('data-editor-tool="present"'), 'Present control is marked for e2e')

const editor = read('src/views/components/element/ProsemirrorEditor.tsx')
assert(editor.includes('registerCommitFlusher(persistLiveEditor)'), 'live editors register one persist helper')
assert(editor.includes('persistLiveEditor();'), 'teardown reuses the same persist helper')
assert(editor.includes('resolveEditorMountHtml'), 'Activity remounts initialize from store-owned HTML')
assert(!/handleInputRef\.current\.cancel\(\)/.test(editor), 'pending typed HTML is never dropped on hide')

const table = read('src/views/components/element/TableElement/EditableTable.tsx')
assert(table.includes('registerCommitFlusher(persistDraft)'), 'table drafts register one persist helper')
assert(table.includes('persistDraft()'), 'table unmount reuses the same persist helper')
assert(table.includes('setGridRev'), 'table commits refresh the live cell value')
assert(table.includes('shouldWriteEditorHtml'), 'table unmount cannot wipe authored cell text')

const tableStyle = read('src/utils/tableCellStyle.ts')
assert(tableStyle.includes('export function applyTableCellStyles'), 'cell styles go through one writer')
assert(tableStyle.includes('flushCommitQueue()'), 'the shared style writer flushes drafts first')
assert(tableStyle.includes('tableStyleTarget'), 'the shared writer uses the remembered in-cell target')
assert(read('src/utils/tableStyleTarget.ts').includes('lastStyleTarget'), 'style-target memory lives outside the store selection')

const tablePanel = read('src/views/Editor/Toolbar/ElementStylePanel/TableStylePanel.tsx')
assert(tablePanel.includes('applyTableCellStyles'), 'table style panel uses the shared writer')
assert(!tablePanel.includes('flushCommitQueue'), 'table style panel does not flush beside the shared writer')

const canvas = read('src/views/Editor/Canvas/index.tsx')
assert(canvas.includes('registerAfterCommitDrain'), 'canvas installs the post-drain element-list sync')
assert(canvas.includes('drainCommitQueue()'), 'ending an edit drains the same queue')
assert(canvas.includes('if (!elementId)'), 'clearing beginEdit drains instead of dropping the draft')
assert(!canvas.includes('endEdit'), 'canvas does not wrap drain in a second helper')
assert(!canvas.includes("setEditingElementId('')"), 'canvas does not clear editing beside drain')

const canvasTool = read('src/views/Editor/CanvasTool/index.tsx')
assert(canvasTool.includes('drainCommitQueue()'), 'toolbar dialogs drain before leaving the canvas editor')
assert(!canvasTool.includes("setEditingElementId('')"), 'toolbar does not clear editing beside drain')

const tableEl = read('src/views/components/element/TableElement/index.tsx')
assert(tableEl.includes('drainCommitQueue()'), 'leaving a table edit drains the same queue')
assert(!tableEl.includes("setEditingElementId('')"), 'table element does not clear editing beside drain')

const createEl = read('src/hooks/useCreateElement.ts')
assert(createEl.includes('drainCommitQueue()'), 'inserting an element drains the live editor first')

const importer = read('src/hooks/useImport.ts')
assert(importer.includes('drainCommitQueue()'), 'import resets drain the live editor first')
assert(!importer.includes("setEditingElementId('')"), 'import does not clear editing beside drain')

const agentic = read('src/embed/agentic/createAgenticApi.ts')
assert(agentic.includes('beginScreening()'), 'agentic present uses the shared beginScreening')
assert(agentic.includes('exitScreening()'), 'agentic exit uses the shared exitScreening')
assert(!agentic.includes('drainCommitQueue'), 'agentic does not drain beside beginScreening')
assert(!/enterPresentation[\s\S]*setScreening\(true\)/.test(agentic), 'agentic present does not set screening beside beginScreening')

const commitEditor = read('src/utils/prosemirror/commitEditor.ts')
assert(commitEditor.includes('export const resolveEditorMountHtml'), 'mount HTML prefers store text over an empty prop')
assert(commitEditor.includes('storeHtmlForElement'), 'mount HTML reads the live slide element')

if (failures.length) {
  console.error(failures.map(f => `FAIL  ${f}`).join('\n'))
  throw new Error(`${failures.length} commit-queue checks failed`)
}
console.log('commit-queue checks passed')
