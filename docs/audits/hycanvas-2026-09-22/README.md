# HyCanvas interaction audit for Myna

Audit date: 2026-09-22. Reference checkout: HyCanvas `7cae50f8`. This audit ran the actual Next.js frontend, Go API and an isolated PostgreSQL database, then exercised the editor with Chromium/Playwright at 1600 × 1000. It complements the source comparison; it does not certify every HyCanvas feature or claim Myna parity.

The implementation plan is [MYNA_PARITY_TODO.md](../../MYNA_PARITY_TODO.md): 100 prioritized tasks with ownership and acceptance criteria. Preserve Myna's unbranded, neutral ink/Nordic interface. Match useful workflows and fidelity, not HyCanvas's purple accent or branding.

## What was actually exercised

| Workflow | Observed result | Evidence | Remaining validation |
| --- | --- | --- | --- |
| Local account and dashboard | Created an isolated audit account; template catalog and document format shortcuts loaded | [01](screenshots/01-dashboard.png) | Other document modes were not opened |
| Square design | Created a 1080 × 1080 Instagram design; ruler strips, tool rail, properties and page footer visible | [02](screenshots/02-editor-elements.png) | Responsive and touch behavior |
| Photo grids | Inserted the two-photo grid; two placeholder cells rendered and grid geometry controls appeared | [03](screenshots/03-photo-grid.png) | Drop-to-fill, cell swapping and image crop fidelity |
| Stock search | Searched `apple`; results included the same Green Apple graphic as the user's reference; clicked to insert it | [04](screenshots/04-stock-apple.png), [05](screenshots/05-stock-inserted.png) | Provider failure, pagination, favorites persistence and license enforcement |
| Text | Opened font/pairing catalog; inserted headings; selected-text inspector exposed typography controls | [06](screenshots/06-text-library.png), [27](screenshots/27-text-selected.png) | Font upload, curved-text output and individual effects |
| Layers | Opened layer list after grid/icon/text insertion | [08](screenshots/08-layers.png) | Drag reorder and reading-order editing |
| Rulers and grid | Toggled rulers off/on, enabled grid, dragged a horizontal guide from the top ruler; visible cyan guide crossed the canvas | [09](screenshots/09-rulers-toggle.png), [10](screenshots/10-grid.png), [29](screenshots/29-guide-drag.png) | Numerical snapping tolerance, guide deletion/lock and zoom/pan accuracy |
| Document actions | Opened More actions, including history, approval, template save, publishing, printing and shortcuts | [11](screenshots/11-more-actions.png) | Menu presence alone does not verify these operations |
| Accessibility check | Opened audit; document-language selector and “No accessibility issues found” result appeared for this fixture | [12](screenshots/12-accessibility.png) | Checker correctness, targeted fixes, screen readers and tagged output |
| AI | Opened panel; provider setup required for generation, with a separate no-AI assist section | [13](screenshots/13-ai.png) | No key configured; no paid/provider AI operation performed |
| Uploads | Opened library; image/URL/SVG/PDF import, capture, folders and quota UI visible | [14](screenshots/14-uploads.png) | Upload/capture/import completion not exercised |
| Apps and QR | Opened built-in apps; selected QR app, opened Add QR code dialog, then confirmed Add; QR node appeared | [15](screenshots/15-apps.png), [21](screenshots/21-qr-inserted.png), [22](screenshots/22-qr-node.png) | QR scanner validation and editable payload round trip |
| Brand kit | Created an empty default kit; apply/re-skin, checks, colors/fonts/history/admin sections appeared | [17](screenshots/17-brand.png), [18](screenshots/18-brand-create.png) | Color/font editing, policy enforcement and re-skin behavior |
| Sharing | Opened dialog showing invite roles, link roles and link options | [20](screenshots/20-share.png) | No invitations sent or links created; permission/security behavior untested |
| Pages | Duplicated populated page through footer; second thumbnail and page count appeared | [23](screenshots/23-duplicate-page.png) | Page reordering, sections and alternate overview modes |
| Export | Opened format picker and page selection; attribution credit appeared for stock graphic; downloaded current-page PNG | [24](screenshots/24-export.png), [PNG artifact](export-current.png) | Other formats not exported; PNG not a universal fidelity pass |
| Version history | Opened real saved/auto-saved entries after editing | [25](screenshots/25-history.png) | Restore, concurrent users and offline merging not tested |
| Persistence | Reloaded two-page document; grid, icon, text and QR remained in the document UI | [26](screenshots/26-reloaded.png), [runtime snapshot](runtime-summary.json) | Independent second-device and conflict behavior |
| Template library | Opened in-editor catalog; exact 1080 × 1080 matches appeared before other sizes | [28](screenshots/28-template-library.png) | Template save/insert and permissions |
| Magic Resize | Opened target-format selector with single-format and multi-format behavior explanations | [30](screenshots/30-magic-resize.png) | No conversion applied or output fidelity verified |

