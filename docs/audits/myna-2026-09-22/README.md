# Myna implementation evidence, 2026-09-22

This iteration implements local editing workflows identified by the [HyCanvas audit](../hycanvas-2026-09-22/README.md). It preserves neutral, unbranded ink/Nordic UI. See [the checklist](../../MYNA_PARITY_TODO.md) for the still-open service and advanced-rendering work.

- [Contextual inspector](inspector.png): text styling with native controls; browser tests also exercise image, chart, table, page and multi-selection at three drawer widths.
- [Photo grids](frames.png): native image cells, uploaded test images and placeholders. Browser test verifies replacement, cover crop, gutter changes, swap, canvas drop, undo/redo and actual exported pixels.
- [Personal templates](library.png): persisted local design, favorites, rename and search. Browser test also verifies multi-page copy insertion with fresh IDs and undo.
- [Editable QR](qr.png): native QR image and parameter editor. An independent decoder reads Unicode payloads from generated SVG and the downloaded PNG.
- [Selection fit](zoom.png): rotation-aware fitting with overlay drawers. Browser checks cover repeated fit, exact zoom and 600/1000px layouts.

Also implemented: keyboard-accessible table dimensions, native page sections/outline/notes, ordered export ranges, original page numbers in ZIP entries, cancellation, and SVG bitmap decode support.

Validation: application type checking and embed build; 17 unit cases across frame geometry, template storage/remapping, QR decoding, export ranges and guide math; browser suites for inspector, frames, library, QR, zoom, outline, export, core editor, header, drawers, layers, locales and Elements. Scope-specific checks exercise native changes and output artifacts; no claim is made that all table/typography/animation operations have been exhaustively verified.

Personal templates are browser-local with a 4 MiB limit. Remote template media still needs its source. Grid gutter reflow is disabled after grid rotation. Notes edits are explicitly saved as plain text. PDF remains flattened raster. Cloud storage/catalogs/brand kits, realtime collaboration, external AI, tagged PDF exports and motion/video workflows remain on the backlog.

The Elements redesign adds unified search/categories, square photographic frame previews and a dedicated QR editor. SVG download now supports pages, page ranges, all pages and selected objects; supported primitives remain vectors, with individual raster fallbacks reported after download.

SVG validation downloads and parses real files: native text/shapes/tables, two charts with isolated identifiers, clipped SVG media, rotated selection bounds, all-page and ordered-range ZIPs, and a grayscale raster fallback with a visible notice. Sciobot’s embed test also downloads and parses a 1080 × 1920 SVG after save/reload. [Redesigned Czech Elements panel](elements-redesign-cs.png).

Freeform pages now share one canvas with saved positions and names. The active page uses the
native editor; other visible pages use model-driven rendering and are culled offscreen.
Browser checks cover zoom-aware title dragging, several pages moving together, stable camera
on page activation, negative positions, undo/redo, duplicate placement, read-only protection,
and object insertion on the correct page. Workspace placement does not change SVG page bounds.
The Pages drawer exposes exact positions, arrangement commands and cross-page object transfer.
Pages still share document dimensions; nested frames and cross-page object multi-selection are
not part of this iteration.

Sciobot integration verifies that dragged page positions survive host autosave and reload,
then exports the resized page as valid SVG. Named page titles and cross-page object transfer
(with undo restoring the source) pass browser checks. See [freeform workspace](freeform-pages.png).

Page dragging now has edge/center smart guides and equal-spacing measurements, plus optional
workspace grid snapping. [Alignment guides](page-alignment-guides.png) and [workspace labels](workspace-labels.png)
show the neutral UI. Eight snapping geometry tests cover zoom thresholds, groups, negative
coordinates, axis constraints, grid and equal gaps. Browser tests cover visible guides,
Alt bypass, grid quantization, label creation/edit/cancel/drag/undo, read-only protection,
owner-page deletion and duplicate handling. SVG excludes workspace labels; Sciobot verifies
label persistence across autosave/reload alongside page positions.
