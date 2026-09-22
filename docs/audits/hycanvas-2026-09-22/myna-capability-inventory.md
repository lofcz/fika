# Myna / HyCanvas capability inventory

Source inspection only, 2026-09-22. This document makes no runtime verification claims. Paths are relative to `/run/media/lofcz/ssd_external/GitHub`. “Missing” means no equivalent was found in the inspected Myna/Fika UI and document schema; it is not a claim that every repository file was exhaustively searched. HyCanvas source features may depend on services or feature flags and need separate runtime validation.

Classification: **Present** = explicit Myna path or reused Fika component exists; **Core / surface gap** = implementation exists but Myna lacks a dedicated/discoverable entry; **Partial** = meaningful subset exists; **Missing candidate** = distinct model or workflow not found; **Service integration** = host/backend capability needed.

## Text and typography

- **Present:** Insert heading/subheading/body and three grouped text combinations. Myna `MynaWorkspace.tsx` calls native text insertion and `catalog.ts:createMynaTextPair`. HyCanvas `EditorPanels.tsx:TextPanel` has a broader font-oriented browser. Myna should improve catalog richness and previews, not rebuild text insertion.
- **Present, surface review needed:** Font family/size, bold/italic/underline/strikethrough, sub/superscript, alignment, bullets/numbering, indent. Evidence: `fika/src/views/Editor/Toolbar/common/RichTextBase.tsx`, `TextStyleContent.tsx`; selected text uses native Properties and canvas floating text toolbar. HyCanvas analogous controls are in `PropertiesPanel.tsx` around lines 1390–1810.
- **Present:** Line spacing, paragraph spacing, box fill, padding, auto/fixed height and vertical alignment. Evidence: `TextStyleContent.tsx`, `common/textBoxStyle.ts`. Letter spacing is represented by `wordSpace`, rendered by `fika/src/paint/textPainter.ts` and `slidePainter.ts`; do not report it as wholly absent without checking which control currently exposes it.
- **Missing candidate:** Curved/arc text and editable named text effects (lift/hollow/splice/glow/neon/outline). HyCanvas `PropertiesPanel.tsx` around 1712–1757 defines textEffects/flow and `setCurve`. Fika `PPTTextElement` has no corresponding arc/flow/textEffects model. Existing element shadows do not constitute these effects.
- **Partial:** Font catalog discovery, paired type samples and branded typography. Existing `configs/font.ts` and native font picker should be reused. HyCanvas `EditorPanels.tsx:TextPanel` and `BrandPanel.tsx` add searchable catalog/brand usage. Separate “more presets” UI work from actual host font loading.

## Images, media, cropping and effects

- **Present, surface review needed:** Crop, shape/ratio clipping, horizontal/vertical flip, corner radius, color mask, outline, shadow, replace image, reset style and set as background. Evidence: `fika/src/views/Editor/Toolbar/ElementStylePanel/ImageStylePanel.tsx` around 164–227; `Canvas/Operate/ImageElementOperate.tsx`; floating `ImageToolbar.tsx`. These already flow through Myna Properties. A dedicated image editing drawer is a presentation/discoverability task, not a missing renderer.
- **Present:** Nine basic image adjustments (blur, brightness, contrast, grayscale, saturation, hue, sepia, invert, opacity) and nine presets. Evidence: `Toolbar/common/ElementFilter.tsx` around 27–56. HyCanvas's Filters/Adjust/Effects tabs in `PropertiesPanel.tsx` around 3483–3604 provide more visual previews and organization.
- **Missing candidate / partial:** HyCanvas duotone, auto-enhance, richer photo adjustments and reorderable effects stacks. `PropertiesPanel.tsx:ImageEffects`, `EffectStack.tsx` show stack semantics. Fika's basic filter object has no equivalent ordered effect stack or duotone definition in the inspected schema. Existing color mask is not equivalent.
- **Service integration:** Background removal and mask refinement. HyCanvas `PropertiesPanel.tsx` around 3410–3475 and `MaskRefineOverlay.tsx`. No matching Fika background-removal workflow found. Needs real provider/server contract and retained original, not a decorative button.
- **Present:** Upload queue with native constraints/progress and insert; document asset reuse with deduplication/search/type filters. Evidence: `CanvasTool/MediaPicker.tsx`, `hooks/useMediaQueue.ts`, Myna `MynaAssetsPanel.tsx`. Video/audio native elements and controls exist.
- **Missing candidate / service integration:** Persistent user/workspace media library folders/tags/search/quotas; stock facets/collections/provider provenance; screen/camera/audio capture. HyCanvas `EditorPanels.tsx:UploadsPanel` (folders around 1259), `StockPanel`. Myna Assets is current-document media, not a persistent account library.
- **Missing candidate:** Video scrub/trim and multi-clip timeline workflow. HyCanvas `PropertiesPanel.tsx:VideoSection` around 273–329 and `VideoSurface.tsx`. Fika media elements expose playback/autoplay etc.; no matching trim/timeline fields in inspected `PPTVideoElement`.

