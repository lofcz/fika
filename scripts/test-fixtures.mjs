/** Shared fixture catalog for `npm test` and `tests/all.test.ts`. */

export const unitScripts = [
  'scripts/check-agentic-bridge.mjs',
  'scripts/check-canvas-hit-test.mjs',
  'scripts/check-chart-series-contrast.mjs',
  'scripts/check-canvas-pointer.mjs',
  'scripts/check-canvas-zoom.mjs',
  'scripts/check-code-highlight.mjs',
  'scripts/check-composition.mjs',
  'scripts/check-commit-queue.mjs',
  'scripts/check-css-modules.mjs',
  'scripts/check-editor-caret.mjs',
  'scripts/check-element-order.mjs',
  'scripts/check-fn-utils.mjs',
  'scripts/check-import-apply.mjs',
  'scripts/check-job-progress.mjs',
  'scripts/check-latex-extract.mjs',
  'scripts/check-live-element-offset.mjs',
  'scripts/check-live-element-paint.mjs',
  'scripts/check-live-element-size.mjs',
  'scripts/check-perf-rail.mjs',
  'scripts/check-perf-snap.mjs',
  'scripts/check-placeholder-preview.mjs',
  'scripts/check-pptx-import-fidelity.mjs',
  'scripts/check-pptx-import-fonts.mjs',
  'scripts/check-pptx-import-picture.mjs',
  'scripts/check-pptx-unit.mjs',
  'scripts/check-preview-raster.mjs',
  'scripts/check-sb1-import.mjs',
  'scripts/check-slide-code-utils.mjs',
  'scripts/check-slide-reorder.mjs',
  'scripts/check-snap.mjs',
  'scripts/check-spatial.mjs',
  'scripts/check-table-cell-edit.mjs',
  'scripts/check-text-fit-scale.mjs',
  'scripts/check-text-selection.mjs',
  'scripts/check-text-style-panel.mjs',
  'scripts/check-theme-file.mjs',
  'scripts/check-theme-panel-rerender.mjs',
]

export const e2eScripts = [
  'scripts/e2e-guidelines.mjs',
  'scripts/e2e-autoheight-styles.mjs',
  'scripts/e2e-autoheight-stuck.mjs',
  'scripts/e2e-placeholder-slot.mjs',
  'scripts/e2e-hit-retarget-guard.mjs',
  'scripts/e2e-hit-contained-click.mjs',
  'scripts/e2e-hit-placeholder-yield.mjs',
  'scripts/e2e-height-toggle.mjs',
  'scripts/e2e-houby-fixed-fit.mjs',
  'scripts/e2e-jan-hus-wrap.mjs',
  'scripts/e2e-chart-fidelity.mjs',
  'scripts/e2e-charts.mjs',
  'scripts/e2e-insert-elements.mjs',
  'scripts/e2e-live-paint.mjs',
  'scripts/e2e-present-commit-drain.mjs',
  'scripts/e2e-present-edit-sync.mjs',
  'scripts/e2e-preview-sync.mjs',
  'scripts/e2e-preview-raster.mjs',
  'scripts/e2e-resize-commit-match.mjs',
  'scripts/e2e-resize-elements.mjs',
  'scripts/e2e-resize-shapes.mjs',
  'scripts/e2e-shape-fixed-fit.mjs',
  'scripts/e2e-fixed-fit-never-clips.mjs',
  'scripts/e2e-height-mode-swap.mjs',
  'scripts/e2e-gutter-drag.mjs',
  'scripts/e2e-layer-cycle.mjs',
  'scripts/e2e-shift-select.mjs',
  'scripts/e2e-slide-reorder.mjs',
  'scripts/e2e-slide-mutate.mjs',
  'scripts/e2e-thumb-snapshot.mjs',
  'scripts/e2e-agentic-commands.mjs',
]

export const rstestFiles = [
  'tests/live-paint.test.ts',
]

const basename = (file) => file.replace(/^.*[\\/]/, '').replace(/\.test$/, '').replace(/\.(mjs|mts|ts)$/, '').replace(/\.test$/, '')

const extraAliases = (short) => {
  const aliases = []
  if (short.startsWith('live-element-')) aliases.push(short.replace('live-element-', 'live-'))
  return aliases
}

export const fixtureIdents = (file) => {
  const base = basename(file)
  const e2e = base.startsWith('e2e-')
  const short = base.replace(/^(check|e2e)-/, '')
  const idents = new Set([base, short, ...extraAliases(short)])
  if (e2e) {
    idents.add(`${short}:e2e`)
    idents.add(`e2e:${short}`)
  }
  return [...idents]
}

export const allScriptFixtures = () => [
  ...unitScripts.map(file => ({ file, kind: 'unit', idents: fixtureIdents(file) })),
  ...e2eScripts.map(file => ({ file, kind: 'e2e', idents: fixtureIdents(file) })),
]

export const allRstestFixtures = () => rstestFiles.map(file => ({
  file,
  kind: 'rstest',
  idents: fixtureIdents(file),
}))

const normalize = (query) => query.trim().toLowerCase().replace(/^test:/, '').replace(/_/g, '-')

export const matchFixtures = (queries) => {
  const scripts = []
  const rstest = []
  const seen = new Set()
  const catalog = [...allScriptFixtures(), ...allRstestFixtures()]
  const unknown = []

  for (const raw of queries) {
    const query = normalize(raw)
    if (!query) continue
    const e2eOnly = query.endsWith(':e2e') || query.startsWith('e2e-') || query.startsWith('e2e:')
    const eligible = catalog.filter(item => {
      if (e2eOnly && item.kind !== 'e2e') return false
      return true
    })
    const exact = eligible.filter(item => item.idents.includes(query))
    const hits = exact.length
      ? exact
      : eligible.filter(item => query.length >= 4 && item.idents.some(ident => ident.startsWith(query) || ident.includes(query)))
    if (!hits.length) {
      unknown.push(raw)
      continue
    }
    for (const hit of hits) {
      if (seen.has(hit.file)) continue
      seen.add(hit.file)
      if (hit.kind === 'rstest') rstest.push(hit.file)
      else scripts.push(hit.file)
    }
  }

  return { scripts, rstest, unknown }
}

export const listFixtureNames = () => {
  const rows = []
  for (const item of [...allScriptFixtures(), ...allRstestFixtures()]) {
    const preferred = item.kind === 'e2e'
      ? `${item.idents.find(id => id.endsWith(':e2e')) || item.idents[1]}`
      : (item.idents.find(id => id.startsWith('live-') && !id.includes('element')) || item.idents[1] || item.idents[0])
    rows.push({ name: preferred, file: item.file, kind: item.kind, idents: item.idents })
  }
  return rows
}
