# Myna parity checklist

This is a prioritized implementation and verification plan, not a claim of Canva or HyCanvas parity. The baseline is source inspection on 2026-09-22. An item is checked only after its acceptance criterion is verified; source presence alone does not close an item. Browser findings and screenshots belong in the [HyCanvas audit](./audits/hycanvas-2026-09-22/README.md).

Evidence: [editing capability inventory](./audits/hycanvas-2026-09-22/myna-capability-inventory.md) and [services/content/export inventory](./audits/hycanvas-2026-09-22/hycanvas-service-inventory.md). They identify concrete source paths and distinguish implementation from service dependencies. The runtime audit takes precedence when it contradicts a source inference.

Status labels used below: **Existing** means a Fika/Myna source implementation exists and needs regression verification or better exposure; **Surface gap** means reuse an existing core capability; **Partial** means extend an existing subset; **Missing candidate** means an equivalent was not found in the inspected source; **Service** means an actual host/provider integration; **Decision** means a separately scoped product choice. These are source-based classifications, not runtime results.

Ownership: **Fika** owns editing, document schema, renderer, portable export and embed contracts; **Sciobot** owns identity, durable storage, catalogs, AI, collaboration and service jobs; **Both** requires a reviewed contract between them. Check existing Sciobot services before building equivalents of the HyCanvas backend.

Keep the editor unbranded and neutral, with the existing ink/Nordic design. Document brand kits must never recolor editor chrome. Existing typography, image cropping/filters, charts, table editing, rulers/guides, layers, undo and editable file/PPTX export must not be presented as wholly absent or rebuilt without evidence.

## Phase 0 · P0: establish a reproducible interaction baseline

- [ ] **00.01 · Existing · Both:** Record runnable standalone and `/dev/myna` launch instructions and exact revisions. **Accept:** a clean local launch opens the intended Myna build, locale and asset bundle in both hosts.
- [ ] **00.02 · Existing · Fika:** Capture neutral chrome reference screenshots across common viewport sizes. **Accept:** one document header, no product wordmark, consistent ink controls, no accidental purple/green chrome, and no clipped panels at 600/1024/1600 px.
- [ ] **00.03 · Existing · Fika:** Exercise every rail drawer at 240/300/440 px. **Accept:** all visible controls fit, remain keyboard reachable and have no unintended horizontal scrolling.
- [ ] **00.04 · Existing · Fika:** Verify dock/floating drawer transitions, resize persistence and dismissal. **Accept:** pinning changes layout predictably, floating drawers do not cover their rail, Escape returns focus, reload restores width/pin preferences.
- [ ] **00.05 · Existing · Fika:** Establish artwork-versus-editor bounds fixtures. **Accept:** off-page objects remain editable while thumbnails/downloads clip to page bounds and selection handles remain reachable.
- [ ] **00.06 · Existing · Both:** Audit read-only and locked-element behavior across all commands. **Accept:** UI mutations are disabled, navigation/view settings work, and host authorization is independently enforced.
- [ ] **00.07 · Existing · Fika:** Add representative undo/redo transaction fixtures. **Accept:** text commit, grouped duplication, resize, crop, page reorder and guide clear each restore the exact preceding state.
- [ ] **00.08 · Existing · Both:** Verify document round trips through standalone and host mount. **Accept:** title, viewport, elements, groups, guides, media and supported metadata survive save/load without unintended mutation.
- [ ] **00.09 · Existing · Both:** Capture locale regression screenshots for en/cs/sk/pl. **Accept:** no new literal English UI, clipped long labels or accidental translation of authored text after live switching.
- [ ] **00.10 · Partial · Both:** Convert the runtime HyCanvas audit into evidence-linked comparisons. **Accept:** every claimed reference behavior has an exercised route/control or an explicit unavailable/service-required note.

## Phase 1 · P1: expose existing editing power coherently

