# Fika Agentic Bridge

Fika exposes a typed agentic bridge through `fika-editor/embed`. The bridge is for host agents that need deterministic CRUD over decks, slides, elements, animations, tables, charts, notes, search, and presentation state without reaching into Zustand internals.

This document is the style guide for the bridge contract. The canonical command types are the registered `execute()` commands in `src/embed/agentic/createAgenticApi.ts`; typed domain methods are convenience wrappers over the same command model when a wrapper exists.

## Public Surface

The public controller keeps the legacy imperative methods:

```ts
controller.getDocument()
controller.setDocument(document)
controller.setTitle(title)
controller.setLocale(locale)
controller.enterPresentation()
controller.exitPresentation()
controller.destroy()
```

The agentic surface adds command execution, state, events, and domain wrappers:

```ts
controller.getState()
controller.execute({ id: 'cmd_1', type: 'slides.create', payload: { slide } })
controller.executeBatch(commands, { atomic: true })
controller.canExecute(command)
controller.subscribe(event => {})
await controller.markdownToHtml(markdown)
controller.docs()
controller.domains()
controller.describe(commandType)
controller.guides(guideId?)

controller.deck.*
controller.slides.*
controller.elements.*
controller.element.*
controller.animations.*
controller.tables.*
controller.charts.*
controller.media.*
controller.links.*
controller.notes.*
controller.sections.*
controller.search.*
controller.history.*
controller.view.*
controller.import.*
controller.export.*
```

Use domain wrappers for common flows. Use `execute()` for command-only operations that are registered but do not yet have a wrapper method.

## API Naming

Command names use `domain.action` with lower-camel-case actions:

```ts
type FikaCommandType = `${string}.${string}`
```

Canonical domains are `deck`, `import`, `export`, `slides`, `elements`, `animations`, `tables`, `charts`, `notes`, `sections`, `search`, `history`, and `view`.

Naming rules:

- Use plural collection domains: `slides`, `elements`, `animations`, `tables`, `charts`, `notes`, `sections`.
- Use singular state domains when there is only one target: `deck`, `history`, `view`.
- Use `create`, `get`, `list`, `update`, `delete`, `duplicate`, `move`, `select`, and `reorder` for common CRUD and ordering operations.
- Use `setX` when replacing a named property, for example `deck.setTitle`, `slides.setBackground`, `charts.setType`.
- Use `applyX` when one payload is applied to multiple targets, for example `slides.applyBackground`.
- Use `patch` only for broad document-level patching, currently `deck.patch`.
- Use stable payload field names: `slideId`, `elementId`, `animationId`, `noteId`, `sectionId`, `toIndex`, `row`, `col`, `patch`, and `options`.
- Keep command types stable. Add new behavior under a new `domain.action` rather than changing the meaning of an existing action.

## Command Envelope

Every executable command uses this JSON-serializable envelope:

```ts
interface FikaAgentCommand<TPayload = unknown> {
  id?: string
  type: FikaCommandType
  payload?: TPayload
  meta?: {
    commit?: boolean
    dryRun?: boolean
    source?: 'agent' | 'host' | 'ui'
    label?: string
  }
}
```

`id` is caller-owned and optional. Provide it when the host needs to correlate logs, events, retries, or a batch result. The bridge returns it as `commandId`; it does not use the command ID as a deck, slide, or element ID.

`meta.source` and `meta.label` are descriptive metadata for hosts and future event consumers. `meta.commit` and `meta.dryRun` affect execution:

- `commit: false` suppresses the per-command history snapshot.
- `dryRun: true` runs validation through the handler, restores the prior document, returns `changed: false`, and does not increment `documentVersion`.
- Batch-level `dryRun` overrides individual command dry runs for that batch.

## Result Contract

Every `execute()` command and domain wrapper that mutates through the command layer resolves to a JSON-serializable result:

```ts
interface FikaCommandResult<TData = unknown> {
  ok: boolean
  commandId?: string
  type: FikaCommandType
  changed: boolean
  documentVersion: number
  snapshotId?: number
  data?: TData
  errors?: Array<{
    code: string
    message: string
    path?: string
    recoverable?: boolean
  }>
  warnings?: Array<{
    code: string
    message: string
    path?: string
    recoverable?: boolean
  }>
}
```

Result rules:

