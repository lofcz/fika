import type { DialogForExportTypes } from '@/types/export'

/** Non-empty export dialog format ids. */
export type ExportTabId = Exclude<DialogForExportTypes, ''>

export type FikaExportTabsConfig = Partial<Record<ExportTabId, boolean>>

const ALL_EXPORT_TAB_IDS: ExportTabId[] = ['pptx', 'json']

const DEFAULT_EXPORT_TABS: Record<ExportTabId, boolean> = {
  pptx: true,
  json: true,
}

let exportTabs: Record<ExportTabId, boolean> = { ...DEFAULT_EXPORT_TABS }

/** Configure which export formats are available in an embedded host. Omitted keys stay enabled. */
export function setFikaExportTabs(config?: FikaExportTabsConfig) {
  exportTabs = { ...DEFAULT_EXPORT_TABS }
  if (!config) return
  for (const id of ALL_EXPORT_TAB_IDS) {
    if (id in config) exportTabs[id] = Boolean(config[id])
  }
}

export function getFikaExportTabs(): Readonly<Record<ExportTabId, boolean>> {
  return exportTabs
}

export function isExportTabEnabled(tab: ExportTabId): boolean {
  return exportTabs[tab] ?? true
}

export function getEnabledExportTabs(): ExportTabId[] {
  return ALL_EXPORT_TAB_IDS.filter(tab => isExportTabEnabled(tab))
}

/** Resolve a requested export format to an enabled one, or close the dialog when none are enabled. */
export function resolveExportDialogType(type: DialogForExportTypes): DialogForExportTypes {
  if (!type) return ''
  if (isExportTabEnabled(type)) return type
  return getEnabledExportTabs()[0] ?? ''
}