- [x] **01.01 · Surface gap · Fika:** Reorganize contextual Properties into consistent collapsible sections. **Accept:** text/image/shape/table/chart selections reveal relevant controls without fixed-width clipping or duplicate toolbars.
- [ ] **01.02 · Existing · Fika:** Verify font family/size and inline emphasis controls. **Accept:** bold, italic, underline, strike, sub/superscript and mixed selections preserve correct rich-text runs through undo/export.
- [ ] **01.03 · Existing · Fika:** Verify paragraph and box typography controls. **Accept:** alignment, lists, indent, line/paragraph spacing, padding, vertical alignment and auto/fixed height update the intended text box.
- [ ] **01.04 · Surface gap · Fika:** Surface character spacing clearly. **Accept:** the existing `wordSpace`/letter-spacing renderer has an accessible control and matches preview/download for positive and negative values.
- [ ] **01.05 · Surface gap · Fika:** Make image crop and shape/ratio clipping discoverable. **Accept:** image selection exposes crop, cancel/apply, aspect presets and mask choices; replacing an image retains intended crop geometry.
- [ ] **01.06 · Existing · Fika:** Verify image adjustment presets and individual controls. **Accept:** brightness/contrast/blur/saturation/hue/grayscale/sepia/invert/opacity, reset and undo match exported raster output.
- [ ] **01.07 · Surface gap · Fika:** Unify image flip, radius, shadow, outline, tint and background actions. **Accept:** each existing action is reachable from the image inspector with live preview and a clear reset scope.
- [ ] **01.08 · Surface gap · Fika:** Expose existing position/alignment/distribution/group controls consistently. **Accept:** multi-selection operations preserve relative order, group membership and one undo transaction.
- [x] **01.09 · Surface gap · Fika:** Replace fixed 3×3 insertion with the native table-size chooser. **Accept:** keyboard/pointer users select supported row/column counts and insert an editable table centered on the page.
- [ ] **01.10 · Existing · Fika:** Verify all chart/data/table editing paths in Myna. **Accept:** eight chart types, stacking, data changes, themes, table text/cell fill/borders and available structural operations work without leaving the design workflow.

## Phase 2 · P1: design library, templates and reusable content

- [ ] **02.01 · Partial · Both:** Define a paginated template catalog contract. **Accept:** categories/tags/query/size filters return stable IDs and distinguish loading, empty, unavailable and retry states.
- [ ] **02.02 · Partial · Fika:** Rank templates by page dimensions and aspect ratio. **Accept:** exact-size suggestions appear first; other sizes stay discoverable and insertion describes scaling/cropping policy.
- [x] **02.03 · Missing candidate · Both:** Save a design as a reusable personal template on this device. **Accept:** a two-page template can be saved, reloaded, searched and inserted without modifying its source.
- [ ] **02.04 · Service · Sciobot:** Add template ownership, workspace visibility and access checks. **Accept:** private templates and previews cannot be listed or fetched by unauthorized accounts.
- [x] **02.05 · Partial · Fika:** Support multipage template insertion as one operation. **Accept:** original pages remain, IDs/group references are remapped, insertion selects the new content, and one undo removes it.
- [ ] **02.06 · Partial · Both:** Add favorites and recently used templates. **Accept:** state survives reload for the intended user scope and removed/inaccessible entries degrade cleanly.
- [ ] **02.07 · Partial · Fika:** Expand authored text pairings and preview categories. **Accept:** previews use actual fonts, insertion stays independently editable/grouped, and localized starter text fits supported sizes.
- [ ] **02.08 · Partial · Both:** Add template asset/font portability checks. **Accept:** saved templates resolve their assets after reload and portable export does not depend on temporary blob URLs.
- [ ] **02.09 · Missing candidate · Both:** Define template fillable/locked-region semantics separately from layer locks. **Accept:** fillable fields remain editable while protected structure follows host policy through controller and export paths.
- [ ] **02.10 · Partial · Fika:** Give shape catalogs stable names and searchable metadata. **Accept:** localized shape names replace ordinal-only labels where available, and searching finds meaningful matching shapes without raw English identifiers.

## Phase 3 · P1: frames, layout and page organization