## Shapes, frames and drawing

- **Present:** Responsive category/search Elements drawer with native shapes, straight/dashed/arrow/curved lines, freehand/polygon and SVG path editor. Evidence: Myna `MynaElementsPanel.tsx`, `MynaWorkspace.tsx`; native `configs/shapes.ts`, `configs/lines.ts`, `CanvasTool/SVGPathEditor.tsx`. Individual shape names are absent from most source catalog entries; accessibility labels currently category plus ordinal.
- **Present, surface review needed:** Shape fill/gradient/pattern, outline, shadow, flip and geometry editing through Properties. Evidence: `ElementStylePanel/ShapeStylePanel.tsx`, `LineStylePanel.tsx`, common effect controls. HyCanvas has a more unified collapsible inspector.
- **Missing candidate:** Dedicated photo frames and multi-cell photo grids with drop-to-fill, cover positioning, rounded/circular masks and swap semantics. HyCanvas `EditorPanels.tsx:ElementsPanel` around 511–528 calls `insertFrame` and `insertPhotoGrid`. Fika shape image patterns and image shape clipping provide some building blocks, but no dedicated frame/grid node appears in `PPTElement` union. Do not call crop presets “frame parity.”
- **Missing candidate:** Boolean vector operations, outline-stroke, shape recognition and editable QR insertion. HyCanvas `PropertiesPanel.tsx` around 1111 and `EditorPanels.tsx` around 544. Fika SVG paths are editable, but these transformations need separate evidence/implementation.

## Charts and tables

- **Present:** Eight chart types (bar/column/line/area/scatter/pie/ring/radar), editable data dialog, stacked styling, colors/themes, background and grid color. Evidence: `MynaElementsPanel.tsx`; `ElementStylePanel/ChartStylePanel/index.tsx`; `Editor/ChartDataEditorDialog.tsx`. This is substantially more than “chart thumbnails.”
- **Partial:** HyCanvas includes more explicit grouped/stacked chart tiles and data workflows. Avoid treating stacked charts as missing: Fika already has `options.stack`. Check CSV/TSV import and fine axis/legend controls independently; source review here did not establish parity.
- **Present / surface gap:** Native table insertion and table styling with text, alignment, cell fill and borders. Myna drawer currently inserts fixed 3×3 only, while native `CanvasTool/TableGenerator.tsx` supports a configurable insertion UI. Prioritize surfacing that generator. Native table editing/context controls should be tested before claiming merge/split absent.
- **Missing candidate:** HyCanvas conditional table formatting (`PropertiesPanel.tsx` around 3667–3705) and richer spreadsheet workflows; no equivalent identified in inspected Myna table panel.

## Selection, guides, canvas navigation and pages

