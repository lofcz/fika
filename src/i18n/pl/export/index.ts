import type { NamespaceExportTranslation } from '../../i18n-types'

const pl_export: NamespaceExportTranslation = {
  exportImageFailed: 'Nie udało się wyeksportować obrazu',
  exportFailed: 'Eksport nie powiódł się',
  exportPartial: 'Eksport zakończony, ale nie udało się osadzić części multimediów',
  chartSeries: 'Seria {index}',
  dialog: {
    title: 'Eksport',
    subtitle: 'Pobierz tę prezentację.',
    slideCount: '{count} slajdów',
    exporting: 'Trwa eksport…',
    preparing: 'Przygotowywanie eksportu…',
    writing: 'Zapisywanie pliku…',
    slideProgress: 'Slajd {current} z {total}',
  },
  pptx: {
    title: 'PowerPoint',
    description: 'Edytowalny PPTX z zachowanymi czcionkami, mediami i oryginalnym układem.',
    exportButton: 'Pobierz PPTX',
  },
  json: {
    title: 'JSON',
    description: 'Pełny model prezentacji do kopii zapasowej lub ponownego importu.',
    exportButton: 'Pobierz JSON',
  },
}

export default pl_export
