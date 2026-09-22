# HyCanvas → Myna: services/content/export source inventory

Source audit only, 2026-09-22. **No HyCanvas or Myna interaction/runtime verification was performed for this inventory.** Paths below are relative to `/run/media/lofcz/ssd_external/GitHub/HyCanvas`. Presence of code is evidence of an implementation path, not evidence that its provider, backend, permissions, rendering, or UX worked in this environment. Root should merge separate browser observations before marking any TODO verified.

Myna comparison baseline is the current source/docs: Fika has editable local templates, upload insertion, a document-media reuse drawer, shared native editing tools and PPTX/JSON export, raster downloads and flattened PDF; Sciobot `/dev/myna` uses local storage and the common embed lifecycle. Existing Sciobot/Fika capabilities must be checked before creating a duplicate feature. A menu or placeholder alone does not close a parity item.

## Content systems and integrations

### 1. Template library, authored templates, reuse (P1, editor + host catalog)
- Evidence: `frontend/src/components/editor/EditorPanels.tsx:120` (`TemplatesPanel`); `SaveAsTemplateDialog.tsx`; `ReuseSlidesDialog.tsx`; `backend/internal/httpapi/templates.go`; `backend/internal/templates/{templates.go,repository.go,transform.go}`; `packages/templates/src/{apply.ts,lockedregions.ts,fillable.ts,fill.ts,attribution.ts}`.
- Source behavior: server library query; accessible scope is public + own private + member workspaces. Ranks exact page dimensions, then aspect ratio within 2%; other sizes collapsible. Save-as-template and document download paths exist; insertion adds content instead of replacing the design. Package supports locked/fillable regions and attribution metadata.
- Myna gap candidate: six built-in templates are a useful starter, not a reusable personal/workspace library. Need categories/tags, previews, pagination/search/error states, custom template creation/update, favorites/recent, size-aware suggestions, single/multipage insert and a clear scaling policy.
- Dependencies: host catalog callbacks/API, persistent preview/asset storage, ownership and visibility, schema/version migration; locking policy distinct from editor-only layer lock.
- Acceptance: save a modified two-page design as a private template, reload, find by name, insert into another size, preserve existing pages and original template; one undo removes insertion; unauthorized/private entries do not leak; assets/fonts survive portable export.

### 2. Stock/media discovery and provenance (P1, host provider)
- Evidence: `EditorPanels.tsx:5549` (`StockPanel`); `backend/internal/httpapi/stock.go`; `backend/internal/stock/{stock.go,openverse.go,iconify.go}`; `packages/stock/src/{insert.ts,svg.ts,attribution.ts,embed.ts}`; bundled vectors under `backend/internal/stock/library/`.
- Source behavior: Browse/Favorites/Recent, search debounce, kind/category/style/orientation/source facets, distinct loading/error/retry/empty states; Openverse photos and Iconify vectors with bundled fallback; editable SVG insertion; catalog licensing/provenance and export credits machinery. Docs identify provider-off configuration for disconnected installs.
- Myna gap candidate: current Assets drawer reuses media in the current document; it is not a stock search or durable personal library. Add a distinct discover surface or provider-backed section without relabeling reuse as stock.
- Dependencies: configurable provider adapters, proxy/import into owned storage, pagination/cache/rate limits, SVG sanitization, attribution fields preserved in Fika document metadata, offline catalog and service-disabled behavior.
- Acceptance: search/filter/paginate, insert a photo and recolorable icon, reload/export without relying on provider hotlinks; required credits exported; provider failure offers retry and local content remains usable.

### 3. Upload library, organization, importing and capture (P1/P2, host storage + Fika importers)
- Evidence: `EditorPanels.tsx:1026` (`UploadsPanel`); `frontend/src/lib/{sdk.ts,pdfImport.ts}`; `backend/internal/uploads/{uploads.go,repository.go,direct.go,chunked.go,proxy.go}`; `backend/internal/httpapi/uploads.go`.
- Source/docs behavior: folders, tags, rename/search, drag/click insert, URL import, SVG/PDF import, recording helper, workspace/user quota meters; upload paths include progress and chunked/direct storage.
- Myna gap candidate: verify native uploader first, then add durable assets across documents, upload queue/retry/cancel/progress, folders/tags/rename/delete/usage, URL import, drag into document, replace-media in place, screen/mic capture. Separate editable SVG/PDF import from raster flattening in UX.
- Dependencies: Sciobot storage/auth/quota APIs; browser permissions for capture; server validation/proxy; document media resolver and deletion/reference policy.
- Acceptance: upload several large files with one failure, retry only failed item, cancel queued upload, reload library; inserting/replace preserves intended geometry and undo; referenced media cannot vanish silently after asset removal; imported PDF reports unsupported/editability limits.

