# Myna design mode

Myna is Fika's graphic design workspace, enabled with `viewMode: 'canva'`
(`'myna'` is an alias). It uses the same document model, canvas, history,
controller, media uploader, and agentic APIs as the presentation editor.

```ts
import { mountFika, createMynaDocument } from 'fika-editor/embed'
import 'fika-editor/embed.css'

const { controller } = await mountFika(document.getElementById('editor')!, {
  viewMode: 'canva',
  document: createMynaDocument(), // optional: Myna supplies this starter by default
  assetBaseUrl: '/fika-assets',
  onChange(document) { /* persist the full document, including viewport */ },
})
```

The host needs a definite height. Render only one live Fika instance at a time
(the engine stores are shared). Changing modes requires unmounting/remounting.
An explicit document takes precedence over the square starter design.
`loadDocument`, `readOnly`, locale, media configuration, and export watermarks
continue to work. `controller.setReadOnly(true)` disables Myna mutations while
retaining page navigation and downloads. Host/agent edits remain possible.

Standalone development: run `npm run dev` from the `fika` directory, then open
`http://127.0.0.1:5173/?mode=myna`. Add `&locale=cs`, `&locale=sk`, or
`&locale=pl` to start in another language; `en` is the default. The header
language control can switch languages while editing.

## Implemented workflows

- One full-page document header with editable title, file menu, language, resize,
  properties, and download controls; unbranded, neutral ink/Nordic styling.
- Design, elements, text, uploads, assets, pages, styles, and layers drawers;
  contextual properties; responsive canvas; horizontal page strip. Drawers can
  be pinned or floated and resized by dragging or using arrow keys on their
  separator. Width and pin preferences persist per device. Escape closes a drawer.
- Searchable page overview with duplication, deletion, arrow and drag reordering.
- Reusable document media library with search, media-type filters and usage counts.
- Six editable, locally generated templates, searchable by name/category.
  Inserting one adds a page and leaves existing content intact.
- Text presets and grouped font pairings; native rich-text editing and font,
  spacing, alignment, color, and effect controls.
- Responsive searchable Elements drawer for native shapes, lines,
  freehand/polygon drawing, charts, and tables, with collapsible sections.
- Zoom-aware rulers and page guides: drag from the top or left ruler to add a
  guide, drag to reposition, or return it to the ruler to delete. Focus a ruler
  and press Enter or Space to add a guide at the page midpoint. Focused guides
  support arrow-key movement (1 px, or 10 px with Shift) and Delete.
  View settings control rulers, guide visibility, guide snapping, guide locking,
  clearing the current page's guides, and layout-grid spacing. Hold Alt while
  dragging an element to snap to the grid. Guides belong to the document's pages;
  ruler/grid preferences belong to the local editor. Guides and grids never
  appear in thumbnails or exported artwork.
- Off-page elements remain visible and editable on the surrounding canvas.
  Page thumbnails and exports remain clipped to the document dimensions.
- Native media insertion.
  Existing canvas toolbar retains math, code, and other Fika insert tools.
- Group-aware layer selection, inline renaming, duplication, deletion, keyboard
  and drag ordering, locking, and temporary editor visibility.
- Add, duplicate, delete, drag-reorder, and keyboard-accessible page movement.
- Ten design formats and custom dimensions (100–8192 whole pixels per side).
  Resize uses Fika's content-aware deck fitting and participates in history.
- Existing grouping, snapping, clipboard, undo/redo, image adjustments, and
  presentation/animation tools remain available through the shared engine.
- PNG, JPG, WebP, and flattened multipage PDF downloads, output scale, lossy
  quality, current/all/custom ordered page ranges, cancellable rendering, and ZIPs for multipage image exports. ZIP entries retain the original page numbers.
  PNG/WebP can omit the page background. Raster output is limited to 32 megapixels and 16384 pixels per side.
  Host watermark policies apply to these new downloads as well as PPTX.
- Editable JSON and PPTX through Fika's existing export menu.

## Parity iteration: editing and reusable content

- Contextual Properties now stacks native typography/image/shape/table/chart
  styling, geometry/arrangement and motion sections in collapsible panels.
  Multi-selection uses native shared-style and alignment controls. Existing crop,
  ratio and shape-mask actions work without the opening click closing the editor.
- Elements includes an accessible native 1–20 row/column table chooser, rectangular,
  rounded and circular photo frames, 2/3/4/6/9-cell grids and a hero grid.
  Cells are native grouped images with persisted frame metadata. Upload or reuse
  an image, reposition with crop, replace, clear, swap cells, adjust gutters, or
  drop an image file onto a frame on the canvas. Rotated grids retain native
  editing; the gutter reflow control is disabled for those grids.