- `ok: true` means the command handler completed.
- `ok: false` means the command failed and document state was restored to its pre-command value.
- `commandId` mirrors the incoming command `id`.
- `type` always mirrors the incoming command `type`.
- `changed` is true only when the command changed document or view state and was not a dry run.
- `documentVersion` increments after successful, non-dry-run changed commands.
- `snapshotId` is present only when that command created its own history snapshot.
- `data` contains the command-specific return payload, usually the updated model object or current bridge state.
- `errors` and `warnings` use machine-readable `code` plus human-readable `message`. `path` should point to the invalid payload field when available.

Unsupported command types return `ok: false` with an error. `canExecute(command)` only checks whether the controller is alive and the command type is registered; use `dryRun` for payload-level validation.

## Validation Rules

Hosts should treat payloads as plain JSON. The bridge clones document data through JSON serialization in several paths, so functions, class instances, DOM nodes, and cyclic objects are invalid inputs.

Reference validation:

- `slideId`, `elementId`, `animationId`, and `noteId` must refer to existing objects unless the command creates that object.
- `elements.*` commands search across slides when `slideId` is omitted, and search within `slideId` when it is provided.
- Table commands require the target element to be `type: 'table'`.
- Chart commands require the target element to be `type: 'chart'`.
- Table cell commands require an existing `row` and `col`.
- Note replies require the target note to exist on the target slide.

Creation and ID rules:

- Agents may provide deterministic object IDs in create payloads.
- If an object ID is omitted, the bridge generates one with a type prefix such as `slide_`, `el_`, `anim_`, `note_`, `reply_`, `cell_`, or `group_`.
- Agents must use the ID returned in `data` for later commands.
- Do not reuse an ID for a different model object.

Index rules:

- Insert positions use `index`, `toIndex`, `rowIndex`, or `colIndex`.
- Non-finite insert indexes append to the end.
- Insert indexes are truncated to integers and clamped into the valid insertion range.
- Selection and delete indexes are clamped into the existing range where the underlying model operation supports it.

Content rules:

- Element create payloads must include `element.type`.
- Whole-document writes (`deck.set`, `deck.patch`, `import.json`, `import.fika`, and `import.pptxSafe`) require a JSON-serializable payload with a string `title` and a `slides` array before store state is touched.
- Text-like content is stored as HTML where the model already expects HTML, for example text element `content`, shape `text.content`, slide `remark`, and note `content`.
- Markdown flavor: `markdown-it` + `markdown-it-texmath` (KaTeX).
- Use `content` / `text.setContent` for trusted HTML; use `markdown` / `text.setMarkdown` for Markdown.
- Slide links should be validated against `slides.list()` before use.
- DOM-dependent import/export paths remain outside the JSON bridge until they have been converted to a serializable document payload.

## Snapshot Policy

The bridge maintains a monotonic `documentVersion` and a separate `snapshotId`.

- Successful changed commands create one history snapshot by default.
- Pass `meta: { commit: false }` to suppress a command snapshot.
- `executeBatch()` runs child commands with `commit: false`, increments `documentVersion` once, and commits one batch snapshot at the end when any child changed state.
- Batch execution is atomic by default. Any failure restores the pre-batch runtime state, marks already-run changed results with a `BatchRolledBack` warning, and returns `BatchSkipped` errors for commands that were not run.
- Passing `{ atomic: false }` keeps successful child changes, rolls back only the failed command, continues later commands, and returns the mixed success/failure result list for the caller to inspect.
- Passing `{ commit: false }` to `executeBatch()` suppresses the final batch snapshot.
- Passing `{ dryRun: true }` lets commands validate against the staged batch state, then restores the pre-batch runtime state, returns `changed: false`, and creates no snapshot.
- `history.commit`, `history.undo`, and `history.redo` are command-layer operations and return bridge state.

Events emitted through `subscribe()` include `documentChanged`, `selectionChanged`, `commandApplied`, `commandFailed`, and `destroyed`. Command events include the command envelope and result when available.

## Examples

Create a slide and text element in one atomic snapshot using deterministic IDs:

```ts
const results = await controller.executeBatch([
  {
    id: 'cmd_create_intro_slide',
    type: 'slides.create',
    payload: {
      slide: {
        id: 'slide_intro',
        elements: [],
        background: { type: 'solid', color: '#fff' },
      },
      select: true,
    },
  },
  {
    id: 'cmd_create_intro_title',
    type: 'elements.create',
    payload: {
      slideId: 'slide_intro',
      element: {
        id: 'el_intro_title',
        type: 'text',
        left: 80,
        top: 80,
        width: 500,
        height: 80,
        rotate: 0,
        content: '<p>Hello from agent</p>',
        defaultFontName: '',
        defaultColor: '#111111',
      },
      select: true,
    },
  },
], { atomic: true })

if (!results.every(result => result.ok)) {
  console.error(results.find(result => !result.ok)?.errors)
}
```

Validate a risky table edit without changing the deck:

```ts
const dryRun = await controller.execute({
  id: 'cmd_validate_table_cell',
  type: 'tables.setCell',
  payload: {
    elementId: 'table_fixture',
    row: 0,
    col: 1,
    patch: { text: 'Updated' },
  },
  meta: { dryRun: true },
})

if (dryRun.ok) {
  await controller.execute({
    id: 'cmd_apply_table_cell',
    type: 'tables.setCell',
    payload: {
      elementId: 'table_fixture',
      row: 0,
      col: 1,
      patch: { text: 'Updated' },
    },
  })
}
```

Subscribe to command failures:

```ts
const unsubscribe = controller.subscribe(event => {
  if (event.type === 'commandFailed') {
    console.error(event.result?.commandId, event.result?.errors)
  }
})
```

## Coverage Matrix

| Model area | Registered commands | Convenience surface | Notes |
| --- | --- | --- | --- |
| Deck/document | `deck.get`, `deck.set`, `deck.patch`, `deck.setTitle`, `deck.setTheme`, `deck.setViewport`, `deck.setTemplates`, `import.json`, `import.fika`, `import.pptxSafe`, `export.json` | `deck.*`, `import.*`, `export.json()` | Import commands replace the deck from a data-safe document payload. |
| Slides | `slides.list`, `slides.get`, `slides.create`, `slides.update`, `slides.delete`, `slides.duplicate`, `slides.move`, `slides.select`, `slides.setBackground`, `slides.applyBackground`, `slides.setTransition`, `slides.setRemark` | `slides.*` | `slides.applyBackground` is command-only in the current runtime. |
| Elements | `elements.list`, `elements.get`, `elements.create`, `elements.update`, `elements.delete`, `elements.reorder`, `elements.select`, `elements.group`, `elements.ungroup`, `elements.lock`, `elements.hide`, `elements.setLink` | `elements.*`, `element.*`, `links.*` | Subtype and link helpers map to `elements.update` or `elements.setLink`. |
| Media assets | `media.resolveAsset`, `media.setImageSource`, `media.setVideoSource`, `media.setAudioSource` | `media.*` | Accepts JSON-safe media assets or raw `src` strings. Video and audio ext fields are inferred when possible. |
| Animations | `animations.list`, `animations.catalog`, `animations.create`, `animations.update`, `animations.delete`, `animations.reorder` | `animations.*` | `animations.catalog` is command-only in the current runtime. |
| Tables | `tables.update`, `tables.setCell`, `tables.setCellStyle`, `tables.insertRow`, `tables.deleteRow`, `tables.insertColumn`, `tables.deleteColumn`, `tables.mergeCells`, `tables.splitCell` | `tables.*` | `tables.mergeCells` and `tables.splitCell` are command-only in the current runtime. |
| Charts | `charts.update`, `charts.setType`, `charts.setData`, `charts.setLabels`, `charts.setLegends`, `charts.setSeries`, `charts.setOptions` | `charts.*` | Label, legend, and series helpers are command-only in the current runtime. |
| Notes/comments | `notes.create`, `notes.update`, `notes.delete`, `notes.reply` | `notes.*` | `notes.list` is a direct read helper, not a registered command. |
| Sections | `sections.set`, `sections.clear`, `sections.rename`, `sections.assignRange` | `sections.*` | `sections.list` is a direct read helper. `rename` and `assignRange` are command-only in the current runtime. |
| Search | `search.find`, `search.replace` | `search.*` | Finds and replaces text element content, shape text content, and table cell text. |
| View and selection | `view.setZoom`, `view.enterPresentation`, `view.exitPresentation`, `view.setLocale`, `slides.select`, `elements.select`, `elements.hide` | `view.*`, `slides.select`, `elements.select`, `elements.hide` | View commands return `FikaBridgeState`. |
| History | `history.commit`, `history.undo`, `history.redo` | `history.*` | Undo and redo update `documentVersion` and return bridge state. |