- [ ] **03.01 · Missing candidate · Fika:** Design a persistent photo-frame representation. **Accept:** rectangular/round/circular frames retain source image, crop and fit geometry through save/load and export.
- [ ] **03.02 · Missing candidate · Fika:** Implement photo-frame fill and replacement interactions. **Accept:** clicking or dropping an image fills the target frame, supports repositioning, and undo restores its previous contents.
- [ ] **03.03 · Missing candidate · Fika:** Implement editable multi-cell photo grids. **Accept:** common 2/3/4/6/9-image layouts expose gutter and cell geometry without flattening the composition.
- [ ] **03.04 · Missing candidate · Fika:** Add feature/hero photo-grid layouts and image swapping. **Accept:** mixed-span cells preserve cover crop and swapping affects only the selected cell images.
- [ ] **03.05 · Existing · Fika:** Verify zoom-aware rulers and persisted page guides. **Accept:** ruler drag/keyboard creation, reposition, remove, lock, visibility, clear and undo work at multiple zoom levels and never enter artwork export.
- [ ] **03.06 · Existing · Fika:** Verify snapping and layout-grid controls. **Accept:** visible-guide snapping respects zoom tolerance; Alt-grid snapping uses configured spacing; hidden guides do not become invisible snap targets.
- [ ] **03.07 · Partial · Fika:** Improve canvas navigation discoverability. **Accept:** fit, zoom-to-selection, pan and relevant shortcuts are accessible without changing artwork coordinates or losing selection.
- [ ] **03.08 · Surface gap · Fika:** Expose existing page sections in the Myna overview. **Accept:** section names/order survive export/import, page moves update the intended section, and undo restores structure.
- [ ] **03.09 · Surface gap · Fika:** Add a page outline/notes view using existing text and remarks. **Accept:** every page appears once, searchable titles/notes navigate to the correct page, and edits remain undoable.
- [ ] **03.10 · Service · Both:** Add optional page workflow status and assignee board. **Accept:** authorized assignments persist, unavailable member services have an honest fallback, and viewers cannot change workflow data.

## Phase 4 · P1/P2: durable media, stock and fonts

- [ ] **04.01 · Service · Both:** Define a durable personal/workspace asset library contract. **Accept:** assets outlive their insertion document and library search/pagination does not misrepresent current-document reuse as stock.
- [ ] **04.02 · Service · Sciobot:** Implement asset folders, tags, rename and ownership. **Accept:** organization survives reload, access scopes are enforced and moving an asset does not break references.
- [ ] **04.03 · Existing · Both:** Verify upload queue progress, retry, cancellation and constraints. **Accept:** a mixed successful/failed batch preserves successes, retries only failed files and reports localized limit errors.
- [ ] **04.04 · Service · Both:** Define referenced-asset deletion and quota behavior. **Accept:** deleting library entries cannot silently destroy saved designs; quota usage and recoverable failures are accurate.
- [ ] **04.05 · Service · Both:** Add validated image URL import with durable ingestion. **Accept:** remote content is stored/resolved safely, failures are actionable and saved designs do not rely on expiring provider hotlinks.
- [ ] **04.06 · Service · Both:** Add stock search/provider adapters and offline fallback. **Accept:** source/kind/orientation filters, pagination, cancellation and retry work; disabling providers leaves local editing usable.
- [ ] **04.07 · Missing candidate · Both:** Preserve stock licensing and attribution metadata. **Accept:** source/license information survives insertion and required credits appear in applicable exported artifacts.
- [ ] **04.08 · Partial · Both:** Validate editable SVG/PDF import versus raster import. **Accept:** the UI states actual editability, unsupported features are reported and imported assets survive reload/export.
- [ ] **04.09 · Partial · Both:** Add custom font persistence and portability on existing font infrastructure. **Accept:** supported uploaded fonts render after reload/offline round trip; invalid files and substitution are disclosed.
- [ ] **04.10 · Missing candidate · Both:** Add permission-aware camera/microphone/screen capture. **Accept:** real recording produces insertable durable media, permission denial/cancel is handled and capture stops when the workflow closes.

## Phase 5 · P2: advanced graphics and editing models