- Editable QR codes generate offline with content, correction level and color
  controls. A quiet zone and contrast validation help maintain scannability.
  QR settings persist in Fika documents; PNG/PPTX retain the image appearance.
- Personal templates are saved on this device, separate from starter templates.
  Save all pages, search, favorite, browse recent use, rename/delete and insert
  an adapted copy with remapped IDs, groups, guides and internal links. This
  library has a 4 MiB storage budget and reports unavailable/quota errors.
  Blob-backed media is materialized; external asset links still depend on their
  original availability. Comments and speaker notes are excluded from templates.
- Pages exposes an outline, native section boundaries and explicitly saved notes.
  Editing notes in this surface saves plain text; existing rich notes are left
  unchanged until saved here. Notes and sections use the native document fields.
- Footer zoom adds exact percentage presets and fit-to-selection, accounting for
  rotated bounds, ruler space and overlay drawers. View changes do not change
  artwork geometry.
- SVG images now decode through the browser image/canvas path before bitmap
  caching, fixing SVG-backed placeholders, uploaded SVGs and QR raster exports.

These controls have English, Czech, Slovak and Polish labels. Feature-specific
browser regressions are registered as `myna-inspector:e2e`, `myna-frames:e2e`,
`myna-library:e2e`, `myna-qr:e2e`, `myna-zoom:e2e`, `myna-outline:e2e` and
`myna-export:e2e`. Unit fixtures cover frame geometry, template identity/storage,
QR decode round trips and export range validation. See the
[parity checklist](MYNA_PARITY_TODO.md) for evidence and remaining work.

## Scope and fidelity

HyCanvas's editor documentation and interaction layout inspired the workspace;
no HyCanvas source or assets were copied. Myna uses original templates and
Fika's native editing/rendering implementation.

This is a working design editor, not complete Canva service parity. It does not
supply a stock-media service, cloud brand kits, collaborative cursors/comments,
account sharing, AI image generation/background removal, social publishing,
or a video timeline. Myna and its template library support English, Czech, Slovak, and Polish.
New template pages use the current locale; changing languages preserves existing
design content. Pages share a document-wide
size. Layer visibility is temporary editor state, not persistent export state.

PDFs are flattened raster pages (CSS pixels map to 0.75 PDF points); text is
not selectable, and PDFs do not provide vector, CMYK, bleed, or crop-mark
output. Animated/video content exports as stills through the existing painter.
Exports load original-resolution images and use the host media resolver when
needed; unreadable images fail explicitly. Fonts must be available to the
browser. Fika's painter waits up to 15 seconds for complex chart/math resources;
unresolved complex resources retain its existing limitations.
No external stock catalog or external font service is required by Myna.

## Validation

- `npm run type-check`
- `npm test -- myna` (unit and browser tests; requires the development server)
- `FIKA_TEST_URL=http://127.0.0.1:5178 node scripts/e2e-myna.mjs`
  against a running standalone development server. Covers page lifecycle,
  resize, text, layers, image/PDF downloads, read-only, and narrow layouts.
- `npm test -- myna-rulers myna-view myna-guide-snap pageGuides`
  covers guide interactions, preferences, actual canvas snapping, and resize math.
- `npm run build:embed`

### Elements library and SVG download

Elements has one search field and category filter for tools, photo frames, photo grids,
shapes, lines, drawing, charts and tables. Frame previews keep their square aspect ratio;
the circle preview is circular. Choose the QR code tile to open the generator, then use
Back to return to the library. The same insertion and frame editing tools remain available.

Download → SVG exports the current page, all pages, a page range, or selected objects.
Multiple pages download as a ZIP containing one SVG per page. Selected objects use their
painted bounds and include selected group members. Page exports clip artwork to the page;
selection exports omit the page background. Photos are embedded, while supported shapes,
lines, text, tables and charts retain vector content. Available webfont declarations are
embedded where possible; recipients may still need matching fonts. Complex unsupported
objects/effects use individual embedded raster images, with a notice after export.
Host-configured export watermarks also apply to SVG downloads.

### Freeform page canvas

Myna shows pages together on one workspace. Drag a page title to position it anywhere,
including negative coordinates. Shift-click page titles to select several pages and drag
them together; holding Shift while dragging constrains movement to one axis. Focus a title
and use arrow keys for 1px movement (Shift: 10px). Undo/redo restores page positions.

