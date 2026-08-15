import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '@rstest/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const unitScripts = [
  'scripts/check-agentic-bridge.mjs',
  'scripts/check-canvas-hit-test.mjs',
  'scripts/check-chart-series-contrast.mjs',
  'scripts/check-canvas-pointer.mjs',
  'scripts/check-canvas-zoom.mjs',
  'scripts/check-code-highlight.mjs',
  'scripts/check-composition.mjs',
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

const e2eScripts = [
  'scripts/e2e-height-toggle.mjs',
  'scripts/e2e-houby-fixed-fit.mjs',
  'scripts/e2e-chart-fidelity.mjs',
  'scripts/e2e-charts.mjs',
  'scripts/e2e-insert-elements.mjs',
  'scripts/e2e-live-paint.mjs',
  'scripts/e2e-present-edit-sync.mjs',
  'scripts/e2e-preview-sync.mjs',
  'scripts/e2e-resize-elements.mjs',
  'scripts/e2e-slide-reorder.mjs',
]

function runScript(rel: string) {
  const file = join(root, rel)
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, CI: process.env.CI || '1' },
      windowsHide: true,
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${rel} exited ${code}`))
    })
  })
}

describe.sequential('unit', () => {
  for (const script of unitScripts) {
    it(script, async () => {
      await runScript(script)
      expect(true).toBe(true)
    }, script.includes('check-css-modules') ? 180_000 : 30_000)
  }
})

describe.sequential('e2e', () => {
  for (const script of e2eScripts) {
    it(script, async () => {
      await runScript(script)
      expect(true).toBe(true)
    }, 240_000)
  }
})