## Search And Replace

`controller.search.find(query, options)` scans `text.content`, `shape.text.content`, and table cell `text` fields. `controller.search.replace(query, replacement, options, meta)` updates the same fields and returns only the matches it replaced. Both methods support `{ caseSensitive, regex }`; replace also supports `{ replaceAll }`, which defaults to replacing the first match.

Both methods return `{ count, results }`, where each result includes `slideId`, `elementId`, `elementType`, `path`, `match`, `start`, `end`, and table cell `row`/`col` when applicable.

## Media Asset Contract

Media inputs must be JSON-safe. Hosts should resolve `File`, `Blob`, `ArrayBuffer`, upload handles, or private storage references before calling the bridge, then pass either a raw source string or a plain asset object:

```ts
type FikaMediaAssetInput = string | {
  id?: string
  kind?: 'image' | 'video' | 'audio'
  src: string
  ext?: string
  mimeType?: string
  filename?: string
  title?: string
  width?: number
  height?: number
  size?: number
  poster?: string
  metadata?: Record<string, unknown>
}
```

`src` is the playable/renderable URL or data URL. The bridge does not fetch or upload media; it only normalizes the contract and writes element fields. `controller.media.resolveAsset(asset, kind)` returns the normalized asset without mutating the deck.

The helper layer infers `mimeType` from data URLs and common file extensions, and infers `ext` from `mimeType` or URL/filename extensions. `media.setVideoSource` and `media.setAudioSource` copy the inferred `ext` into the Fika element when the caller did not provide an explicit patch ext.

## Import Boundary

The agentic bridge imports documents only after data has been reduced to a JSON-safe deck payload:

```ts
await controller.import.json(document)
await controller.import.json(document, { mode: 'append', source: 'host' })
await controller.importPptx(file, { mode: 'replace', confirm: false })

await controller.execute({ type: 'import.json', payload: { document } })
await controller.execute({ type: 'import.json', payload: { document, mode: 'append' } })
await controller.execute({ type: 'import.fika', payload: { document } })
await controller.execute({ type: 'import.pptxSafe', payload: { document } })
```

`import.json` is the canonical JSON bridge path. `import.fika` is for an already-decoded native `.fika` payload, and `import.pptxSafe` is for PPTX content that a trusted UI or host importer has already converted into a serializable deck payload. File-menu PPTX/JSON import replaces a 0–1 slide deck immediately and asks before replacing a longer deck; pass `mode: 'append'` or `confirm: false` on the controller to override that.

Raw `.fika` decryption, raw PPTX parsing, `File` / `ArrayBuffer` reads, DOM parsing, media blob extraction, and other DOM-heavy import work stay outside the agentic JSON bridge. Do not send those boundaries through `controller.execute()` unless the result is already data-safe.

## Host Safety Rules

- Use commands or domain methods, not Zustand stores.
- Prefer deterministic IDs for multi-command batches.
- Use returned IDs after every create command.
- Use `canExecute()` to reject unsupported command types early.
- Use `meta.dryRun` to validate payload shape and references before risky edits.
- Keep command batches small enough that a failed result can be inspected and retried by command ID.
- Use `deck.set`, `deck.patch`, `import.json`, `import.fika`, or `import.pptxSafe` for whole-document writes so title/slides validation and JSON cloning happen before mutation.
- Convert raw `.fika` and PPTX imports to a data-safe document before calling the agentic import APIs.
- Treat `controller.export.json()` as the stable serializable export path for host-side persistence.

## sciobot-next Usage Examples

Use `controller.execute()` when sciobot represents an agent action as JSON:

```ts
import type { FikaAgentCommand } from 'fika-editor/embed'

const command: FikaAgentCommand = {
  type: 'deck.setTitle',
  payload: { title: 'Cell Biology Review' },
  meta: { source: 'agent', label: 'Rename generated deck' },
}

const capability = controller.canExecute(command)
if (!capability.ok) throw new Error(capability.reason)

const result = await controller.execute(command)
if (!result.ok) {
  reportAgentBridgeError(result.errors)
}
```

Use domain APIs when the React host already has a `FikaController` instance and wants typed helper methods:

```ts
const slide = await controller.slides.create({
  select: true,
  slide: {
    elements: [],
    background: { type: 'solid', color: '#fff' },
  },
}, { source: 'agent', label: 'Create sciobot slide' })

if (!slide.ok || !slide.data) return

const text = await controller.elements.create({
  slideId: slide.data.id,
  element: {
    type: 'text',
    left: 72,
    top: 72,
    width: 640,
    height: 120,
    rotate: 0,
    content: '<p>Learning objective</p>',
    defaultFontName: '',
    defaultColor: '#111',
  },
})

if (text.ok && text.data) {
  await controller.element.text(text.data.id, { content: '<p>Explain mitosis in five steps</p>' }, { slideId: slide.data.id })
  await controller.links.set(text.data.id, { type: 'web', target: 'https://sciobot.app' }, { slideId: slide.data.id })
}
```

Domain helpers cover specialized model areas without requiring store access:

```ts
await controller.tables.setCell(tableElementId, 0, 1, { text: 'Hypothesis' }, { slideId })
await controller.charts.setData(chartElementId, {
  labels: ['Before', 'After'],
  legends: ['Class average'],
  series: [[62, 81]],
}, { slideId })
await controller.media.setImageSource(imageElementId, '/fika-assets/imgs/example.png', { fixedRatio: true }, { slideId })
await controller.slides.setRemark(slideId, '<p>Ask students to compare both bars.</p>')
```

Use `subscribe()` to connect Fika events to sciobot persistence, telemetry, or active selection state:

```ts
const unsubscribe = controller.subscribe(event => {
  if (event.type === 'documentChanged') {
    queueAutosave(controller.export.json())
  }

  if (event.type === 'selectionChanged') {
    syncAgentSelection(event.data)
  }

  if (event.type === 'commandFailed') {
    reportAgentBridgeError(event.result?.errors)
  }
})

// Call before unmounting or replacing the controller.
unsubscribe()
```

Use `executeBatch()` when one agent instruction expands to multiple bridge commands and should produce one undo step:

```ts
const results = await controller.executeBatch([
  { type: 'slides.select', payload: { slideIdOrIndex: slideId } },
  { type: 'slides.setBackground', payload: { slideId, background: { type: 'solid', color: '#f8fafc' } } },
  {
    type: 'elements.update',
    payload: {
      slideId,
      elementId: [titleElementId, bodyElementId],
      patch: { defaultColor: '#0f172a' },
    },
  },
], { atomic: true })

const failed = results.find(result => !result.ok)
if (failed) reportAgentBridgeError(failed.errors)
```

The bridge does not load styles or static assets. The React host must load `fika-embed.css` with a `<link>` from the same `assetBaseUrl` used for `mocks/` and `imgs/`; do not import the CSS into the sciobot Vite/PostCSS pipeline. See [`EMBED.md`](./EMBED.md) for the React loader example and production copy constraints.

## Migration Guide

Keep legacy document calls at persistence boundaries:

```ts
controller.setDocument(await loadPresentationDocument(id))
await savePresentationDocument(controller.getDocument())
```

Migrate in-editor agent edits from whole-document replacement to commands or domain APIs:

```ts
// Legacy: replace the complete document after changing one field.
const document = controller.getDocument()
controller.setDocument({
  ...document,
  title: 'Generated lesson',
})

// Agentic: mutate only the intended field and get a result.
await controller.deck.setTitle('Generated lesson', { source: 'agent' })
```

```ts
// Legacy: create a slide by appending to document.slides.
const before = controller.getDocument()
controller.setDocument({
  ...before,
  slides: [...before.slides, generatedSlide],
})

// Agentic: create through the bridge and use the returned ID.
const created = await controller.slides.create({
  slide: { ...generatedSlide, id: undefined },
  select: true,
})
if (created.ok && created.data) {
  await controller.slides.setRemark(created.data.id, '<p>Generated by sciobot</p>')
}
```

```ts
// Legacy: save after every small mutation.
controller.setDocument(nextDocument)
await savePresentationDocument(controller.getDocument())

// Agentic: batch related mutations, then autosave from documentChanged.
await controller.executeBatch(commands, { atomic: true })
```

Use `controller.export.json()` for a synchronous serializable snapshot. Use `controller.import.json(document)`, `controller.execute({ type: 'import.json', payload: { document } })`, or `controller.execute({ type: 'export.json' })` when sciobot needs command results for whole-document import/export.