PNG download completed without a Playwright download error. Its binary header confirms 1080 × 1080, 8-bit RGBA. Visual inspection confirmed grid placeholders, heading and QR artwork, without editor rulers/handles. This is a deliberately overlapping interaction fixture, not a designed composition. The apple is obscured by later content; this artifact alone cannot certify its export fidelity. Transparency, font embedding and all other formats need dedicated fixtures.

No browser `pageerror` events were recorded through the captured runtime summary. Some automation attempts used ambiguous controls or encountered an open modal; these were corrected using the actual UI. Those locator timeouts are not classified as product failures. Early QR screenshots show the app/detail dialog, not a successfully inserted code; the authoritative insertion screenshot is 22.

## Current Myna comparison

Opened the running playground at http://127.0.0.1:5178/?mode=myna in the same Chromium viewport. [Current Myna screenshot](screenshots/31-myna-current.png) confirms neutral unbranded chrome, the populated Design drawer, and visible top/left rulers. This is a browser check of the current workspace build, not a claim that every Fika feature was re-tested during this audit.

## Main differences to address

1. **Coherent access to editing tools.** HyCanvas places relevant controls in a consistent contextual inspector and keeps quick drawing tools beside the canvas. Fika already owns much of the underlying typography, crop/filter, chart, table and alignment functionality. Surface and verify these capabilities before rebuilding them.
2. **Reusable visual content.** Size-aware templates, stock discovery, font pairings, photo frames and multi-cell grids make the editor useful immediately. Myna's current-document Assets panel is not a substitute for a stock catalog or durable media library.
3. **A complete page workspace.** Rulers are present in current Myna source, so the next work is fidelity and discoverability, not another ruler implementation. Validate guide drag/snapping, zoom-to-selection, contextual page actions, sections, layouts and reusable page content.
4. **Persistent product workflows.** Brand kits, asset organization, cloud saves, template ownership, comments, sharing and history need real Sciobot contracts. Local storage, editor undo and empty UI shells do not provide these workflows.
5. **Output and authored accessibility.** Attribution, page selection, vector/selectable/tagged output, alt text and reading order need end-to-end verification, not only download buttons.

Recommended first implementation slice: Phase 0 visual/bounds regression fixtures, Phase 1 contextual inspector and native table chooser, Phase 3 photo frames/grids and navigation, then Phase 2/4 template and stock contracts. Keep en/cs/sk/pl localization and undo/save/export acceptance in each slice.

## Source evidence and limits

- [Fika/Myna editing inventory](myna-capability-inventory.md): existing core versus surface gaps, missing node models and rendering work.
- [HyCanvas service inventory](hycanvas-service-inventory.md): source paths, dependencies and acceptance candidates across 16 product areas.
- [Timestamped screenshot observations](observations.jsonl).

Source inspection explicitly found deferred third-party app hosting, local-only social planning, static website-file generation rather than hosted publishing, and removed print fulfillment. Do not copy these labels as claims of working external services. Default HyCanvas PDF is raster; selectable/tagged PDF is a distinct saved-design server path. Alternate doc/sheet/whiteboard/video modes remain separately scoped work. Multiuser collaboration, external AI, recording, print, animation exports, accessibility correctness and full provider behavior were not runtime-certified in this audit.

## Local environment

Frontend: http://127.0.0.1:13000

Audit design: http://127.0.0.1:13000/editor/9e0c7e56-5ad7-49a5-bb32-dbcf1f794967/

API: http://127.0.0.1:18005 (`/healthz` and `/readyz` returned 200).

Local-only account: `myna-audit@example.test`, password `LocalAudit2026!`. This account contains only audit fixtures in the isolated database. Browser authentication is required to open the saved design.

