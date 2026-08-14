import type { NamespaceExportTranslation } from '../../i18n-types'

const cs_export: NamespaceExportTranslation = {
  exportImageFailed: 'Nepodařilo se exportovat obrázek',
  exportFailed: 'Nepodařilo se exportovat',
  exportPartial: 'Export proběhl, ale některá média se nepodařilo vložit',
  chartSeries: 'Řada {index}',
  dialog: {
    title: 'Export',
    subtitle: 'Stáhněte tuto prezentaci.',
    slideCount: '{count} snímků',
    exporting: 'Probíhá export…',
    preparing: 'Připravujeme export…',
    writing: 'Zapisujeme soubor…',
    slideProgress: 'Snímek {current} z {total}',
  },
  pptx: {
    title: 'PowerPoint',
    description: 'Upravitelný PPTX se zachovanými písmy, médii a původním rozložením.',
    exportButton: 'Stáhnout PPTX',
  },
  json: {
    title: 'JSON',
    description: 'Kompletní model prezentace pro zálohu nebo opětovný import.',
    exportButton: 'Stáhnout JSON',
  },
}

export default cs_export