- [ ] **05.01 · Missing candidate · Fika:** Add curved/arc text with editable typography. **Accept:** curvature changes preserve text editing, selection, bounds and portable rendering rather than rasterizing the text immediately.
- [ ] **05.02 · Missing candidate · Fika:** Define reusable ordered effect-stack semantics. **Accept:** enabled/order/parameter changes persist and produce the same result in editor, thumbnails and export.
- [ ] **05.03 · Missing candidate · Fika:** Implement named text effects using the effect model. **Accept:** outline/shadow/glow and selected named presets expose editable parameters and undo without deleting unrelated effects.
- [ ] **05.04 · Missing candidate · Fika:** Add image duotone and richer tonal adjustments. **Accept:** highlight/shadow colors and intensity are editable, resettable and faithfully exported.
- [ ] **05.05 · Partial · Fika:** Add non-destructive auto-enhance with preview. **Accept:** the operation adjusts supported image parameters, preserves original media and can be reverted in one undo.
- [ ] **05.06 · Service · Both:** Integrate background removal with retained originals. **Accept:** actual provider output is stored, cancellation/retry work, and restoring the original is lossless.
- [ ] **05.07 · Missing candidate · Fika:** Implement mask refinement after removal. **Accept:** add/erase/refine operations modify a persisted mask with undo and consistent exports.
- [ ] **05.08 · Missing candidate · Fika:** Add Boolean shape operations and outline-stroke conversion. **Accept:** resulting paths remain editable, preserve placement and match raster/vector export fixtures.
- [x] **05.09 · Missing candidate · Fika:** Add editable QR insertion as a native tool. **Accept:** changing content regenerates a scannable code with retained parameters; insertion/editing are undoable.
- [ ] **05.10 · Missing candidate · Fika:** Extend video controls to real trim/scrub settings. **Accept:** persisted start/end ranges control playback and relevant exports; unsupported codecs produce explicit errors.

## Phase 6 · P1/P2: production design storage and brand kits

- [ ] **06.01 · Service · Sciobot:** Promote `/dev/myna` storage into durable owned design records. **Accept:** authenticated designs have stable IDs, title, thumbnail and reliable cross-device reload using existing host storage.
- [ ] **06.02 · Service · Both:** Implement conflict-safe autosave and recovery. **Accept:** interrupted/offline edits recover without silent overwrite, status is accessible and competing revisions produce an explicit resolution path.
- [ ] **06.03 · Service · Sciobot:** Add file organization, duplicate and trash/restore. **Accept:** design/asset references remain valid and access permissions are preserved or deliberately reset by each operation.
- [ ] **06.04 · Service · Both:** Add share links and viewer/editor permissions. **Accept:** expiry/revocation and original-data access are enforced server-side, not only by hiding editor controls.
- [ ] **06.05 · Service · Sciobot:** Define brand-kit CRUD, versioning and workspace access. **Accept:** multiple kits persist with colors/fonts/logos and authorized users can select the intended version.
- [ ] **06.06 · Partial · Both:** Map brand semantic roles onto existing style/theme data. **Accept:** changing defaults affects new content without unexpectedly recoloring authored elements or editor chrome.
- [ ] **06.07 · Missing candidate · Fika:** Add scoped, previewed brand restyling. **Accept:** selection/page/design scopes are explicit, unmapped colors are handled and one undo reverts the full operation.
- [ ] **06.08 · Service · Both:** Add brand asset/logo insertion and font resolution. **Accept:** inserted assets survive reload/export and inaccessible kits never leak private media.
- [ ] **06.09 · Service · Both:** Implement brand lint and targeted fixes. **Accept:** violations identify actual elements, fixes are previewable/undoable and off/warn/block policies have distinct behavior.
- [ ] **06.10 · Service · Both:** Enforce required watermark/brand rules across output paths. **Accept:** raster, PDF, PPTX, portable files and controller-triggered exports apply the configured policy consistently.

## Phase 7 · P2: assistance, collaboration and authored accessibility

- [ ] **07.01 · Service · Both:** Expose Myna context to existing Sciobot AI tooling. **Accept:** the host supplies document/selection context through validated Fika APIs without duplicating accounts, provider settings or secrets in Fika.
- [ ] **07.02 · Service · Both:** Support brief-to-design generation with reviewable results. **Accept:** generated pages/assets are valid editable content, broad changes have a review path and one undo reverts the accepted operation.
- [ ] **07.03 · Service · Both:** Add selection edit, restyle and explicit content-translation actions. **Accept:** only the intended scope changes; UI locale switching never invokes content translation.
- [ ] **07.04 · Service · Both:** Make long AI/image operations cancellable and conflict-aware. **Accept:** progress/retry/cancel are accurate, stale results do not overwrite newer edits and partial assets remain recoverable.
- [ ] **07.05 · Service · Both:** Add deterministic critique/layout/contrast assists where feasible. **Accept:** suggestions reference real elements, apply as validated undoable edits and work without claiming an unavailable AI provider.
- [ ] **07.06 · Service · Both:** Design realtime coediting and collaborative undo semantics. **Accept:** concurrent text/geometry/page edits converge, presence does not mutate documents and undo cannot erase another user's unrelated work.
- [ ] **07.07 · Service · Both:** Implement durable revision history and restore. **Accept:** named/scheduled versions can be previewed/restored with permissions, while local undo stays a separate mechanism.
- [ ] **07.08 · Service · Both:** Add anchored comments and approval workflow. **Accept:** comments follow elements or become intelligibly orphaned; approval access/state is enforced by APIs and export policy.
- [ ] **07.09 · Missing candidate · Fika:** Persist authored alt text, decorative status, language and reading order. **Accept:** metadata survives save/load and a semantic preview follows the authored order while skipping decorative content.
- [ ] **07.10 · Missing candidate · Both:** Add actionable authored-design accessibility checks. **Accept:** contrast/missing-alt/small-text/order findings focus the offending element, proposed fixes undo cleanly and output validation uses the same metadata.

