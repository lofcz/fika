import type { PptxExportCommand } from './pptxExportCommands'

type Options = Record<string, unknown>

const isRecord = (value: unknown): value is Options => !!value && typeof value === 'object' && !Array.isArray(value)

function tag(options: unknown, lang: string) {
  if (isRecord(options) && typeof options.lang !== 'string') options.lang = lang
}

/** Text runs given as `[{ text, options }]`. */
function tagRuns(runs: unknown, lang: string) {
  if (!Array.isArray(runs)) return
  for (const run of runs) if (isRecord(run)) tag(run.options ?? (run.options = {}), lang)
}

/**
 * Give every recorded text run, table cell and chart the deck's proofing
 * language. Runs with their own language (a quotation, a foreign word) keep it.
 */
export function applyPptxLanguage(commands: PptxExportCommand[], lang: string | null | undefined): void {
  if (!lang) return
  for (const command of commands) {
    const args = command.args
    if (!args) continue
    if (command.property === 'addText') {
      tagRuns(args[0], lang)
      tag(args[1], lang)
    } else if (command.property === 'addTable' && Array.isArray(args[0])) {
      for (const row of args[0]) {
        if (!Array.isArray(row)) continue
        for (const cell of row) {
          if (!isRecord(cell)) continue
          tag(cell.options ?? (cell.options = {}), lang)
          tagRuns(cell.text, lang)
        }
      }
      tag(args[1], lang)
    } else if (command.property === 'addChart') {
      tag(args[2], lang)
    } else if (command.property === 'addShape') {
      // Empty shapes still carry an end-of-paragraph run that typed text inherits.
      tag(args[1], lang)
    }
  }
}
