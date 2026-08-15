import type { Locales } from '@/i18n/locale';
import type { ShapeCategoryKey, ShapePoolItem } from '@/configs/shapes';
import type { Broken2LineDirection, ChartData, ChartOptions, ChartType, Gradient, LinePoint, LineStyleType, Note, NoteReply, PPTAnimation, PPTAudioElement, PPTChartElement, PPTElement, PPTElementLink, PPTElementOutline, PPTElementShadow, PPTImageElement, PPTLatexElement, PPTLineElement, PPTShapeElement, PPTTableElement, PPTTextElement, PPTVideoElement, ShapeText, Slide, SlideBackground, SlideTemplate, SlideTheme, TableCell, TableCellStyle, TextAlign, TurningMode } from '@/types/slides';
import type { FikaDocument } from '../types';
import type { FikaTemplateSlidesCatalogResult, FikaTemplateSummary } from './templates';
import type { FikaLayout, FikaLayoutBackgroundMode } from './layouts';
import type { FikaStyleMotif, FikaStyleSummary } from './styles';
import type { CompositionAnchor, CompositionPlan, CompositionSlideHint } from './composition';
import type { FikaAgenticDocs, FikaCommandDescription, FikaDesignGuide, FikaDomainSummary } from './manifestDocs';
export type { FikaAgenticDocs, FikaCommandDescription, FikaCommandDoc, FikaDesignGuide, FikaDesignSystem, FikaDocParam, FikaDomainDoc, FikaDomainSummary } from './manifestDocs';
export type { FikaTemplateSummary, FikaTemplateSlideEntry, FikaTemplateSlidesCatalog, FikaTemplateSlidesCatalogResult } from './templates';
export type { FikaLayout, FikaLayoutSlotDef, FikaLayoutBackgroundMode, FikaLayoutVariant } from './layouts';
export type { FikaStyleSummary, FikaStylePreset, FikaStylePalette, FikaStyleScale, FikaStyleFonts, FikaStyleMotif } from './styles';
export type { CompositionAnchor, CompositionDensity, CompositionPlan, CompositionPlanEntry, CompositionSlideHint } from './composition';
export type FikaKnownCommandType = keyof FikaCommandPayloadMap;
export type FikaCommandType = FikaKnownCommandType | (string & {});
export interface FikaDeckViewport {
  size: number;
  ratio: number;
}
export type FikaSlideThemePatch = Omit<Partial<SlideTheme>, 'outline' | 'shadow'> & {
  outline?: Partial<SlideTheme['outline']>;
  shadow?: Partial<SlideTheme['shadow']>;
};
export type FikaDeckDocument = Omit<FikaDocument, 'theme'> & {
  theme: SlideTheme;
  viewport: FikaDeckViewport;
  templates: SlideTemplate[];
};
export type FikaDeckInput = Omit<FikaDocument, 'theme'> & {
  theme?: FikaSlideThemePatch;
  viewport?: Partial<FikaDeckViewport>;
  templates?: SlideTemplate[];
};
export interface FikaDeckPatch {
  title?: string;
  slides?: Slide[];
  theme?: FikaSlideThemePatch;
  viewport?: Partial<FikaDeckViewport>;
  templates?: SlideTemplate[];
}
export interface FikaImportDocumentOptions {
  /** `replace` (default) overwrites the current deck. `append` inserts after the current slide. */
  mode?: import('@/utils/importApply').ImportApplyMode;
  /** Legacy alias for `mode`: `true` replace, `false` append. */
  cover?: boolean;
  /**
   * Ask before replacing when the deck has more than one slide.
   * Ignored on the agentic JSON path (never shows a dialog).
   */
  confirm?: boolean;
}
export type FikaDocumentImportPayload = FikaDeckInput | ({
  document: FikaDeckInput;
} & FikaImportDocumentOptions);
export interface FikaThemeExtractionOptions {
  slideIds?: string[];
  maxThemeColors?: number;
}
export interface FikaApplyThemeOptions {
  applyToSlides?: boolean;
  includeElementStyles?: boolean;
}
export interface FikaCommandMeta {
  commit?: boolean;
  dryRun?: boolean;
  source?: 'agent' | 'host' | 'ui';
  label?: string;
}
export interface FikaAgentCommand<TPayload = unknown, TType extends FikaCommandType = FikaCommandType> {
  id?: string;
  type: TType;
  payload?: TPayload;
  meta?: FikaCommandMeta;
}
export type FikaKnownAgentCommand<TType extends FikaKnownCommandType = FikaKnownCommandType> = { [Type in TType]: FikaAgentCommand<FikaCommandPayloadMap[Type], Type> }[TType];
export type FikaKnownCommandResult<TType extends FikaKnownCommandType = FikaKnownCommandType> = { [Type in TType]: FikaCommandResult<FikaCommandResultDataMap[Type]> }[TType];
export interface FikaCommandIssue {
  code: string;
  message: string;
  path?: string;
  recoverable?: boolean;
}
export interface FikaCommandResult<TData = unknown> {
  ok: boolean;
  commandId?: string;
  type: FikaCommandType;
  changed: boolean;
  documentVersion: number;
  snapshotId?: number;
  data?: TData;
  errors?: FikaCommandIssue[];
  warnings?: FikaCommandIssue[];
}
export interface FikaBatchOptions {
  atomic?: boolean;
  commit?: boolean;
  dryRun?: boolean;
}
export type FikaJsonPrimitive = string | number | boolean | null;
export type FikaJsonValue = FikaJsonPrimitive | FikaJsonValue[] | {
  [key: string]: FikaJsonValue;
};
export type FikaMediaAssetKind = 'image' | 'video' | 'audio';
export type FikaMediaAssetInput = string | FikaMediaAsset;
export interface FikaMediaAsset {
  id?: string;
  kind?: FikaMediaAssetKind;
  src: string;
  /**
   * Optional source / citation URL. When set on image assets, the bridge attaches
   * `link: { type: 'web', target: sourceUrl }` so the image opens its origin page.
   */
  sourceUrl?: string;
  ext?: string;
  mimeType?: string;
  filename?: string;
  title?: string;
  width?: number;
  height?: number;
  size?: number;
  poster?: string;
  metadata?: {
    [key: string]: FikaJsonValue;
  };
}
export interface FikaMediaAssetResolverRequest {
  kind: FikaMediaAssetKind;
  asset: FikaMediaAssetInput;
  slideId?: string;
  elementId?: string;
}
export interface FikaMediaAssetResolverResult {
  asset: FikaMediaAsset;
  warnings?: FikaCommandIssue[];
}
export type FikaBridgeEventType = 'documentChanged' | 'selectionChanged' | 'commandApplied' | 'commandFailed' | 'destroyed';
export interface FikaBridgeEvent<TData = unknown> {
  type: FikaBridgeEventType;
  documentVersion: number;
  command?: FikaAgentCommand;
  result?: FikaCommandResult;
  data?: TData;
}
export interface FikaDocumentChangedEvent extends FikaBridgeEvent<FikaDocument> {
  type: 'documentChanged';
}
export interface FikaSelectionChangedEvent extends FikaBridgeEvent<FikaBridgeState> {
  type: 'selectionChanged';
}
export interface FikaCommandAppliedEvent<TData = unknown> extends FikaBridgeEvent<TData> {
  type: 'commandApplied';
  command: FikaAgentCommand;
  result: FikaCommandResult<TData>;
}
export interface FikaCommandFailedEvent extends FikaBridgeEvent {
  type: 'commandFailed';
  command: FikaAgentCommand;
  result: FikaCommandResult;
}
export interface FikaDestroyedEvent extends FikaBridgeEvent {
  type: 'destroyed';
}
export type FikaTypedBridgeEvent = FikaDocumentChangedEvent | FikaSelectionChangedEvent | FikaCommandAppliedEvent | FikaCommandFailedEvent | FikaDestroyedEvent;
export type FikaBridgeListener = (event: FikaBridgeEvent) => void;
export type FikaUnsubscribe = () => void;
export interface FikaBridgeState {
  title: string;
  /** 1-based current slide number (first slide = 1). 0 when the deck is empty. */
  slideIndex: number;
  slideCount: number;
  currentSlideId?: string;
  /** 1-based selected slide numbers. */
  selectedSlideIndexes: number[];
  selectedElementIds: string[];
  handleElementId: string;
  activeGroupElementId: string;
  hiddenElementIds: string[];
  viewportSize: number;
  viewportRatio: number;
  canvasScale: number;
  canvasPercentage: number;
  screening: boolean;
  canUndo: boolean;
  canRedo: boolean;
  documentVersion: number;
  locale?: Locales;
}
export interface FikaAgentCapability {
  ok: boolean;
  reason?: string;
  warnings?: FikaCommandIssue[];
}
export interface FikaCreateSlideInput {
  slide?: Partial<Slide>;
  /** 1-based insert position; omit or pass slideCount+1 to append. */
  index?: number;
  select?: boolean;
}
export interface FikaDeleteSlidesResult {
  deleted: string[];
  /** 1-based current slide number after the delete. 0 when the deck is empty. */
  slideIndex: number;
  currentSlideId?: string;
}
export type FikaIdMap = Record<string, string>;
export interface FikaIdRemap {
  slideIds: FikaIdMap;
  elementIds: FikaIdMap;
  groupIds: FikaIdMap;
  animationIds: FikaIdMap;
}
export interface FikaInsertSlidesInput {
  slides: Slide | Slide[];
  index?: number;
  select?: boolean;
  preserveExternalSlideLinks?: boolean;
}
export interface FikaInsertSlidesResult {
  slides: Slide[];
  remap: FikaIdRemap;
}
export interface FikaCreateElementInput {
  slideId?: string;
  index?: number;
  element: Partial<PPTElement> & {
    type: PPTElement['type'];
  };
  select?: boolean;
}
export interface FikaShapePreset extends ShapePoolItem {
  id: string;
  categoryKey: ShapeCategoryKey;
  index: number;
}
export type FikaShapePatch = Omit<Partial<Pick<PPTShapeElement, 'path' | 'viewBox' | 'fixedRatio' | 'fill' | 'gradient' | 'pattern' | 'outline' | 'text' | 'pathFormula' | 'keypoints' | 'left' | 'top' | 'width' | 'height' | 'rotate' | 'opacity' | 'flipH' | 'flipV' | 'shadow' | 'special'>>, 'outline' | 'text'> & {
  outline?: Partial<NonNullable<PPTShapeElement['outline']>>;
  text?: Partial<ShapeText>;
};
export type FikaShapeFillInput = string | Pick<FikaShapePatch, 'fill' | 'gradient' | 'pattern'>;
export type FikaCreateShapeInput = FikaShapePatch & {
  slideId?: string;
  index?: number;
  select?: boolean;
  presetId?: string;
  categoryKey?: ShapeCategoryKey;
  presetIndex?: number;
  preset?: ShapePoolItem;
  element?: Partial<PPTShapeElement>;
};
export interface FikaInsertElementsInput {
  slideId?: string;
  index?: number;
  elements: PPTElement | PPTElement[];
  animations?: PPTAnimation[];
  offset?: number | {
    left?: number;
    top?: number;
  };
  select?: boolean;
  preserveExternalSlideLinks?: boolean;
  slideIdMap?: FikaIdMap;
}
export interface FikaInsertElementsResult {
  slideId: string;
  elements: PPTElement[];
  animations: PPTAnimation[];
  remap: Omit<FikaIdRemap, 'slideIds'> & {
    slideIds?: FikaIdMap;
  };
}
export interface FikaLatexElementSizing {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotate?: number;
}

