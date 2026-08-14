import type { BaseTranslation } from '../../i18n-types'

const en_export: BaseTranslation = {
  exportImageFailed: 'Failed to export image',
  exportFailed: 'Export failed',
  exportPartial: 'Export finished, but some media could not be embedded',
  chartSeries: 'Series {index:number}',
  dialog: {
    title: 'Export',
    subtitle: 'Download this presentation.',
    slideCount: '{count:number} slides',
    exporting: 'Exporting...',
    preparing: 'Preparing…',
    writing: 'Writing file…',
    slideProgress: 'Slide {current:number} of {total:number}',
  },
  pptx: {
    title: 'PowerPoint',
    description: 'Editable PPTX with fonts, media, and native layout preserved.',
    exportButton: 'Download PPTX',
  },
  json: {
    title: 'JSON',
    description: 'Complete deck model for backup or re-import.',
    exportButton: 'Download JSON',
  },
}

export default en_export