### 4. Fonts (P1, editor + host font storage)
- Evidence: text section of `EditorPanels.tsx`; `frontend/src/lib/fontProvider.ts`; `docs/editor.md` Text section; tagged-PDF export disclosure in `ExportDialog.tsx:718`.
- Source/docs behavior: searchable visual font catalog, TTF/OTF/WOFF/WOFF2 upload, embedded custom fonts, applying to selection vs inserting text. Web font provider distinct from embedded fonts; tagged PDF discloses fallback for web fonts.
- Myna gap candidate: audit native Fika font loading/catalog first, then custom font persistence/embedding and portable export fidelity. Avoid relying on system-only fonts for saved designs.
- Acceptance: custom font survives reload and offline JSON round-trip, preview/export agree or disclose substitution, invalid font import gives actionable localized error, font family change affects intended selection only.

### 5. Apps / mini-tools (P2, editor capability interface)
- Evidence: `EditorPanels.tsx:5812` (`AppsPanel`); `backend/internal/httpapi/apps.go`; `packages/stock/src/{apphost.ts,types.ts}`.
- Source behavior: built-in QR/chart/table/shape catalog, scoped insert actions; scope guard supports insert-node, edit-own-nodes, read-selection, network. **The adjacent source comment says third-party iframe runtime + postMessage bridge is deferred.** Do not call this a functioning arbitrary app marketplace.
- Myna gap candidate: current native charts/tables/shapes already cover several built-ins; QR and a coherent command/catalog surface are separate TODOs. Establish validated host extension API before third-party runtime.
- Acceptance: QR edits regenerate a scannable code, chart/table edits remain native, denied action explains failure, one undo per app insertion; external app capabilities only displayed if a real adapter is installed.

### 6. Brand kits and design consistency (P1/P2, editor + host workspace service)
- Evidence: `BrandPanel.tsx`; `frontend/src/store/brand.ts`; `backend/internal/httpapi/{brand.go,brandfromurl.go}`; Brand imports show kit/version/lint APIs and editor batch fixes.
- Source/docs behavior: kit picker/creation, colors/fonts/logos/voice, apply defaults vs re-skin existing content, violations and auto-fix, locked regions, history, off/warn/block policy; URL brand draft has explicit confirmation.
- Myna gap candidate: Styles presets are not saved brand kits. Add persistent kits, semantic color/font roles, logo insertion, apply-to-selection/page/design scope, previewed re-skin with undo and unmapped-color behavior.
- Dependencies: host kit CRUD/access, fonts/assets, semantic styling metadata, export policy callbacks for enforced branding. Never make a brand kit change editor UI branding.
- Acceptance: create two kits, switch and reload, apply defaults without recoloring existing elements, separately re-skin one page in one undo; lint shows exact violations and fixes; block policy enforced in all export paths, not just UI.

## AI, workspace and collaboration

### 7. AI assistant and deterministic assists (P2, Sciobot integration first)
- Evidence: `EditorPanels.tsx` AI section (~5146 provider presets; ~5376 AssistantPanel; ~4861 deterministic assists); `frontend/src/lib/{aiCommandBar.ts,aiRequests.ts,aiAttachments.ts,aiImageQueue.ts,aiFillQueue.ts}`; `backend/internal/ai/{provider.go,registry.go,policy.go,image.go,search.go}`; `backend/internal/httpapi/{ai.go,aistudio.go,aistream.go}`; `WorkspaceAiPanel.tsx`, `WorkspaceAiPolicy.tsx`.
- Source/docs behavior: one conversational agent surface over validated tools; no-key critique/harmonize/layout/animation; encrypted workspace provider configuration; outline review before generation; SSE updates; attachment ingestion; generated-image queue with retry; brand constraints and tool validation.
- Myna gap candidate: expose Myna as a first-class Sciobot tool/document context using existing agentic Fika controller. Do not create a competing BYOK/account/provider stack in Fika. Candidate tools: generate design from brief/attachment, edit selection, restyle, translate design content explicitly, image generation, critique, background removal, regenerate page.
- Dependencies: host agent permissions/tool schema, cancellation/progress, undo transaction boundaries, asset ingestion, provenance, stale-document/selection guards, provider availability policy.
- Acceptance: preview/confirm broad generated changes, stream progress without losing user edits, cancel cleanly, undo complete operation; retry image failure; changing UI locale never translates authored content implicitly; API keys never enter document/browser bundles.