The processes were left running for manual inspection. The database container is `hycanvas-myna-audit-db`, PostgreSQL17 bound to localhost55439. Existing Sciobot/Supabase databases were not used. Local storage is `/tmp/hycanvas-audit-storage`; temporary config is `/tmp/hycanvas-audit.env`. Do not commit that environment file: it contains the generated local signing secret. Logs: `/tmp/hycanvas-audit-{frontend,backend,packages,install}.log`.

Restart after stopping the current processes, from the HyCanvas checkout:

```bash
docker start hycanvas-myna-audit-db
npm ci --no-audit --no-fund
npm run build:packages
```

In one terminal:

```bash
cd backend
set -a
source /tmp/hycanvas-audit.env
set +a
/tmp/hycanvas-audit-api
```

In another terminal, from the HyCanvas root:

```bash
./node_modules/.bin/dotenv -e /tmp/hycanvas-audit.env -- npm run dev -w frontend -- -p 13000 -H 127.0.0.1
```

The config/binary under `/tmp` are session artifacts, not a durable installer. If absent after reboot, regenerate from the repository's setup instructions using a separate database and build the Go backend. Stop these foreground processes with Ctrl+C and stop only the audit database with `docker stop hycanvas-myna-audit-db`. No product implementation changes were made to HyCanvas for this audit; Next's generated AGENTS.md rewrite was restored.

## Screenshot index

- [01-dashboard](screenshots/01-dashboard.png): Created isolated local account; dashboard template catalog and document modes loaded.
- [02-editor-elements](screenshots/02-editor-elements.png): Blank square design; rulers shown by default; categorized graphics and frame/grid presets.
- [03-photo-grid](screenshots/03-photo-grid.png): Inserted two-photo grid via Elements.
- [04-stock-apple](screenshots/04-stock-apple.png): Stock search apple with live local backend.
- [05-stock-inserted](screenshots/05-stock-inserted.png): Green Apple inserted from stock search.
- [06-text-library](screenshots/06-text-library.png): Text presets and font catalog opened.
- [07-text-inspector](screenshots/07-text-inspector.png): Heading inserted, then Escape cleared selection; page inspector visible. See 27 for selected text.
- [08-layers](screenshots/08-layers.png): Layers after grid, stock icon, and text insertions.
- [09-rulers-toggle](screenshots/09-rulers-toggle.png): Toggled rulers off using dedicated header control.
- [10-grid](screenshots/10-grid.png): Enabled grid with rulers visible.
- [11-more-actions](screenshots/11-more-actions.png): Document actions menu.
- [12-accessibility](screenshots/12-accessibility.png): Opened accessibility audit on populated design.
- [13-ai](screenshots/13-ai.png): AI panel without configured provider.
- [14-uploads](screenshots/14-uploads.png): Uploads library empty state and organization controls.
- [15-apps](screenshots/15-apps.png): Built-in apps catalog.
- [16-qr-insert](screenshots/16-qr-insert.png): Opened QR app detail; no node inserted at this stage.
- [17-brand](screenshots/17-brand.png): Brand kit panel empty state.
- [18-brand-create](screenshots/18-brand-create.png): Create brand kit interaction.
- [19-qr-confirmed](screenshots/19-qr-confirmed.png): Reopened QR app detail; no insertion confirmation at this stage.
- [20-share](screenshots/20-share.png): Share dialog inspected; no invitations sent.
- [21-qr-inserted](screenshots/21-qr-inserted.png): Opened Add QR code dialog; insertion confirmed in screenshot 22.
- [22-qr-node](screenshots/22-qr-node.png): Confirmed QR insertion dialog.
- [23-duplicate-page](screenshots/23-duplicate-page.png): Duplicated populated page through footer.
- [24-export](screenshots/24-export.png): Opened download format controls.
- [25-history](screenshots/25-history.png): Version history opened; restore not exercised.
- [26-reloaded](screenshots/26-reloaded.png): Reloaded saved two-page design; grid icon text and QR retained.
- [27-text-selected](screenshots/27-text-selected.png): Inserted heading with active contextual text inspector.
- [28-template-library](screenshots/28-template-library.png): Template catalog opened within editor.
- [29-guide-drag](screenshots/29-guide-drag.png): Dragged from top ruler into canvas; visual evidence, numerical snapping not measured.
- [30-magic-resize](screenshots/30-magic-resize.png): Opened Magic Resize dialog; conversion not applied.
- [31-myna-current](screenshots/31-myna-current.png): Running Myna playground at the same viewport.
