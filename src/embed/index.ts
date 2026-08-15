export { mountFika, unmountFika } from './mount'
export type {
  FikaController,
  FikaDocument,
  FikaHeaderMenuItem,
  FikaMountOptions,
  FikaMountResult,
  FikaDocumentLoader,
  FikaStarterPresentationOptions,
  FikaTemplateLoader,
  FikaTemplatePayload,
  FikaImportPptxOptions,
  FikaImportApplyMode,
  FikaViewMode,
} from './types'
export type { ExportTabId, FikaExportTabsConfig } from '@/configs/exportTabs'
export type { FikaExportMediaResolver } from '@/configs/exportMediaResolver'
export {
  createFikaMediaUploader,
} from '@/configs/mediaUpload'
export type {
  FikaMediaConfig,
  FikaMediaConstraints,
  FikaMediaKind,
  FikaMediaSizeLimit,
  FikaMediaUploadProgress,
  FikaMediaUploadRequest,
  FikaMediaUploadResult,
  FikaMediaUploader,
  FikaXhrMediaUploaderOptions,
} from '@/configs/mediaUpload'
export type * from './agentic/types'
export type { Locales as FikaLocales } from '@/i18n/locale'
export type {
  ChartData,
  ChartOptions,
  ChartType,
  Note,
  NoteReply,
  PPTAnimation,
  PPTAudioElement,
  PPTChartElement,
  PPTElement,
  PPTElementLink,
  PPTImageElement,
  PPTLatexElement,
  PPTLineElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
  PPTVideoElement,
  ShapeText,
  Slide,
  SlideBackground,
  SlideTemplate,
  SlideTheme,
  TableCell,
  TableCellStyle,
  TextAlign,
  TurningMode,
} from '@/types/slides'