## Phase 8 · P1/P2: export fidelity and editor accessibility

- [ ] **08.01 · Existing · Both:** Establish independent artifact checks for current raster/PDF/PPTX/portable outputs. **Accept:** page sizes/counts, transparency, full-resolution images, watermark and editable content match the supported format contract.
- [x] **08.02 · Partial · Fika:** Add arbitrary page-range selection and predictable filenames. **Accept:** reordered/noncontiguous ranges export exactly the requested pages and ZIP names remain stable/localized where appropriate.
- [x] **08.03 · Implemented · Fika:** Vector SVG export for pages, ordered page ranges and selected objects, with explicit per-object raster fallbacks. **Accept:** supported shapes/text remain vector and unsupported effects are disclosed rather than silently omitted.
- [ ] **08.04 · Missing candidate · Both:** Add selectable/vector and accessible tagged PDF as explicit options. **Accept:** text selection, embedded fonts, reading order/language/tags are independently inspected; saved-versus-live export source is unambiguous.
- [ ] **08.05 · Missing candidate · Both:** Add motion/deck exports as separate format deliverables. **Accept:** each enabled GIF/APNG/Lottie/video path generates a playable artifact with verified timing; unavailable encoders are not advertised as working.
- [ ] **08.06 · Partial · Both:** Add export preflight, cancellation and bounded resource handling. **Accept:** missing media/fonts, unsupported effects and oversized designs produce actionable failures without freezing or corrupting the document.
- [ ] **08.07 · Partial · Fika:** Implement verified OS printing before commercial-print claims. **Accept:** page count, physical size, margins/orientation and loaded images are correct, with no editor guides/grid/chrome in print output.
- [ ] **08.08 · Existing · Fika:** Complete a keyboard-only design workflow audit. **Accept:** insert/edit/select/group/reorder/crop/page/export flows are usable with predictable focus, Escape behavior and no traps.
- [ ] **08.09 · Partial · Fika:** Add shortcut discoverability, touch parity and motion/contrast preferences. **Accept:** documented shortcuts match behavior, essential controls work with touch and reduced motion/high contrast do not hide state.
- [ ] **08.10 · Existing · Both:** Extend localization and non-Latin artwork regression coverage. **Accept:** every new control/error/status works in en/cs/sk/pl; CJK/RTL authored content is rendered/exported correctly without mirroring page geometry.

## Phase 9 · P3: separately scoped products and conditional integrations