The Pages drawer provides exact X/Y coordinates, page names, and Grid/Row/Column arrangement.
Selected objects can be moved to another page with their groups and linked notes/animations.
Fit all pages shows the complete layout; Fit focuses the active page. Wheel scrolling pans;
Ctrl/Command + wheel zooms, and Space + drag pans. Clicking an inactive page activates its
native editor. Offscreen pages are culled, with bounded-resolution previews at extreme zoom.

Page positions are stored in the document as `Slide.canvasPosition`; names use `canvasName`.
Existing documents receive a collision-free grid. Workspace layout is independent of page
order and page exports. Pages currently share the document's dimensions; this does not add
per-page dimensions or cross-page object multi-selection.

### Page alignment and workspace labels

Dragging page titles now snaps matching edges and centers and shows temporary alignment
lines. Matching gaps between neighboring pages show distance measurements. The tolerance
is six screen pixels at every zoom, and a multi-page selection keeps its internal offsets.
View → Snap pages to each other controls smart snapping. View → Snap pages and labels to
grid quantizes workspace movement using Grid spacing; Show layout grid also displays the
workspace grid. Nearby page alignment takes priority over the grid. Hold Alt to bypass
page/label snapping; Shift constrains a drag to one axis. These workspace shortcuts do not
change the existing element-drag grid shortcut.

Pages → Workspace labels adds independent text annotations above the active page. Drag to
position, double-click or press Enter to edit, and use the drawer to edit text/size or delete.
Escape cancels edits/drags; arrow keys nudge and Delete removes a focused label. Fit all
includes labels. Labels persist with the document and survive deletion of their storage
page, but are neither duplicated with a page nor included in page SVG/image/PDF exports.

Page drags also snap to ruler guides on stationary pages when Snap to guides is enabled.
Guide coordinates are converted from their page into workspace coordinates; guides on
moving pages are excluded. Gap indicators include end ticks. Escape cancels a page drag,
restores its starting positions, and clears temporary guides.

### Nested frames

Open Layers → Frames to add an empty frame or wrap selected artwork with Frame selection.
Frames can contain other frames. Select an object or frame and choose Parent frame to
reparent it without changing its canvas position. The tree supports collapse/expand and
individual child selection. Frame name, Clip content and Release children are available
when a frame is selected.

Drag a frame's canvas title to move its complete subtree. Translation and rotation carry
children; resizing changes the container without scaling child sizes. Copy, duplicate,
delete and undo preserve the hierarchy. Clipping respects rotated ancestor frames in
the editor, hit testing, previews, PNG and SVG, including selection exports. Nested
frame metadata is part of the saved document. This does not implement auto layout or
responsive child constraints.

### Standalone school identity showcase

The standalone `/?mode=myna&locale=cs` playground starts with the editable OBZOR school
identity: six staggered boards for the logo, campaign, typography, stationery, and
whitepaper. It opens fitted to the whole composition, with the library closed. Portrait
whitepaper and stationery pieces are native frames within the boards; logo geometry,
text and illustrative data graphics remain editable. Workspace annotations organize
the composition independently of exported artwork. The embed's document factory is
unchanged, so host applications retain their own starter and saved content.

### Workspace sections and comments

Pages → Workspace adds named sections and local comment cards outside page artwork.
Select member pages in a section's settings; each page belongs to at most one section.
Drag a section header to move its pages together, resize using its lower-right handle,
and double-click the header to rename. Sections grow to contain their member pages.
Removing a section retains the pages. Grid snapping, Shift axis locking, Alt bypass,
Escape cancellation, keyboard nudging and undo apply to workspace object movement.

Comment cards support editing, replies, and resolve/reopen, both on the canvas and in
the Pages panel. These are persisted local document threads, without user mentions or
network collaboration. Sections and comments participate in Fit all, survive deletion
of their storage page, and are excluded from page artwork exports.

At overview zoom, page titles become compact and unselected nested-frame titles are
hidden to keep the workspace readable. The school showcase uses three sections with
review comments and clear spacing between page and section headers.

Section titles occupy a separate header lane above their containers. Page titles scale
down with the overview, and comment cards scale as complete objects so their internal
text wrapping stays stable. Zoom-spacing regression checks cover 10–200%.

Performance architecture, measurements and regression commands are documented in [MYNA_PERFORMANCE.md](./MYNA_PERFORMANCE.md). Development render scanning is opt-in with `scan=1`.