- **Present:** Single/multi selection, geometry, rotate, align/distribute/order and shared style panels. Evidence: Fika `Toolbar/ElementPositionPanel.tsx`, `MultiPositionPanel.tsx`, `MultiStylePanel.tsx`, canvas floating/context controls. Myna Properties reuses these via `Toolbar/index.tsx` selection-dependent tabs.
- **Present:** Group-aware Layers search/rename/visibility/lock/duplicate/delete and keyboard/drag z-order; page thumbnails with add/duplicate/delete/reorder and searchable Pages drawer. Evidence: Myna `MynaLayersPanel.tsx`, `MynaPagesPanel.tsx`, `MynaWorkspace.tsx`. Current hidden layers are editor visibility, not a distinct nonprinting/export property.
- **Present in current source / runtime check separately:** Persisted View preferences; rulers, page guides with metadata, snapping, guide lock/clear undo, layout grid. Evidence: Myna `viewStore.ts`, `MynaViewSettings.tsx`; `types/slides.ts:SlideGuide`; native canvas guide/drag integration. Grid uses Alt-drag snapping; guide snapping policy requires visible guides. Do not report newly implemented controls as future TODOs; assess fidelity.
- **Partial:** Full-bleed canvas, off-page editing, zoom/fit and resizable/pinnable drawers exist. HyCanvas `EditorApp.tsx`, `Canvas.tsx`, `MiniMap.tsx`, `ZoomControl.tsx` provide richer navigation. Dedicated minimap and gesture/zoom-to-selection parity require audit, not assumptions.
- **Core / surface gap:** Fika has slide section tags and remarks/speaker notes (`types/slides.ts`, native `Editor/Thumbnails` and presentation code), but Myna Pages drawer does not expose section editing or outline mode. HyCanvas `SlideOverview.tsx` has grid/outline/board with section grouping. Implement Myna section/outline UI on existing schema before inventing new metadata.
- **Service integration / missing candidate:** Page workflow status/assignee board, collaborative locks/presence, approval/activity/history panels. HyCanvas `SlideOverview.tsx`, `PropertiesPanel.tsx`, `ActivityPanel.tsx`, `HistoryPanel.tsx`, `ApprovalBanner.tsx`. Local undo history is not team version history.

## Export and document lifecycle

- **Present:** Myna PNG/JPEG/WebP, scale/quality, transparent PNG/WebP, current/all pages with ZIP, full-resolution image rendering, flattened multipage PDF and host watermark. Evidence: `MynaDownload.tsx`, `pdf.ts`, `embed/render.ts`. PDF pages are JPEG-backed, not selectable text/vector.
- **Core / surface gap:** Editable Fika document save/import and PowerPoint export already exist in shared file menu/export flow. Evidence: `Editor/EditorHeader/index.tsx`, `Editor/ExportDialog/index.tsx`, `hooks/useExport.ts`, `configs/exportTabs.ts`. Avoid implementing a second PPTX engine just because Myna Download has only four formats.
- **Missing candidate / partial:** SVG export, animated GIF/APNG/Lottie/video exports, selected arbitrary page ranges, print bleed/crop marks and accessible/tagged PDF. HyCanvas `ExportDialog.tsx` includes format branches and tagged PDF server request. Some formats depend on server endpoints. Its source comment still mentions deferred animated paths, so runtime completion must be established per format.
- **Partial:** Sciobot `/dev/myna` local document persistence exists; that is not cloud document list/versioning/shared templates. HyCanvas template save/reuse, dashboard and collaboration are separate product areas.

## Recommended TODO framing

1. Audit/fix exposure and visual consistency of existing text/image/table/position panels first. Do not count them as missing engines.
2. Add true photo-frame/grid model and interactions, broader searchable named templates/text presets, media library organization, section/outline page UI.
3. Add actual curved text/effect stack semantics, richer image effects and vector transforms with export fidelity.
4. Integrate provider-dependent stock, removal, AI, shared media/brand/history/collaboration through explicit host contracts.
5. Treat vector/print/accessibility/motion export as separate tested deliverables with precise format limitations.
