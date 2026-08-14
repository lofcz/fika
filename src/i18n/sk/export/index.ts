import type { NamespaceExportTranslation } from '../../i18n-types'

const sk_export: NamespaceExportTranslation = {
  exportImageFailed: 'Nepodarilo sa exportovať obrázok',
  exportFailed: 'Nepodarilo sa exportovať',
  exportPartial: 'Export prebehol, ale niektoré médiá sa nepodarilo vložiť',
  chartSeries: 'Séria {index}',
  dialog: {
    title: 'Export',
    subtitle: 'Stiahnite túto prezentáciu.',
    slideCount: '{count} snímok',
    exporting: 'Prebieha export…',
    preparing: 'Pripravujeme export…',
    writing: 'Zapisujeme súbor…',
    slideProgress: 'Snímka {current} z {total}',
  },
  pptx: {
    title: 'PowerPoint',
    description: 'Upraviteľný PPTX so zachovanými písmami, médiami a pôvodným rozložením.',
    exportButton: 'Stiahnuť PPTX',
  },
  json: {
    title: 'JSON',
    description: 'Kompletný model prezentácie na zálohu alebo opätovný import.',
    exportButton: 'Stiahnuť JSON',
  },
}

export default sk_export