### 8. Workspaces, files, ownership and durable autosave (P1, Sciobot host)
- Evidence: `backend/internal/accounts/workspaces_test.go`; `backend/internal/httpapi/workspaces.go`; dashboard workspace UI; storage-quota/session/role features listed in `docs/FEATURES.md`.
- Myna gap candidate: local `/dev/myna` persistence is not production ownership/file management. Use existing Sciobot auth/workspace/file infrastructure for durable design IDs, title, thumbnail, folders, duplicate, trash/restore, permissions, conflict-safe autosave and account limits.
- Acceptance: save/reload across devices, reconnect after offline work without silent overwrite, explicit conflict/recovery, autosave status accessible, import/export/duplicate preserve IDs appropriately, viewer cannot mutate using UI or direct API.

### 9. Realtime coediting, offline and history (P2, major host/engine work)
- Evidence: `frontend/src/store/presence.ts`; `PresenceOverlay.tsx`, `PresenceBar.tsx`, `HistoryPanel.tsx`; `packages/schema/src/yjs.ts`; `backend/internal/realtime/{hub.go,serve.go,locks.go,lockstore.go,coordinator_redis.go}`; `backend/internal/persistence/{history_updates.go,versionhistory_test.go}`.
- Source/docs behavior: Yjs and presence/follow/locks, indexed offline merge, version checkpoints/restore, Redis coordinator. Docs explicitly leave per-page lazy subdocuments, true CRDT branches and on-wire per-node enforcement pending.
- Myna gap candidate: native Fika undo is local, not per-user CRDT undo. Define shared document model and authoritative permissions before adding cursors; host comments/history alone are smaller independent milestones.
- Acceptance: two users edit same/different elements, reconnect from offline, preserve stable IDs and selections; one user's undo does not erase another's edit; viewer/locked/approval restrictions enforced server-side; restore is recoverable and visible to peers.

### 10. Comments, approvals, activity and sharing (P1/P2, host integrations)
- Evidence: `CommentsPanel.tsx`, `ActivityPanel.tsx`, `InsightsPanel.tsx`, `ApprovalBanner.tsx`, `ShareDialog.tsx`; `backend/internal/{comments,approvals}/`; shared route `frontend/src/pages/shared.tsx`.
- Source/docs behavior: anchored threads, mentions/reactions/resolve/tasks; approvals with locks; share view/comment/edit/password/expiry/sign-in; access requests, activity and insights.
- Myna gap candidate: distinguish Fika's existing local comment feature from persistent multiuser discussions. Integrate Sciobot's own collaboration/sharing if available; implement read-only public player independently from editor access.
- Acceptance: share link expiry/revocation enforced, viewer cannot fetch forbidden original data; element comment follows movement or becomes intelligibly orphaned after delete; approval state cannot be bypassed via export/controller; read-only view has no edit affordances.

## Modes, export and publishing

### 11. Alternate document modes (P3, separately scoped products)
- Evidence: `DocumentSurface.tsx` dispatches whiteboard/doc/sheet/video; individual `WhiteboardSurface.tsx`, `DocSurface.tsx`, `SheetSurface.tsx`, `VideoSurface.tsx`; document types detailed in `docs/document-types.md`.
- Source distinction: these are separate document models/surfaces, not hidden buttons in the design canvas. Fika already supplies presentations; HyCanvas docs/sheets/whiteboards/video require explicit product decisions and migration/export contracts.
- Candidate acceptance per mode: whiteboard connector/ink/frames persisted; docs semantic text and DOCX export; sheets formula dependency recalculation and sheet export; video real trim/playback/audio sync/export. Do not list them complete based on inserting a video/audio element into a design page.

### 12. Export fidelity, portable files, animated and accessible output (P1/P2)
- Evidence: `ExportDialog.tsx:40` formats png/jpg/pdf/svg/apng/gif/lottie/mp4/pptx/md; `packages/export/src/{svg.ts,pptx.ts,pptximport.ts,odpimport.ts,apng.ts,gif.ts,lottie.ts,preflight.ts}`; `backend/internal/render/{pdf.go,pdftag.go,pdffont.go,pdfttf.go}`; `backend/internal/httpapi/export.go`.
- Important source distinction: default client PDF is raster via jsPDF; optional **tagged selectable-text PDF is a server route exporting last saved design**, with custom embedded font support and disclosed web-font fallback. Not all PDF paths preserve text/vector.
- Myna gap candidate: page-range selection/custom naming, SVG/vector PDF, selectable/tagged PDF, font embedding/fallback disclosure, animation/deck/video output, deterministic preflight and export cancellation/progress/retry, preserve native editable formats and host watermark rules. Evaluate reused Fika export capabilities before adding duplicate implementations.
- Dependencies: model-to-vector rendering, font shaping/embedding, accessibility metadata, asset resolver, worker/server jobs, memory limits, provider policies.
- Acceptance: inspect downloaded artifact independently (not only existence): page count/dimensions, text selection, fonts, vector shapes, transparency, images, animations/timing, tags/reading order/alt text; warn on unsupported effects rather than silently drop; export snapshot consistent during edits; honor watermark/brand policy across every format.