export type FikaLatexElementInput = FikaLatexElementSizing & Pick<PPTLatexElement, 'latex'> & Partial<Pick<PPTLatexElement, 'path' | 'id' | 'color' | 'strokeWidth' | 'viewBox' | 'fixedRatio' | 'link' | 'name' | 'lock' | 'groupId'>>;
export type FikaLatexElementPatch = Partial<FikaLatexElementSizing & Pick<PPTLatexElement, 'latex' | 'path' | 'color' | 'strokeWidth' | 'viewBox' | 'fixedRatio' | 'link' | 'name' | 'lock' | 'groupId'>>;
export interface FikaCreateLatexElementInput {
  slideId?: string;
  index?: number;
  element: FikaLatexElementInput;
  select?: boolean;
}
export type FikaLinePoint = PPTLineElement['start'];
export type FikaLineDirectionInput = Broken2LineDirection | 'auto';
export type FikaLineElementInput = Partial<Pick<PPTLineElement, 'id' | 'left' | 'top' | 'width' | 'style' | 'color' | 'points' | 'shadow' | 'broken' | 'broken2' | 'broken2Direction' | 'curve' | 'cubic' | 'link' | 'name' | 'lock' | 'groupId'>> & Pick<PPTLineElement, 'start' | 'end'>;
export type FikaLineElementPatch = Partial<Pick<PPTLineElement, 'left' | 'top' | 'width' | 'start' | 'end' | 'style' | 'color' | 'points' | 'shadow' | 'broken' | 'broken2' | 'broken2Direction' | 'curve' | 'cubic' | 'link' | 'name' | 'lock' | 'groupId'>>;
export interface FikaCreateLineElementInput {
  slideId?: string;
  index?: number;
  element: FikaLineElementInput;
  select?: boolean;
}
export interface FikaLineStyleInput {
  style?: LineStyleType;
  color?: string;
  width?: number;
}
export interface FikaCreateTextInput {
  slideId?: string;
  index?: number;
  /** HTML content (wins over `markdown` when both are supplied). */
  content?: string;
  /** Markdown content; converted to HTML by the bridge. */
  markdown?: string;
  element?: Partial<PPTTextElement>;
  select?: boolean;
}
export interface FikaTextContentUpdateInput {
  content?: string;
  prepend?: string;
  append?: string;
}
export type FikaTextStylePatch = Partial<Pick<PPTTextElement, 'defaultFontName' | 'defaultColor' | 'outline' | 'fill' | 'lineHeight' | 'wordSpace' | 'opacity' | 'shadow' | 'paragraphSpace' | 'vertical' | 'textType' | 'inset'>>;
export interface FikaVideoPlaybackPatch {
  src?: string;
  ext?: string;
  autoplay?: boolean;
  poster?: string;
}
export interface FikaVideoSourcePatch {
  src: string;
  ext?: string;
}
export interface FikaVideoSizePatch {
  width?: number;
  height?: number;
}
export interface FikaVideoPositionPatch {
  left?: number;
  top?: number;
  rotate?: number;
}
export interface FikaVideoStylePatch {
  lock?: boolean;
  groupId?: string;
  name?: string;
  link?: PPTElementLink;
}
export type FikaVideoPatch = FikaVideoPlaybackPatch & FikaVideoSizePatch & FikaVideoPositionPatch & FikaVideoStylePatch;
export interface FikaChartElementPatch {
  chartType?: ChartType;
  data?: ChartData;
  options?: ChartOptions;
  fill?: PPTChartElement['fill'];
  outline?: Partial<NonNullable<PPTChartElement['outline']>>;
  themeColors?: string[];
  textColor?: string;
  lineColor?: string;
}
export type FikaCreateChartInput = FikaChartElementPatch & Partial<Pick<PPTChartElement, 'id' | 'left' | 'top' | 'width' | 'height' | 'rotate'>> & {
  slideId?: string;
  index?: number;
  select?: boolean;
};
export type FikaTableElementPatch = Partial<Omit<PPTTableElement, 'type' | 'id' | 'outline' | 'theme'>> & {
  outline?: Partial<PPTTableElement['outline']>;
  theme?: Partial<NonNullable<PPTTableElement['theme']>>;
};
export type FikaCreateTableInput = FikaTableElementPatch & {
  id?: string;
  slideId?: string;
  index?: number;
  select?: boolean;
  element?: Partial<PPTTableElement>;
};
export type FikaSlideReference = string | number;
export type FikaRichTextStylePatch = Partial<Pick<PPTTextElement, 'defaultFontName' | 'defaultColor' | 'lineHeight' | 'paragraphSpace' | 'wordSpace' | 'inset' | 'vertical'>> & Partial<Pick<ShapeText, 'align'>>;
export interface FikaRichTextParagraphAttrs {
  align?: TextAlign | '';
  indent?: number;
  textIndent?: number;
}
export type FikaRichTextElement = PPTTextElement | PPTShapeElement;
export type FikaOutlineElement = PPTTextElement | PPTImageElement | PPTShapeElement | PPTChartElement | PPTTableElement;
export type FikaShadowElement = PPTTextElement | PPTImageElement | PPTShapeElement | PPTLineElement;
export type FikaFillElement = PPTTextElement | PPTShapeElement | PPTChartElement;
export interface FikaAnimationPreset {
  name: string;
  value: string;
}
export interface FikaAnimationPresetGroup {
  type: string;
  name: string;
  children: FikaAnimationPreset[];
}
export interface FikaSlideAnimationPreset {
  label: string;
  value: TurningMode;
}
export interface FikaAnimationCatalog {
  enter: FikaAnimationPresetGroup[];
  exit: FikaAnimationPresetGroup[];
  attention: FikaAnimationPresetGroup[];
  slide: FikaSlideAnimationPreset[];
}
export interface FikaAnimationSequenceStep {
  index: number;
  animations: PPTAnimation[];
  autoNext: boolean;
}
export interface FikaSlideTransition {
  slideId: string;
  turningMode?: TurningMode;
}
export interface FikaElementTransformPatch {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotate?: number;
  opacity?: number;
  flipH?: boolean;
  flipV?: boolean;
}
export type FikaAudioTransformPatch = Pick<FikaElementTransformPatch, 'left' | 'top' | 'width' | 'height' | 'rotate'>;
export type FikaAudioSourceInput = FikaMediaAssetInput;
export type FikaAudioElementPatch = Partial<Pick<PPTAudioElement, 'src' | 'ext' | 'autoplay' | 'loop' | 'color' | 'poster' | 'fixedRatio' | 'link' | 'name' | 'lock' | 'groupId'>> & {
  transform?: FikaAudioTransformPatch;
};
export interface FikaCreateAudioInput extends FikaAudioElementPatch {
  id?: string;
  source?: FikaAudioSourceInput;
  slideId?: string;
  index?: number;
  select?: boolean;
}
export interface FikaElementMoveInput {
  left?: number;
  top?: number;
  dx?: number;
  dy?: number;
}
export interface FikaElementResizeInput {
  width?: number;
  height?: number;
  dw?: number;
  dh?: number;
}
export interface FikaElementFlipInput {
  flipH?: boolean;
  flipV?: boolean;
}
export interface FikaApplyTemplateResult {
  templateId: string;
  theme: SlideTheme;
}
export interface FikaInsertFromTemplateInput {
  /** Host-registered template id from `templates.catalog`. */
  templateId: string;
  /** Slide slug from `templates.slidesCatalog` (e.g. `cover_1`, `content_2`). */
  slug: string;
  /** 1-based insert position; omit or pass slideCount+1 to append. */
  index?: number;
  select?: boolean;
  /** Apply the template theme when the deck is still empty (default true). */
  applyTemplateTheme?: boolean;
}
export interface FikaInsertFromTemplateResult {
  slideId: string;
  /** 1-based position of the inserted slide. */
  slideIndex: number;
  templateId: string;
  slug: string;
  elementIds: string[];
  textElementIds: string[];
  placeholderElementIds: string[];
}
export interface FikaAgentTemplatesApi {
  /** List host-registered presentation templates shown in the template picker. */
  catalog(): FikaTemplateSummary[];
  /** List insertable slides for a template, grouped by type (cover, contents, …). */
  slidesCatalog(templateId: string, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaTemplateSlidesCatalogResult>>;
}
export interface FikaApplyStyleResult {
  /** The preset id actually applied (the requested one, or the default fallback). */
  styleId: string;
  theme: SlideTheme;
}

/** Optional title slide built inside `deck.setup` (saves a separate createFromLayout). */
export interface FikaSetupTitleInput {
  /** Content slots for the `title` layout (title, subtitle?, eyebrow?). */
  slots: Record<string, unknown>;
  /** Optional variant id; defaults to the planned/centered title variant. */
  variantId?: string;
}

/** One-shot deck bootstrap: apply a style AND plan composition in a single command. */
export interface FikaSetupDeckInput {
  /** Preset id from `styles.catalog` ('academic' | 'minimal' | 'bold' | 'playful'). */
  styleId: string;
  /** Total slides in the deck (including title + closing). */
  slideCount: number;
  /** Optional per-slide hints to bias specific positions. */
  hints?: CompositionSlideHint[];
  /**
   * When set, also builds the title slide in this same call (replaces the blank
   * starter). Prefer this so a 7-slide deck is setup(+title) + 6 creates.
   */
  title?: FikaSetupTitleInput;
}

/** Result of `deck.setup` — style application + composition plan together. */
export interface FikaSetupDeckResult {
  styleId: string;
  theme: SlideTheme;
  plan: CompositionPlan;
  motif: FikaStyleMotif;
  /** Lean style catalog so the agent can skip a separate styles.catalog call. */
  styles: FikaStyleSummary[];
  /** Present when `title` was requested and the cover slide was built. */
  titleSlideId?: string;
  /** True when the title slide replaced the blank starter. */
  titleBuilt?: boolean;
}
export interface FikaCreateFromLayoutInput {
  /** Layout id from `layouts.catalog` (e.g. `title`, `bullets`, `twoColumn`). */
  layoutId: string;
  /** Visual variant id (from the layout's `variants` in the catalog). Omit for the default. */
  variantId?: string;
  /** Content slots for the layout. Keys + shapes are described per layout in the catalog. */
  slots?: Record<string, unknown>;
  /**
   * 1-based slide number. Omit to append (or replace the blank starter / a duplicate title).
   * 1…slideCount replaces that slide in place. slideCount+1 appends.
   */
  index?: number;
  select?: boolean;
  /** Force a feature (dark) or plain background; defaults to the layout's own preference. */
  backgroundMode?: FikaLayoutBackgroundMode;
}
export interface FikaCreateFromLayoutResult {
  slideId: string;
  /** 1-based position of the created or replaced slide. Same number as payload.index when you passed one. */
  slideIndex: number;
  layoutId: string;
  /** The variant actually built. */
  variantId: string;
  /** The variant's composition anchor. */
  anchor: CompositionAnchor;
  /** True when this slide replaced the deck's lone pristine blank starter or a duplicate title after setup. */
  replacedStarter?: boolean;
  /** True when an existing slide was overwritten in place. */
  replaced?: boolean;
  elementIds: string[];
  textElementIds: string[];
}

/** Input for planning a whole-deck composition rhythm. */
export interface FikaPlanCompositionInput {
  /** Number of slides in the deck (including title + closing). */
  slideCount: number;
  /** Optional per-slide hints to bias specific positions. */
  hints?: CompositionSlideHint[];
}

/** The planned composition rhythm for a deck. */
export interface FikaPlanCompositionResult {
  plan: CompositionPlan;
  /** The active style id the plan was sequenced for. */
  styleId: string;
  /** The style's signature motif (so the agent keeps the deck's throughline). */
  motif: FikaStyleMotif;
}
export interface FikaAgentStylesApi {
  /** List the contrast-safe visual identity presets (academic/minimal/bold/playful). */
  catalog(): FikaStyleSummary[];
}
export interface FikaAgentLayoutsApi {
  /** List the compositional slide recipes and their content slots. */
  catalog(): FikaLayout[];
}
export interface FikaAgentDeckApi {
  get(): FikaDeckDocument;
  set(document: FikaDeckInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaDeckDocument>>;
  patch(patch: FikaDeckPatch, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaDeckDocument>>;
  setTitle(title: string, meta?: FikaCommandMeta): Promise<FikaCommandResult<{
    title: string;
  }>>;
  getTheme(): SlideTheme;
  setTheme(theme: FikaSlideThemePatch, meta?: FikaCommandMeta): Promise<FikaCommandResult<SlideTheme>>;
  applyTemplate(templateId: string, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaApplyTemplateResult>>;
  /** Apply a style preset (from `styles.catalog`) as the deck's visual identity; records `theme.styleId`. */
  applyStyle(styleId: string, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaApplyStyleResult>>;
  /** Plan a non-repeating composition rhythm for the deck (anchors, loud slide, motif). Call after applyStyle. */
  planComposition(input: FikaPlanCompositionInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaPlanCompositionResult>>;
  /**
   * PREFERRED bootstrap for a from-scratch deck: apply a style AND plan composition
   * in ONE call. Prefer this over separate `applyStyle` + `planComposition`.
   */
  setup(input: FikaSetupDeckInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaSetupDeckResult>>;
  applyTheme(theme: FikaSlideThemePatch, options?: FikaApplyThemeOptions, meta?: FikaCommandMeta): Promise<FikaCommandResult<SlideTheme>>;
  extractTheme(options?: FikaThemeExtractionOptions): SlideTheme;
  setViewport(viewport: {
    size?: number;
    ratio?: number;
  }, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaBridgeState>>;
  setTemplates(templates: SlideTemplate[], meta?: FikaCommandMeta): Promise<FikaCommandResult<SlideTemplate[]>>;
}
export interface FikaAgentSlidesApi {
  list(): Slide[];
  get(slideIdOrIndex?: FikaSlideReference): Slide | null;
  current(): Slide | null;
  read(slideIdOrIndex?: FikaSlideReference, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide | null>>;
  create(input?: FikaCreateSlideInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide>>;
  /** Build + insert a themed slide from a layout recipe (from `layouts.catalog`) using the active style preset. */
  createFromLayout(input: FikaCreateFromLayoutInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaCreateFromLayoutResult>>;
  insertFromTemplate(input: FikaInsertFromTemplateInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaInsertFromTemplateResult>>;
  insert(input: FikaInsertSlidesInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaInsertSlidesResult>>;
  update(slideId: string, patch: Partial<Slide>, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide>>;
  delete(slideId: string | string[], meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaDeleteSlidesResult>>;
  duplicate(slideIdOrIndex?: FikaSlideReference, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide>>;
  move(slideIdOrIndex: FikaSlideReference, toIndex: number, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide[]>>;
  select(slideIdOrIndex: FikaSlideReference, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaBridgeState>>;
  setBackground(slideId: string, background?: SlideBackground, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide>>;
  applyBackground(background: SlideBackground, slideIds?: string[], meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide[]>>;
  applyBackgroundToAll(background: SlideBackground, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide[]>>;
  getTransition(slideId?: string): FikaSlideTransition;
  setTransition(slideId: string, turningMode?: TurningMode, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide>>;
  getRemark(slideId?: string): string;
  setRemark(slideId: string, remark: string, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide>>;
}
export interface FikaAgentElementsApi {
  list(slideId?: string): PPTElement[];
  get(elementId: string, slideId?: string): PPTElement | null;
  create(input: FikaCreateElementInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTElement>>;
  insert(input: FikaInsertElementsInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaInsertElementsResult>>;
  update(elementId: string | string[], patch: Partial<PPTElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  setTransform(elementId: string | string[], transform: FikaElementTransformPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  move(elementId: string | string[], position: FikaElementMoveInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  resize(elementId: string | string[], size: FikaElementResizeInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  rotate(elementId: string | string[], rotate: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  setOpacity(elementId: string | string[], opacity: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  setFlip(elementId: string | string[], flip: FikaElementFlipInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  delete(elementId: string | string[], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<{
    deleted: string[];
  }>>;
  reorder(elementId: string, toIndex: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  bringForward(elementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  sendBackward(elementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  bringToFront(elementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  sendToBack(elementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  select(elementId: string | string[], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaBridgeState>>;
  selectGroup(groupIdOrElementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaBridgeState>>;
  clearSelection(meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaBridgeState>>;
  setHandle(elementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaBridgeState>>;
  group(elementIds: string[], groupId?: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  ungroup(groupIdOrElementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  lock(elementId: string | string[], locked?: boolean, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTElement[]>>;
  unlock(elementId: string | string[], meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTElement[]>>;
  hide(elementId: string | string[], hidden?: boolean, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaBridgeState>>;
  show(elementId: string | string[], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaBridgeState>>;
  setLink(elementId: string, link?: PPTElementLink, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  setOutline(elementId: string | string[], outline: PPTElementOutline, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaOutlineElement[]>>;
  setShadow(elementId: string | string[], shadow: PPTElementShadow, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaShadowElement[]>>;
  setFill(elementId: string | string[], fill: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaFillElement[]>>;
  setGradient(elementId: string | string[], gradient: Gradient, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement[]>>;
  setColorMask(elementId: string | string[], colorMask: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement[]>>;
}
export interface FikaAgentTextApi {
  list(slideId?: string): PPTTextElement[];
  get(elementId: string, slideId?: string): PPTTextElement | null;
  create(input?: FikaCreateTextInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTTextElement>>;
  update(elementId: string, patch: Partial<PPTTextElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTextElement>>;
  delete(elementId: string | string[], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<{
    deleted: string[];
  }>>;
  getContent(elementId: string, slideId?: string): string | null;
  setContent(elementId: string, content: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTextElement>>;
  /** Replace content from a Markdown string (converted to HTML). */
  setMarkdown(elementId: string, markdown: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTextElement>>;
  updateContent(elementId: string, update: FikaTextContentUpdateInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTextElement>>;
  clearContent(elementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTextElement>>;
  setStyle(elementId: string, style: FikaTextStylePatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTextElement>>;
}
export interface FikaAgentShapesApi {
  presets(categoryKey?: ShapeCategoryKey | 'rect'): FikaShapePreset[];
  get(elementId: string, slideId?: string): PPTShapeElement | null;
  create(input?: FikaCreateShapeInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTShapeElement>>;
  patch(elementId: string, patch: FikaShapePatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement>>;
  update(elementId: string, patch: FikaShapePatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement>>;
  setPath(elementId: string, path: string, options?: Pick<FikaShapePatch, 'viewBox' | 'fixedRatio'>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement>>;
  setFormula(elementId: string, pathFormula: PPTShapeElement['pathFormula'], keypoints?: number[], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement>>;
  setFill(elementId: string, fill: FikaShapeFillInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement>>;
  setOutline(elementId: string, outline?: FikaShapePatch['outline'], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement>>;
  setText(elementId: string, text: Partial<ShapeText>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement>>;
}
export interface FikaAgentLinesApi {
  get(elementId: string, slideId?: string): PPTLineElement | null;
  create(input: FikaCreateLineElementInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTLineElement>>;
  update(elementId: string, patch: FikaLineElementPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTLineElement>>;
  setStyle(elementId: string, style: FikaLineStyleInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTLineElement>>;
  setArrowheads(elementId: string, points: [LinePoint, LinePoint], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTLineElement>>;
  setDirection(elementId: string, direction?: FikaLineDirectionInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTLineElement>>;
}
export interface FikaAgentAnimationsApi {
  list(slideId?: string, elementId?: string): PPTAnimation[];
  catalog(): FikaAnimationCatalog;
  sequence(slideId?: string): FikaAnimationSequenceStep[];
  create(slideId: string, animation: Partial<PPTAnimation> & {
    elId: string;
    effect: string;
    type: PPTAnimation['type'];
  }, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTAnimation>>;
  update(slideId: string, animationId: string, patch: Partial<PPTAnimation>, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTAnimation>>;
  setTrigger(slideId: string, animationId: string, trigger: PPTAnimation['trigger'], meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTAnimation>>;
  setDuration(slideId: string, animationId: string, duration: number, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTAnimation>>;
  delete(slideId: string, animationId: string | string[], meta?: FikaCommandMeta): Promise<FikaCommandResult<{
    deleted: string[];
  }>>;
  reorder(slideId: string, animationId: string, toIndex: number, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTAnimation[]>>;
}
export interface FikaAgentTablesApi {
  get(elementId: string, slideId?: string): PPTTableElement | null;
  create(input?: FikaCreateTableInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTTableElement>>;
  update(elementId: string, patch: FikaTableElementPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  setCell(elementId: string, row: number, col: number, patch: Partial<TableCell>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  setCellStyle(elementId: string, row: number, col: number, style: Partial<TableCellStyle>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  insertRow(elementId: string, rowIndex: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  deleteRow(elementId: string, rowIndex: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  insertColumn(elementId: string, colIndex: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  deleteColumn(elementId: string, colIndex: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  mergeCells(elementId: string, row: number, col: number, rowspan: number, colspan: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  splitCell(elementId: string, row: number, col: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
}
export interface FikaAgentChartsApi {
  get(elementId: string, slideId?: string): PPTChartElement | null;
  create(input?: FikaCreateChartInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTChartElement>>;
  update(elementId: string, patch: FikaChartElementPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  setType(elementId: string, chartType: ChartType, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  setData(elementId: string, data: ChartData, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  setLabels(elementId: string, labels: string[], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  setLegends(elementId: string, legends: string[], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  setSeries(elementId: string, index: number, series: number[], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  addSeries(elementId: string, series: number[], meta?: FikaCommandMeta & {
    slideId?: string;
    legend?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  deleteSeries(elementId: string, index: number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  setOptions(elementId: string, options: ChartOptions, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
}
export type FikaImageFilterKey = keyof NonNullable<PPTImageElement['filters']>;
export interface FikaImageMaskInput {
  shape?: NonNullable<PPTImageElement['clip']>['shape'];
  radius?: PPTImageElement['radius'];
  colorMask?: PPTImageElement['colorMask'];
}
export interface FikaImageBackgroundOptions {
  slideId?: string;
  size?: NonNullable<SlideBackground['image']>['size'];
  deleteElement?: boolean;
}
export interface FikaAgentImagesApi {
  get(elementId: string, slideId?: string): PPTImageElement | null;
  update(elementId: string, patch: Partial<PPTImageElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setSource(elementId: string, asset: FikaMediaAssetInput, patch?: Partial<PPTImageElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setClip(elementId: string, clip?: PPTImageElement['clip'], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setCrop(elementId: string, range: NonNullable<PPTImageElement['clip']>['range'], shape?: NonNullable<PPTImageElement['clip']>['shape'], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setMask(elementId: string, mask: FikaImageMaskInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setRadius(elementId: string, radius?: PPTImageElement['radius'], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setFilters(elementId: string, filters?: PPTImageElement['filters'], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setFilter(elementId: string, key: FikaImageFilterKey, value?: string | number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setOpacity(elementId: string, opacity: string | number, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setFlip(elementId: string, flip: Pick<PPTImageElement, 'flipH' | 'flipV'>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setShadow(elementId: string, shadow?: Partial<NonNullable<PPTImageElement['shadow']>>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setColorMask(elementId: string, colorMask?: PPTImageElement['colorMask'], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setImageType(elementId: string, imageType?: PPTImageElement['imageType'], meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setAsBackground(elementId: string, options?: FikaImageBackgroundOptions, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<Slide>>;
}
export interface FikaAgentMediaApi {
  resolveAsset(asset: FikaMediaAssetInput, kind?: FikaMediaAssetKind): FikaMediaAsset;
  setImageSource(elementId: string, asset: FikaMediaAssetInput, patch?: Partial<PPTImageElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  setVideoSource(elementId: string, asset: FikaMediaAssetInput, patch?: Partial<PPTVideoElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
  setAudioSource(elementId: string, asset: FikaMediaAssetInput, patch?: Partial<PPTAudioElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTAudioElement>>;
}
export interface FikaAgentVideosApi {
  get(elementId: string, slideId?: string): PPTVideoElement | null;
  update(elementId: string, patch: FikaVideoPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
  setSource(elementId: string, source: FikaVideoSourcePatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
  setPlayback(elementId: string, playback: FikaVideoPlaybackPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
  setAutoplay(elementId: string, autoplay: boolean, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
  setPoster(elementId: string, poster: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
  setSize(elementId: string, size: FikaVideoSizePatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
  setPosition(elementId: string, position: FikaVideoPositionPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
}
export interface FikaAgentAudioApi {
  get(elementId: string, slideId?: string): PPTAudioElement | null;
  create(input: FikaCreateAudioInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTAudioElement>>;
  update(elementId: string, patch: FikaAudioElementPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTAudioElement>>;
  setSource(elementId: string, source: FikaAudioSourceInput, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTAudioElement>>;
  setPlayback(elementId: string, playback: Pick<FikaAudioElementPatch, 'autoplay' | 'loop'>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTAudioElement>>;
  setIcon(elementId: string, icon: Pick<FikaAudioElementPatch, 'color' | 'fixedRatio'>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTAudioElement>>;
  transform(elementId: string, transform: FikaAudioTransformPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTAudioElement>>;
}
export interface FikaAgentLatexApi {
  get(elementId: string, slideId?: string): PPTLatexElement | null;
  create(input: FikaCreateLatexElementInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<PPTLatexElement>>;
  update(elementId: string, patch: FikaLatexElementPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTLatexElement>>;
}
export type FikaNoteReplyInput = Partial<NoteReply> & {
  content: string;
  user: string;
};
export type FikaNoteInput = Partial<Omit<Note, 'replies'>> & {
  content: string;
  user: string;
  replies?: FikaNoteReplyInput[];
};
export type FikaNotePatch = Partial<Omit<Note, 'replies'>> & {
  replies?: FikaNoteReplyInput[];
};
export interface FikaAgentNotesApi {
  list(slideId: string): Note[];
  create(slideId: string, note: FikaNoteInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<Note>>;
  update(slideId: string, noteId: string, patch: FikaNotePatch, meta?: FikaCommandMeta): Promise<FikaCommandResult<Note>>;
  delete(slideId: string, noteId: string | string[], meta?: FikaCommandMeta): Promise<FikaCommandResult<{
    deleted: string[];
  }>>;
  reply(slideId: string, noteId: string, reply: FikaNoteReplyInput, meta?: FikaCommandMeta): Promise<FikaCommandResult<NoteReply>>;
  listReplies(slideId: string, noteId: string): NoteReply[];
  updateReply(slideId: string, noteId: string, replyId: string, patch: Partial<NoteReply>, meta?: FikaCommandMeta): Promise<FikaCommandResult<NoteReply>>;
  deleteReply(slideId: string, noteId: string, replyId: string | string[], meta?: FikaCommandMeta): Promise<FikaCommandResult<{
    deleted: string[];
  }>>;
}
export interface FikaSectionRange {
  slideId: string;
  index: number;
  section: NonNullable<Slide['sectionTag']>;
  startIndex: number;
  endIndex: number;
  slideIds: string[];
}
export interface FikaAgentSectionsApi {
  set(slideId: string, section: NonNullable<Slide['sectionTag']>, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide>>;
  clear(sectionIdOrSlideId: string, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide>>;
  rename(sectionId: string, title: string, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide[]>>;
  delete(sectionId: string, meta?: FikaCommandMeta): Promise<FikaCommandResult<{
    deleted: string[];
  }>>;
  assignRange(startIndex: number, endIndex: number, section: NonNullable<Slide['sectionTag']>, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide[]>>;
  move(sectionId: string, toIndex: number, meta?: FikaCommandMeta): Promise<FikaCommandResult<Slide[]>>;
  list(): FikaSectionRange[];
}
export interface FikaSearchResult {
  slideId: string;
  elementId: string;
  elementType: PPTElement['type'];
  path: string;
  match: string;
  start?: number;
  end?: number;
  row?: number;
  col?: number;
}
export interface FikaSearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
}
export interface FikaReplaceOptions extends FikaSearchOptions {
  replaceAll?: boolean;
}
export interface FikaSearchResults {
  count: number;
  results: FikaSearchResult[];
}
export interface FikaSearchReplaceResult {
  count: number;
}
export interface FikaAgentSearchApi {
  find(query: string, options?: FikaSearchOptions): Promise<FikaCommandResult<FikaSearchResult[]>>;
  replace(query: string, replacement: string, options?: FikaReplaceOptions, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaSearchReplaceResult>>;
}
export interface FikaAgentHistoryApi {
  commit(label?: string): Promise<FikaCommandResult<FikaBridgeState>>;
  undo(): Promise<FikaCommandResult<FikaBridgeState>>;
  redo(): Promise<FikaCommandResult<FikaBridgeState>>;
}
export interface FikaAgentExportApi {
  /** Returns the serializable deck model; DOM-dependent PDF/PPTX/image exports are not part of the agentic bridge. */
  json(): FikaDocument;
}
export interface FikaAgentImportApi {
  /** Replaces the deck from a JSON-safe document payload. Pass `{ mode: 'append' }` on meta to insert slides instead. */
  json(document: FikaDeckInput, meta?: FikaCommandMeta & FikaImportDocumentOptions): Promise<FikaCommandResult<FikaDeckDocument>>;
  /** Replaces the deck from an already-decoded native `.fika` document payload. */
  fika(document: FikaDeckInput, meta?: FikaCommandMeta & FikaImportDocumentOptions): Promise<FikaCommandResult<FikaDeckDocument>>;
  /** Replaces the deck from PPTX data that has already been converted to a JSON-safe document payload. */
  pptxSafe(document: FikaDeckInput, meta?: FikaCommandMeta & FikaImportDocumentOptions): Promise<FikaCommandResult<FikaDeckDocument>>;
}
export interface FikaAgentLinksApi {
  set(elementId: string, link?: PPTElementLink, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
  remove(elementId: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTElement[]>>;
}
export interface FikaAgentViewApi {
  getState(): FikaBridgeState;
  setLocale(locale: Locales): Promise<FikaCommandResult<{
    locale: Locales;
  }>>;
  goToSlide(slideIdOrIndex: FikaSlideReference, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaBridgeState>>;
  nextSlide(meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaBridgeState>>;
  previousSlide(meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaBridgeState>>;
  setZoom(scale: number, meta?: FikaCommandMeta): Promise<FikaCommandResult<FikaBridgeState>>;
  enterPresentation(): Promise<FikaCommandResult<FikaBridgeState>>;
  exitPresentation(): Promise<FikaCommandResult<FikaBridgeState>>;
}
export interface FikaAgentElementSubtypeApi {
  text(elementId: string, patch: Partial<PPTTextElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTextElement>>;
  setTextContent(elementId: string, content: string, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaRichTextElement>>;
  setTextStyle(elementId: string, style: FikaRichTextStylePatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaRichTextElement>>;
  setParagraphAttrs(elementId: string, attrs: FikaRichTextParagraphAttrs, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<FikaRichTextElement>>;
  image(elementId: string, patch: Partial<PPTImageElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTImageElement>>;
  shape(elementId: string, patch: FikaShapePatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTShapeElement>>;
  line(elementId: string, patch: Partial<PPTLineElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTLineElement>>;
  chart(elementId: string, patch: FikaChartElementPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTChartElement>>;
  table(elementId: string, patch: Partial<PPTTableElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTTableElement>>;
  latex(elementId: string, patch: FikaLatexElementPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTLatexElement>>;
  video(elementId: string, patch: FikaVideoPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTVideoElement>>;
  audio(elementId: string, patch: FikaAudioElementPatch, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<PPTAudioElement>>;
}
export interface FikaAgentApi {
  getState(): FikaBridgeState;
  execute<TData = unknown>(command: FikaAgentCommand): Promise<FikaCommandResult<TData>>;
  executeBatch(commands: FikaAgentCommand[], options?: FikaBatchOptions): Promise<FikaCommandResult[]>;
  canExecute(command: FikaAgentCommand): FikaAgentCapability;
  subscribe(listener: FikaBridgeListener): FikaUnsubscribe;
  /** Convert a Markdown string to the HTML Fika stores. Math support is loaded on demand. */
  markdownToHtml(markdown: string): Promise<string>;
  /** Full authoring docs: design system, domain/command notes, and guides. */
  docs(): FikaAgenticDocs;
  /** Domains with their live command lists, for hierarchical discovery. */
  domains(): FikaDomainSummary[];
  /** Drill into one command: its doc annotation merged with live registry facts. */
  describe(commandType: string): FikaCommandDescription | null;
  /** Slide composition recipes; pass a guide id to fetch a single guide. */
  guides(guideId?: string): FikaDesignGuide[] | FikaDesignGuide | null;
  deck: FikaAgentDeckApi;
  slides: FikaAgentSlidesApi;
  templates: FikaAgentTemplatesApi;
  styles: FikaAgentStylesApi;
  layouts: FikaAgentLayoutsApi;
  elements: FikaAgentElementsApi;
  text: FikaAgentTextApi;
  shapes: FikaAgentShapesApi;
  lines: FikaAgentLinesApi;
  element: FikaAgentElementSubtypeApi;
  animations: FikaAgentAnimationsApi;
  tables: FikaAgentTablesApi;
  charts: FikaAgentChartsApi;
  images: FikaAgentImagesApi;
  media: FikaAgentMediaApi;
  videos: FikaAgentVideosApi;
  audio: FikaAgentAudioApi;
  latex: FikaAgentLatexApi;
  links: FikaAgentLinksApi;
  notes: FikaAgentNotesApi;
  sections: FikaAgentSectionsApi;
  search: FikaAgentSearchApi;
  history: FikaAgentHistoryApi;
  view: FikaAgentViewApi;
  import: FikaAgentImportApi;
  export: FikaAgentExportApi;
}
export interface FikaCommandPayloadMap {
  'deck.get': undefined;
  'deck.set': FikaDeckInput | FikaDocument;
  'deck.patch': FikaDeckPatch | Partial<FikaDocument>;
  'deck.setTitle': {
    title: string;
  };
  'deck.getTheme': undefined;
  'deck.setTheme': {
    theme: FikaSlideThemePatch | Partial<SlideTheme>;
  };
  'deck.applyTheme': {
    theme: FikaSlideThemePatch | Partial<SlideTheme>;
    options?: FikaApplyThemeOptions;
  };
  'deck.applyTemplate': {
    templateId: string;
  };
  'deck.applyStyle': {
    styleId: string;
  };
  'deck.planComposition': FikaPlanCompositionInput;
  'deck.setup': FikaSetupDeckInput;
  'deck.extractTheme': {
    options?: FikaThemeExtractionOptions;
  } | undefined;
  'deck.setViewport': {
    size?: number;
    ratio?: number;
  };
  'deck.setTemplates': {
    templates: SlideTemplate[];
  };
  'templates.catalog': undefined;
  'templates.slidesCatalog': {
    templateId: string;
  };
  'styles.catalog': undefined;
  'layouts.catalog': undefined;
  'import.json': FikaDocumentImportPayload;
  'import.fika': FikaDocumentImportPayload;
  'import.pptxSafe': FikaDocumentImportPayload;
  'export.json': undefined;
  'slides.list': undefined;
  'slides.get': {
    slideId?: string;
    slideIdOrIndex?: FikaSlideReference;
  } | undefined;
  'slides.current': undefined;
  'slides.read': {
    slideIdOrIndex?: FikaSlideReference;
  } | undefined;
  'slides.create': FikaCreateSlideInput | undefined;
  'slides.createFromLayout': FikaCreateFromLayoutInput;
  'slides.insertFromTemplate': FikaInsertFromTemplateInput;
  'slides.insert': FikaInsertSlidesInput;
  'slides.update': {
    slideId: string;
    patch: Partial<Slide>;
  };
  'slides.delete': {
    slideId: string | string[];
  };
  'slides.duplicate': {
    slideId?: string;
    slideIdOrIndex?: FikaSlideReference;
  } | undefined;
  'slides.move': {
    slideId?: string;
    slideIdOrIndex?: FikaSlideReference;
    toIndex: number;
  };
  'slides.select': {
    slideIdOrIndex: FikaSlideReference;
  };
  'slides.setBackground': {
    slideId: string;
    background?: SlideBackground;
  };
  'slides.applyBackground': {
    background: SlideBackground;
    slideIds?: string[];
    slideId?: string | string[];
  };
  'slides.applyBackgroundToAll': {
    background: SlideBackground;
  };
  'slides.getTransition': {
    slideId?: string;
  } | undefined;
  'slides.setTransition': {
    slideId: string;
    turningMode?: TurningMode;
  };
  'slides.getRemark': {
    slideId?: string;
  } | undefined;
  'slides.setRemark': {
    slideId: string;
    remark: string;
  };
  'elements.list': {
    slideId?: string;
  } | undefined;
  'elements.get': {
    elementId: string;
    slideId?: string;
  };
  'elements.create': FikaCreateElementInput;
  'elements.insert': FikaInsertElementsInput;
  'elements.update': {
    elementId: string | string[];
    slideId?: string;
    patch: Partial<PPTElement>;
  };
  'elements.setTransform': {
    elementId: string | string[];
    slideId?: string;
    transform: FikaElementTransformPatch;
  };
  'elements.move': {
    elementId: string | string[];
    slideId?: string;
    position: FikaElementMoveInput;
  };
  'elements.resize': {
    elementId: string | string[];
    slideId?: string;
    size: FikaElementResizeInput;
  };
  'elements.rotate': {
    elementId: string | string[];
    slideId?: string;
    rotate: number;
  };
  'elements.setOpacity': {
    elementId: string | string[];
    slideId?: string;
    opacity: number;
  };
  'elements.setFlip': {
    elementId: string | string[];
    slideId?: string;
    flip: FikaElementFlipInput;
  };
  'elements.delete': {
    elementId: string | string[];
    slideId?: string;
  };
  'elements.reorder': {
    elementId: string;
    slideId?: string;
    toIndex: number;
  };
  'elements.bringForward': {
    elementId: string;
    slideId?: string;
  };
  'elements.sendBackward': {
    elementId: string;
    slideId?: string;
  };
  'elements.bringToFront': {
    elementId: string;
    slideId?: string;
  };
  'elements.sendToBack': {
    elementId: string;
    slideId?: string;
  };
  'elements.select': {
    elementId: string | string[];
    slideId?: string;
  };
  'elements.selectGroup': {
    groupIdOrElementId: string;
    slideId?: string;
  };
  'elements.clearSelection': undefined;
  'elements.setHandle': {
    elementId: string;
    slideId?: string;
  };
  'elements.group': {
    elementIds: string[];
    groupId?: string;
  };
  'elements.ungroup': {
    groupIdOrElementId: string;
  };
  'elements.lock': {
    elementId: string | string[];
    slideId?: string;
    locked?: boolean;
  };
  'elements.unlock': {
    elementId: string | string[];
    slideId?: string;
  };
  'elements.hide': {
    elementId: string | string[];
    hidden?: boolean;
  };
  'elements.show': {
    elementId: string | string[];
  };
  'elements.setLink': {
    elementId: string;
    slideId?: string;
    link?: PPTElementLink;
  };
  'text.list': {
    slideId?: string;
  } | undefined;
  'text.get': {
    elementId: string;
    slideId?: string;
  };
  'text.create': FikaCreateTextInput | undefined;
  'text.update': {
    elementId: string;
    slideId?: string;
    patch: Partial<PPTTextElement>;
  };
  'text.delete': {
    elementId: string | string[];
    slideId?: string;
  };
  'text.getContent': {
    elementId: string;
    slideId?: string;
  };
  'text.setContent': {
    elementId: string;
    slideId?: string;
    content: string;
  };
  'text.setMarkdown': {
    elementId: string;
    slideId?: string;
    markdown: string;
  };
  'text.updateContent': {
    elementId: string;
    slideId?: string;
    update: FikaTextContentUpdateInput;
  };
  'text.clearContent': {
    elementId: string;
    slideId?: string;
  };
  'text.setStyle': {
    elementId: string;
    slideId?: string;
    style: FikaTextStylePatch;
  };
  'lines.get': {
    elementId: string;
    slideId?: string;
  };
  'lines.create': FikaCreateLineElementInput;
  'lines.update': {
    elementId: string;
    slideId?: string;
    patch: FikaLineElementPatch;
  };
  'lines.setStyle': {
    elementId: string;
    slideId?: string;
    style: FikaLineStyleInput;
  };
  'lines.setArrowheads': {
    elementId: string;
    slideId?: string;
    points: [LinePoint, LinePoint];
  };
  'lines.setDirection': {
    elementId: string;
    slideId?: string;
    direction?: FikaLineDirectionInput;
  };
  'shapes.presets': {
    categoryKey?: ShapeCategoryKey | 'rect';
  } | undefined;
  'shapes.create': FikaCreateShapeInput | undefined;
  'shapes.patch': {
    elementId: string;
    slideId?: string;
    patch: FikaShapePatch;
  };
  'shapes.update': {
    elementId: string;
    slideId?: string;
    patch: FikaShapePatch;
  };
  'shapes.setPath': {
    elementId: string;
    slideId?: string;
    path: string;
    viewBox?: PPTShapeElement['viewBox'];
    fixedRatio?: boolean;
  };
  'shapes.setFormula': {
    elementId: string;
    slideId?: string;
    pathFormula: PPTShapeElement['pathFormula'];
    keypoints?: number[];
  };
  'shapes.setFill': {
    elementId: string;
    slideId?: string;
    fill: FikaShapeFillInput;
  };
  'shapes.setOutline': {
    elementId: string;
    slideId?: string;
    outline?: FikaShapePatch['outline'];
  };
  'shapes.setText': {
    elementId: string;
    slideId?: string;
    text?: Partial<ShapeText>;
  };
  'animations.list': {
    slideId?: string;
    elementId?: string;
  } | undefined;
  'animations.catalog': undefined;
  'animations.sequence': {
    slideId?: string;
  } | undefined;
  'animations.create': {
    slideId: string;
    animation: Partial<PPTAnimation> & {
      elId: string;
      effect: string;
      type: PPTAnimation['type'];
    };
  };
  'animations.update': {
    slideId: string;
    animationId: string;
    patch: Partial<PPTAnimation>;
  };
  'animations.setTrigger': {
    slideId: string;
    animationId: string;
    trigger: PPTAnimation['trigger'];
  };
  'animations.setDuration': {
    slideId: string;
    animationId: string;
    duration: number;
  };
  'animations.delete': {
    slideId: string;
    animationId: string | string[];
  };
  'animations.reorder': {
    slideId: string;
    animationId: string;
    toIndex: number;
  };
  'tables.update': {
    elementId: string;
    slideId?: string;
    patch: FikaTableElementPatch;
  };
  'tables.setCell': {
    elementId: string;
    slideId?: string;
    row: number;
    col: number;
    patch: Partial<TableCell>;
  };
  'tables.setCellStyle': {
    elementId: string;
    slideId?: string;
    row: number;
    col: number;
    style: Partial<TableCellStyle>;
  };
  'tables.insertRow': {
    elementId: string;
    slideId?: string;
    rowIndex: number;
  };
  'tables.deleteRow': {
    elementId: string;
    slideId?: string;
    rowIndex: number;
  };
  'tables.insertColumn': {
    elementId: string;
    slideId?: string;
    colIndex: number;
  };
  'tables.deleteColumn': {
    elementId: string;
    slideId?: string;
    colIndex: number;
  };
  'tables.mergeCells': {
    elementId: string;
    slideId?: string;
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
  };
  'tables.splitCell': {
    elementId: string;
    slideId?: string;
    row: number;
    col: number;
  };
  'charts.create': FikaCreateChartInput | undefined;
  'charts.update': {
    elementId: string;
    slideId?: string;
    patch: FikaChartElementPatch | Partial<PPTChartElement>;
  };
  'charts.setType': {
    elementId: string;
    slideId?: string;
    chartType: ChartType;
  };
  'charts.setData': {
    elementId: string;
    slideId?: string;
    data: ChartData;
  };
  'charts.setLabels': {
    elementId: string;
    slideId?: string;
    labels: string[];
  };
  'charts.setLegends': {
    elementId: string;
    slideId?: string;
    legends: string[];
  };
  'charts.setSeries': {
    elementId: string;
    slideId?: string;
    index: number;
    series: number[];
  };
  'charts.addSeries': {
    elementId: string;
    slideId?: string;
    series: number[];
    legend?: string;
  };
  'charts.deleteSeries': {
    elementId: string;
    slideId?: string;
    index: number;
  };
  'charts.setOptions': {
    elementId: string;
    slideId?: string;
    options: ChartOptions;
  };
  'images.update': {
    elementId: string;
    slideId?: string;
    patch: Partial<PPTImageElement>;
  };
  'images.setSource': {
    elementId: string;
    slideId?: string;
    asset: FikaMediaAssetInput;
    patch?: Partial<PPTImageElement>;
  };
  'images.setClip': {
    elementId: string;
    slideId?: string;
    clip?: PPTImageElement['clip'];
  };
  'images.setCrop': {
    elementId: string;
    slideId?: string;
    range: NonNullable<PPTImageElement['clip']>['range'];
    shape?: NonNullable<PPTImageElement['clip']>['shape'];
  };
  'images.setMask': {
    elementId: string;
    slideId?: string;
    mask: FikaImageMaskInput;
  };
  'images.setRadius': {
    elementId: string;
    slideId?: string;
    radius?: PPTImageElement['radius'];
  };
  'images.setFilters': {
    elementId: string;
    slideId?: string;
    filters?: PPTImageElement['filters'];
  };
  'images.setFilter': {
    elementId: string;
    slideId?: string;
    key: FikaImageFilterKey;
    value?: string | number;
  };
  'images.setOpacity': {
    elementId: string;
    slideId?: string;
    opacity: string | number;
  };
  'images.setFlip': {
    elementId: string;
    slideId?: string;
    flip: Pick<PPTImageElement, 'flipH' | 'flipV'>;
  };
  'images.setShadow': {
    elementId: string;
    slideId?: string;
    shadow?: Partial<NonNullable<PPTImageElement['shadow']>>;
  };
  'images.setColorMask': {
    elementId: string;
    slideId?: string;
    colorMask?: PPTImageElement['colorMask'];
  };
  'images.setImageType': {
    elementId: string;
    slideId?: string;
    imageType?: PPTImageElement['imageType'];
  };
  'images.setAsBackground': {
    elementId: string;
    slideId?: string;
    options?: FikaImageBackgroundOptions;
  };
  'media.resolveAsset': {
    asset: FikaMediaAssetInput;
    kind?: FikaMediaAssetKind;
  };
  'media.setImageSource': {
    elementId: string;
    slideId?: string;
    asset: FikaMediaAssetInput;
    patch?: Partial<PPTImageElement>;
  };
  'media.setVideoSource': {
    elementId: string;
    slideId?: string;
    asset: FikaMediaAssetInput;
    patch?: Partial<PPTVideoElement>;
  };
  'media.setAudioSource': {
    elementId: string;
    slideId?: string;
    asset: FikaMediaAssetInput;
    patch?: Partial<PPTAudioElement>;
  };
  'videos.get': {
    elementId: string;
    slideId?: string;
  };
  'videos.update': {
    elementId: string;
    slideId?: string;
    patch: FikaVideoPatch;
  };
  'videos.setSource': {
    elementId: string;
    slideId?: string;
    source: FikaVideoSourcePatch;
  };
  'videos.setPlayback': {
    elementId: string;
    slideId?: string;
    playback: FikaVideoPlaybackPatch;
  };
  'videos.setAutoplay': {
    elementId: string;
    slideId?: string;
    autoplay: boolean;
  };
  'videos.setPoster': {
    elementId: string;
    slideId?: string;
    poster: string;
  };
  'videos.setSize': {
    elementId: string;
    slideId?: string;
    size: FikaVideoSizePatch;
  };
  'videos.setPosition': {
    elementId: string;
    slideId?: string;
    position: FikaVideoPositionPatch;
  };
  'links.set': {
    elementId: string;
    slideId?: string;
    link?: PPTElementLink;
  };
  'links.remove': {
    elementId: string;
    slideId?: string;
  };
  'notes.create': {
    slideId: string;
    note: FikaNoteInput;
  };
  'notes.update': {
    slideId: string;
    noteId: string;
    patch: FikaNotePatch;
  };
  'notes.delete': {
    slideId: string;
    noteId: string | string[];
  };
  'notes.reply': {
    slideId: string;
    noteId: string;
    reply: FikaNoteReplyInput;
  };
  'notes.listReplies': {
    slideId: string;
    noteId: string;
  };
  'notes.updateReply': {
    slideId: string;
    noteId: string;
    replyId: string;
    patch: Partial<NoteReply>;
  };
  'notes.deleteReply': {
    slideId: string;
    noteId: string;
    replyId: string | string[];
  };
  'sections.set': {
    slideId: string;
    section: NonNullable<Slide['sectionTag']>;
  };
  'sections.clear': {
    sectionIdOrSlideId: string;
  };
  'sections.rename': {
    sectionId: string;
    title: string;
  };
  'sections.delete': {
    sectionId: string;
  };
  'sections.assignRange': {
    startIndex: number;
    endIndex: number;
    section: NonNullable<Slide['sectionTag']>;
  };
  'sections.move': {
    sectionId: string;
    toIndex: number;
  };
  'search.find': {
    query: string;
    options?: FikaSearchOptions;
  };
  'search.replace': {
    query: string;
    replacement: string;
    options?: FikaReplaceOptions;
  };
  'history.commit': {
    label?: string;
  } | undefined;
  'history.undo': undefined;
  'history.redo': undefined;
  'view.setLocale': {
    locale: Locales;
  };
  'view.goToSlide': {
    slideIdOrIndex: FikaSlideReference;
  };
  'view.nextSlide': undefined;
  'view.previousSlide': undefined;
  'view.setZoom': {
    scale: number;
  };
  'view.enterPresentation': undefined;
  'view.exitPresentation': undefined;
}
export interface FikaCommandResultDataMap {
  'deck.get': FikaDeckDocument;
  'deck.set': FikaDeckDocument;
  'deck.patch': FikaDeckDocument;
  'deck.setTitle': {
    title: string;
  };
  'deck.getTheme': SlideTheme;
  'deck.setTheme': SlideTheme;
  'deck.applyTheme': SlideTheme;
  'deck.applyTemplate': FikaApplyTemplateResult;
  'deck.applyStyle': FikaApplyStyleResult;
  'deck.planComposition': FikaPlanCompositionResult;
  'deck.setup': FikaSetupDeckResult;
  'deck.extractTheme': SlideTheme;
  'deck.setViewport': FikaBridgeState;
  'deck.setTemplates': SlideTemplate[];
  'templates.catalog': FikaTemplateSummary[];
  'templates.slidesCatalog': FikaTemplateSlidesCatalogResult;
  'styles.catalog': FikaStyleSummary[];
  'layouts.catalog': FikaLayout[];
  'import.json': FikaDeckDocument;
  'import.fika': FikaDeckDocument;
  'import.pptxSafe': FikaDeckDocument;
  'export.json': FikaDocument;
  'slides.list': Slide[];
  'slides.get': Slide | null;
  'slides.current': Slide | null;
  'slides.read': Slide | null;
  'slides.create': Slide;
  'slides.createFromLayout': FikaCreateFromLayoutResult;
  'slides.insertFromTemplate': FikaInsertFromTemplateResult;
  'slides.insert': FikaInsertSlidesResult;
  'slides.update': Slide;
  'slides.delete': FikaDeleteSlidesResult;
  'slides.duplicate': Slide;
  'slides.move': Slide[];
  'slides.select': FikaBridgeState;
  'slides.setBackground': Slide;
  'slides.applyBackground': Slide[];
  'slides.applyBackgroundToAll': Slide[];
  'slides.getTransition': FikaSlideTransition;
  'slides.setTransition': Slide;
  'slides.getRemark': string;
  'slides.setRemark': Slide;
  'elements.list': PPTElement[];
  'elements.get': PPTElement | null;
  'elements.create': PPTElement;
  'elements.insert': FikaInsertElementsResult;
  'elements.update': PPTElement[];
  'elements.setTransform': PPTElement[];
  'elements.move': PPTElement[];
  'elements.resize': PPTElement[];
  'elements.rotate': PPTElement[];
  'elements.setOpacity': PPTElement[];
  'elements.setFlip': PPTElement[];
  'elements.delete': {
    deleted: string[];
  };
  'elements.reorder': PPTElement[];
  'elements.bringForward': PPTElement[];
  'elements.sendBackward': PPTElement[];
  'elements.bringToFront': PPTElement[];
  'elements.sendToBack': PPTElement[];
  'elements.select': FikaBridgeState;
  'elements.selectGroup': FikaBridgeState;
  'elements.clearSelection': FikaBridgeState;
  'elements.setHandle': FikaBridgeState;
  'elements.group': PPTElement[];
  'elements.ungroup': PPTElement[];
  'elements.lock': PPTElement[];
  'elements.unlock': PPTElement[];
  'elements.hide': FikaBridgeState;
  'elements.show': FikaBridgeState;
  'elements.setLink': PPTElement[];
  'text.list': PPTTextElement[];
  'text.get': PPTTextElement | null;
  'text.create': PPTTextElement;
  'text.update': PPTTextElement;
  'text.delete': {
    deleted: string[];
  };
  'text.getContent': string | null;
  'text.setContent': PPTTextElement;
  'text.setMarkdown': PPTTextElement;
  'text.updateContent': PPTTextElement;
  'text.clearContent': PPTTextElement;
  'text.setStyle': PPTTextElement;
  'lines.get': PPTLineElement | null;
  'lines.create': PPTLineElement;
  'lines.update': PPTLineElement;
  'lines.setStyle': PPTLineElement;
  'lines.setArrowheads': PPTLineElement;
  'lines.setDirection': PPTLineElement;
  'shapes.presets': FikaShapePreset[];
  'shapes.create': PPTShapeElement;
  'shapes.patch': PPTShapeElement;
  'shapes.update': PPTShapeElement;
  'shapes.setPath': PPTShapeElement;
  'shapes.setFormula': PPTShapeElement;
  'shapes.setFill': PPTShapeElement;
  'shapes.setOutline': PPTShapeElement;
  'shapes.setText': PPTShapeElement;
  'animations.list': PPTAnimation[];
  'animations.catalog': FikaAnimationCatalog;
  'animations.sequence': FikaAnimationSequenceStep[];
  'animations.create': PPTAnimation;
  'animations.update': PPTAnimation;
  'animations.setTrigger': PPTAnimation;
  'animations.setDuration': PPTAnimation;
  'animations.delete': {
    deleted: string[];
  };
  'animations.reorder': PPTAnimation[];
  'tables.update': PPTTableElement;
  'tables.setCell': PPTTableElement;
  'tables.setCellStyle': PPTTableElement;
  'tables.insertRow': PPTTableElement;
  'tables.deleteRow': PPTTableElement;
  'tables.insertColumn': PPTTableElement;
  'tables.deleteColumn': PPTTableElement;
  'tables.mergeCells': PPTTableElement;
  'tables.splitCell': PPTTableElement;
  'charts.create': PPTChartElement;
  'charts.update': PPTChartElement;
  'charts.setType': PPTChartElement;
  'charts.setData': PPTChartElement;
  'charts.setLabels': PPTChartElement;
  'charts.setLegends': PPTChartElement;
  'charts.setSeries': PPTChartElement;
  'charts.addSeries': PPTChartElement;
  'charts.deleteSeries': PPTChartElement;
  'charts.setOptions': PPTChartElement;
  'images.update': PPTImageElement;
  'images.setSource': PPTImageElement;
  'images.setClip': PPTImageElement;
  'images.setCrop': PPTImageElement;
  'images.setMask': PPTImageElement;
  'images.setRadius': PPTImageElement;
  'images.setFilters': PPTImageElement;
  'images.setFilter': PPTImageElement;
  'images.setOpacity': PPTImageElement;
  'images.setFlip': PPTImageElement;
  'images.setShadow': PPTImageElement;
  'images.setColorMask': PPTImageElement;
  'images.setImageType': PPTImageElement;
  'images.setAsBackground': Slide;
  'media.resolveAsset': FikaMediaAsset;
  'media.setImageSource': PPTImageElement;
  'media.setVideoSource': PPTVideoElement;
  'media.setAudioSource': PPTAudioElement;
  'videos.get': PPTVideoElement;
  'videos.update': PPTVideoElement;
  'videos.setSource': PPTVideoElement;
  'videos.setPlayback': PPTVideoElement;
  'videos.setAutoplay': PPTVideoElement;
  'videos.setPoster': PPTVideoElement;
  'videos.setSize': PPTVideoElement;
  'videos.setPosition': PPTVideoElement;
  'links.set': PPTElement[];
  'links.remove': PPTElement[];
  'notes.create': Note;
  'notes.update': Note;
  'notes.delete': {
    deleted: string[];
  };
  'notes.reply': NoteReply;
  'notes.listReplies': NoteReply[];
  'notes.updateReply': NoteReply;
  'notes.deleteReply': {
    deleted: string[];
  };
  'sections.set': Slide;
  'sections.clear': Slide;
  'sections.rename': Slide[];
  'sections.delete': {
    deleted: string[];
  };
  'sections.assignRange': Slide[];
  'sections.move': Slide[];
  'search.find': FikaSearchResult[];
  'search.replace': FikaSearchReplaceResult;
  'history.commit': FikaBridgeState;
  'history.undo': FikaBridgeState;
  'history.redo': FikaBridgeState;
  'view.setLocale': {
    locale: Locales;
  };
  'view.goToSlide': FikaBridgeState;
  'view.nextSlide': FikaBridgeState;
  'view.previousSlide': FikaBridgeState;
  'view.setZoom': FikaBridgeState;
  'view.enterPresentation': FikaBridgeState;
  'view.exitPresentation': FikaBridgeState;
}