- [ ] **09.01 · Decision · Both:** Decide whether a dedicated whiteboard mode belongs in Fika. **Accept:** an approved scope distinguishes infinite navigation, connectors/frames/ink and facilitation from the current design canvas.
- [ ] **09.02 · Decision · Both:** Scope a document-writing mode independently. **Accept:** semantic text flow, pagination and DOCX/export requirements have a model contract; a large text box is not labeled document-mode parity.
- [ ] **09.03 · Decision · Both:** Scope a spreadsheet mode independently. **Accept:** formula dependency/recalculation, cell selection and import/export requirements are explicit before exposing a sheet surface.
- [ ] **09.04 · Decision · Both:** Scope a full video editor independently of media elements. **Accept:** timeline, trims, audio synchronization, transitions and render-job contracts define a playable/editable product.
- [ ] **09.05 · Decision · Both:** Define a validated mini-tool extension API. **Accept:** allowed read/insert/edit scopes are explicit and existing native chart/table/shape capabilities are reused.
- [ ] **09.06 · Decision · Both:** Decide whether third-party sandboxed apps are required. **Accept:** an actual isolation/message/capability design exists before advertising an app marketplace; HyCanvas's deferred iframe runtime is not treated as shipped.
- [ ] **09.07 · Decision · Both:** Evaluate responsive static website export as its own output mode. **Accept:** generated files preview/download correctly, and limitations of layout conversion are explicit.
- [ ] **09.08 · Service · Sciobot:** Scope actual website hosting only if requested. **Accept:** deployed URLs, storage/CDN/domain/TLS and any access gate work end-to-end; local password flags are never represented as security.
- [ ] **09.09 · Service · Sciobot:** Scope actual social publishing separately from a local planner. **Accept:** authorized provider posting, durable jobs, failure/retry and delivered post IDs exist before a plan is marked posted.
- [ ] **09.10 · Decision · Both:** Scope commercial print/bleed/CMYK and fulfillment separately. **Accept:** each claimed production-print property is verified in artifacts and any purchase flow has a real vendor/payment implementation; no parity is inferred from “print-ready” wording.

## Completion policy

Attach runtime evidence to existing controls, artifact evidence to exports, and service evidence to integrations before checking an item. A screenshot of a button is not proof that its operation works. Preserve the neutral unbranded editor through every phase, keep source and runtime findings separate, and update this checklist when the audit disproves a gap rather than adding duplicate implementations.

## Implemented iteration: 2026-09-22

The following work is implemented in the current workspace. [Screenshots and validation evidence](audits/myna-2026-09-22/README.md). Checkmarks below
are limited to the acceptance criteria actually exercised; broader host/service
items remain open. This is progress toward parity, not a declaration of parity.

| Area | Implementation and evidence | Remaining boundary |
| --- | --- | --- |
| Inspector | `MynaInspector.tsx`; `e2e-myna-inspector.mjs` checks native page/text/image/table/chart/multi contexts at 240/300/440 px, geometry mutation, crop entry and read-only | Exhaustive typography/effect/export matrix remains open |
| Frames/grids | `photoFrames.ts`, `MynaFramesPanel.tsx`; `photoFrames.test.ts` and `e2e-myna-frames.mjs` check insertion, cover crop, serialization, gutters, swap, canvas drop, undo and PNG pixels | Native grouped images; rotated-grid gutter reflow and arbitrary cell topology remain unsupported |
| Personal templates | `templateLibrary.ts`, `MynaTemplateLibrary.tsx`; unit/browser tests cover save, ID/reference remapping, adaptive insertion, undo, favorites, recent use, reload, rename/search/delete | Device-local, not cloud/workspace template permissions; external assets remain links |
| Table chooser | Native `TableGenerator` now uses keyboard buttons and labeled custom dimensions; `e2e-myna-elements.mjs` checks pointer 4×5 and keyboard 2×2 insertion | Existing table editing engine reused |
| QR | `qrCode.ts`, `MynaQrPanel.tsx`; independent jsQR decode unit/browser checks plus metadata editing and undo | Native image visual export; Fika metadata retains editing settings |
| Page organization | `MynaPageOutline.tsx`; browser test checks section creation/removal, escaped multiline notes and read-only | Outline uses native page content; notes require explicit save and edits are plain text |
| Navigation | `MynaZoomControl.tsx`, `canvasFit.ts`; browser test measures rotated/off-page selection bounds, repeated fit and exact zoom | No minimap or shortcut remapping added |
| Export | `exportPages.ts`, `MynaDownload.tsx`; unit/browser tests validate ranges, requested ZIP entry order, PNG dimensions and cancellation | PDF remains raster; vector/tagged/motion paths remain open |

Existing broader Myna fixtures remain the regression baseline. Shared fixes also
cover SVG bitmap decoding and crop-click propagation. Canonical `bun.lock`
records the QR encoder and independent test decoder; unrelated dependency
versions remain pinned.

### Nested frames (2026-09-22)

Implemented native nested containers, hierarchy/reparenting controls, child transforms,
rotated ancestor clipping, subtree clipboard/deletion and frame selection SVG export.
Validation: `nestedFrames.test.ts`, `e2e-myna-nested-frame-ui.mjs`, and
`e2e-myna-nested-frame-export.mjs`. Auto layout and responsive constraints remain open.