### 13. Printing (P2)
- Evidence: `PrintDialog.tsx:1-16`: hidden-frame OS print at 200 DPI. Source explicitly says removed print-on-demand wizard had no payment/vendor wiring.
- Myna gap candidate: print current/range/all pages with correct physical dimensions and preview. CMYK, bleed/crop marks, print vendor fulfillment require separate evidence/design; **do not infer they ship in HyCanvas from “print-ready” language**.
- Acceptance: OS print preview page count, orientation, dimensions and margins correct; no chrome/guide/grid artifacts; image-load errors explicit; large designs bounded; print purchase not shown unless actual vendor flow exists.

### 14. Website and social publishing (P3, honest scope)
- Evidence: `WebsiteDialog.tsx` opening comments, `packages/website/src/`; `PublishDialog.tsx` opening comments.
- Implemented source: responsive static website file generation/preview/download; local-only social planner with platform-sized variants/captions/calendar/QR.
- Explicitly deferred in source: social OAuth, durable delivery jobs and insights; hosted website persistence/CDN/domains/TLS/forms/password gate/live embeds. Website password model flag is not security.
- Myna TODO: decide whether local exports are useful; real publishing requires Sciobot-host services and provider adapters. Never call local planner entries “posted” or local password setting “protected”. Acceptance requires actual deployed URL/post and durable task status for service-backed versions.

## Accessibility and internationalization

### 15. Accessible authored designs (P1/P2, model + UI + export)
- Evidence: `AccessibilityDialog.tsx`; `ReadingOrderPane.tsx`; `packages/a11y/src/index.ts`; `packages/schema/src/a11y.ts`; tagged PDF renderer.
- Source behavior: audits contrast, missing alt text, small text, target size, slide titles and reading order; issue navigation; selected one-click fixes and AI alt descriptions; document language/reading order/decorative metadata.
- Myna gap candidate: native UI localization does not make canvas artwork accessible. Add persistent alt text/decorative/read-order/document language, semantic preview, contrast/a11y checklist with targeted fixes, and accessible output pipeline.
- Acceptance: keyboard select/navigate in authored reading order, skip decorative nodes; audit links focus offending item; fixes undo; exported tagged PDF contains correct structure and language; screen-reader checks accompany automated checks.

### 16. Editor keyboard, touch, assistive tech, i18n (P1 continuous)
- Evidence: `ShortcutsHelp.tsx`, `ShortcutsEditor.tsx`, `frontend/src/lib/{shortcuts.ts,locale.ts,locale.pins.test.ts,i18n.ts,i18n.catalogs.test.ts}`; `frontend/public/locales/` has en-gb/es/fr/de/pt-br/hi/ja/zh-cn; English bundled under `frontend/src/locales/en.json`.
- Source behavior: runtime catalogs with English fallback/pseudolocalization; locale/dir runtime; design surfaces explicitly pinned so RTL shell does not mirror artwork; shortcut remapping. Some inspected code still has literal English strings (Apps chart/table labels, print page-count label, export explanatory text), so no unqualified “fully localized” claim.
- Myna baseline: four supported languages, live-switch preservation and keyboard ruler/drawer controls now exist; keep regression coverage across all new work. Candidate gaps: comprehensive keyboard design selection and text editing, focus restoration/trapping, shortcut discoverability/remapping, pointer/touch parity, screen-reader status, high contrast/reduced motion, pseudolocalization/long labels. RTL is separate future locale scope, not currently required by en/cs/sk/pl.
- Acceptance: full common workflow without mouse; all icon controls accessible; Escape behavior predictable, no keyboard traps; zoom/touch usable; all four locales show no new hardcoded messages, locale switch never alters user content; non-Latin authored text renders/exports correctly.

## Shipped vs roadmap caveats for the consolidated TODO

1. `docs/FEATURES.md` is useful as an index, not final truth: it lists UI internationalization as pending despite shipped runtime catalogs; lists camera bubble pending even after a shipped bullet says implemented. Source and local exercise should settle each claim.
2. Apps external sandbox, website hosting, social posting, print fulfillment are explicitly incomplete in source even though nearby UI exists.
3. Presenter captions/TTS/media generation, true infinite canvas/facilitation, per-page CRDT scaling and full node-level wire authorization are roadmap entries, not implementation acceptance baselines.
4. Use status labels independently: source-present / interaction-verified / artifact-verified / service-config-required / mock-local-only / missing / product-decision. Do not turn source-present into a checked TODO.
5. Recommended architecture split: Fika owns document editing/model/portable export and embed callbacks; Sciobot owns identity, storage/catalog providers, collaboration, jobs, AI and publication. Resolve existing Sciobot services before recreating HyCanvas's backend.
