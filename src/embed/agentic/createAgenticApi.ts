import { getAttentionAnimations, getEnterAnimations, getExitAnimations, getSlideAnimations, SLIDE_ANIMATIONS } from '@/configs/animation';
import { SHAPE_LIST, type ShapePoolItem } from '@/configs/shapes';
import { useMainStore } from '@/store/main';
import { useScreenStore } from '@/store/screen';
import { useSlidesStore } from '@/store/slides';
import { createStores } from '@/store/accessors';
import type { ChartData, ChartOptions, ChartType, Gradient, Note, NoteReply, PPTAnimation, PPTAudioElement, PPTChartElement, PPTElement, PPTElementOutline, PPTElementShadow, PPTImageElement, PPTLatexElement, PPTLineElement, PPTShapeElement, PPTTableElement, PPTTextElement, PPTVideoElement, Slide, SlideBackground, SlideTheme, SlideTemplate, ShapeText, TableCell, TableCellStyle, TurningMode } from '@/types/slides';
import { applyLocale } from '../localeBridge';
import { inferViewportFromSlides } from '../inferViewport';
import { clampIndex, cloneElementsWithRemappedIds, clonePatch, clonePlain, cloneSlidesWithRemappedIds, createId, createIssue, createTableCell, ensureElementOnSlide, ensureSlide, findElement, findSlideLinkReferences, insertIndex, isCanonicalCommandType, mergeShapeElement, mergeTheme, normalizeAnimation, normalizeAudioElement, normalizeAudioPatch, deriveLatexGeometry, normalizeElement, normalizeElementLink, normalizeLatexElement, normalizeLineElement, normalizeNote, normalizeNotePatch, normalizeReply, normalizeShapeElement, normalizeSlide, normalizeTableElementPatch, resolveMediaAsset, toIdList, updateLineElement } from './helpers';
import { agentTextToHtmlBreaks } from '@/utils/agentText';
import { markdownToHtml } from '@/utils/markdown';
import { applySlideBackgroundWithContrast, resolveChartLabelColor } from '@/utils/textContrast';
import { resolveImportApply, type ImportApplyOptions } from '@/utils/importApply';
import { assertKnownTemplateId, buildTemplateSlidesCatalog, listTemplateCatalog, loadTemplatePayload, resolveTemplateSlide, templateThemePatch } from './templates';
import { buildLayoutSlide, layoutExpectsBody, listLayouts, type FikaLayoutBackgroundMode } from './layouts';
import { pickNearestAnchor, sequenceComposition, toApiCompositionPlan, type CompositionAnchor } from './composition';
import { validateSlide } from './qa';
import { getStylePreset, listStylePresets, resolveStylePreset, styleThemePatch } from './styles';
import { AGENTIC_DOCS, describeAgenticCommand, listAgenticDomains } from './manifestDocs';
import type { FikaAgentApi, FikaAgentCapability, FikaAgentCommand, FikaAudioElementPatch, FikaAudioSourceInput, FikaAudioTransformPatch, FikaAnimationCatalog, FikaAnimationSequenceStep, FikaBatchOptions, FikaBridgeEvent, FikaBridgeListener, FikaBridgeState, FikaChartElementPatch, FikaCommandIssue, FikaCommandMeta, FikaCommandResult, FikaCommandType, FikaCreateChartInput, FikaCreateAudioInput, FikaCreateLatexElementInput, FikaCreateShapeInput, FikaCreateTableInput, FikaCreateLineElementInput, FikaDeckDocument, FikaDeckInput, FikaDeckPatch, FikaDeckViewport, FikaApplyThemeOptions, FikaElementFlipInput, FikaInsertElementsInput, FikaInsertSlidesInput, FikaElementMoveInput, FikaElementResizeInput, FikaElementTransformPatch, FikaLatexElementPatch, FikaLineDirectionInput, FikaLineElementPatch, FikaLineStyleInput, FikaMediaAssetInput, FikaMediaAssetKind, FikaNoteInput, FikaNotePatch, FikaNoteReplyInput, FikaReplaceOptions, FikaSearchOptions, FikaSearchResult, FikaSearchResults, FikaSectionRange, FikaShapeFillInput, FikaShapePatch, FikaShapePreset, FikaSlideReference, FikaTableElementPatch, FikaSlideThemePatch, FikaRichTextElement, FikaRichTextParagraphAttrs, FikaRichTextStylePatch, FikaThemeExtractionOptions, FikaVideoPatch, FikaVideoPlaybackPatch, FikaVideoPositionPatch, FikaVideoSizePatch, FikaVideoSourcePatch } from './types';
import { assertColorFields, assertElementPatch, assertIndexInRange, assertPositiveNumber, fromApiInsertSlideIndex, fromApiSlideIndex, toApiSlideIndex } from './validators';
import { beginScreening, exitScreening } from '@/utils/screening';
type Stores = ReturnType<typeof createStores>;
type Handler = (payload: unknown, command: FikaAgentCommand) => unknown | Promise<unknown>;
type ElementOrderCommand = 'forward' | 'backward' | 'front' | 'back';
type MediaElement = PPTImageElement | PPTVideoElement | PPTAudioElement;
type MediaElementPatch = Partial<PPTImageElement> | Partial<PPTVideoElement> | Partial<PPTAudioElement>;
type JsonRecord = Record<string, unknown>;
const DOCUMENT_ELEMENT_TYPES = new Set(['text', 'image', 'shape', 'line', 'chart', 'table', 'latex', 'mermaid', 'code', 'video', 'audio']);
type OutlineElement = PPTTextElement | PPTImageElement | PPTShapeElement | PPTChartElement | PPTTableElement;
type ShadowElement = PPTTextElement | PPTImageElement | PPTShapeElement | PPTLineElement;
type FillElement = PPTTextElement | PPTShapeElement | PPTChartElement;
const OUTLINE_ELEMENT_TYPES = ['text', 'image', 'shape', 'chart', 'table'] as const;
const SHADOW_ELEMENT_TYPES = ['text', 'image', 'shape', 'line'] as const;
const FILL_ELEMENT_TYPES = ['text', 'shape', 'chart'] as const;
interface CommandDescriptor {
  type: FikaCommandType;
  handler: Handler;
  mutates: boolean;
}
interface RuntimeState {
  title: string;
  slides: Slide[];
  theme: SlideTheme;
  templates: SlideTemplate[];
  viewportSize: number;
  viewportRatio: number;
  slideIndex: number;
  activeElementIdList: string[];
  handleElementId: string;
  activeGroupElementId: string;
  hiddenElementIdList: string[];
  selectedSlidesIndex: number[];
  canvasScale: number;
  canvasPercentage: number;
  screening: boolean;
  snapshotCursor: number;
  snapshotLength: number;
}
interface RunCommandOptions {
  commit?: boolean;
  dryRun?: boolean;
  emitEvents?: boolean;
  emitDocumentChanged?: boolean;
  restoreOnSuccess?: boolean;
  version?: boolean;
}
interface AgenticRuntime {
  api: FikaAgentApi;
  stop(): void;
}
class AgenticCommandError extends Error {
  constructor(readonly code: string, message: string, readonly path?: string, readonly recoverable = true) {
    super(message);
    this.name = code;
  }
}
function issueFromError(error: unknown) {
  if (error instanceof AgenticCommandError) {
    return createIssue(error.code, error.message, error.path, error.recoverable);
  }
  return createIssue(error instanceof Error ? error.name || 'CommandError' : 'CommandError', error instanceof Error ? error.message : String(error));
}
function viewportFromStores(stores: Stores): FikaDeckViewport {
  return {
    size: stores.slides.viewportSize,
    ratio: stores.slides.viewportRatio
  };
}
function mergeDeckTheme(theme: SlideTheme, patch?: FikaSlideThemePatch): SlideTheme {
  return patch ? mergeTheme(theme, patch as Partial<SlideTheme>) : clonePlain(theme);
}
const DEFAULT_EXTRACTED_THEME_COLORS = 6;
function addThemeValue(target: Record<string, number>, value: string | undefined, weight: number) {
  const normalized = value?.trim();
  const lower = normalized?.toLowerCase();
  if (!normalized || lower === '#00000000' || lower === 'transparent') return;
  target[normalized] = (target[normalized] || 0) + Math.max(weight, 1);
}
function rankedThemeValues(values: Record<string, number>) {
  return Object.keys(values).sort((a, b) => values[b] - values[a]);
}
function elementArea(element: PPTElement): number {
  const width = Number.isFinite(element.width) ? element.width : 1;
  const height = 'height' in element && Number.isFinite(element.height) ? element.height : 1;
  return Math.max(width * height, 1);
}
function inlineStyleValues(content: string | undefined, property: 'color' | 'font-family'): string[] {
  if (!content) return [];
  const values: string[] = [];
  const pattern = new RegExp(`${property}\\s*:\\s*([^;"']+)`, 'gi');
  let match = pattern.exec(content);
  while (match) {
    values.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
    match = pattern.exec(content);
  }
  return values;
}
function stripThemeInlineStyles(content: string): string {
  return content.replace(/color:\s*[^;"']+;?/gi, '').replace(/font-family:\s*[^;"']+;?/gi, '');
}
function collectTextTheme(content: string | undefined, defaultColor: string | undefined, defaultFontName: string | undefined, area: number, fontColors: Record<string, number>, fontNames: Record<string, number>) {
  addThemeValue(fontColors, defaultColor, area);
  addThemeValue(fontNames, defaultFontName, area);
  for (const color of inlineStyleValues(content, 'color')) addThemeValue(fontColors, color, area);
  for (const fontName of inlineStyleValues(content, 'font-family')) addThemeValue(fontNames, fontName, area);
}
function collectElementTheme(element: PPTElement, themeColors: Record<string, number>, fontColors: Record<string, number>, fontNames: Record<string, number>) {
  const area = elementArea(element);
  if (element.type === 'shape') {
    addThemeValue(themeColors, element.fill, area);
    if (element.gradient) {
      for (const item of element.gradient.colors) addThemeValue(themeColors, item.color, area / Math.max(element.gradient.colors.length, 1));
    }
    collectTextTheme(element.text?.content, element.text?.defaultColor, element.text?.defaultFontName, area, fontColors, fontNames);
  } else if (element.type === 'text') {
    addThemeValue(themeColors, element.fill, area);
    collectTextTheme(element.content, element.defaultColor, element.defaultFontName, area, fontColors, fontNames);
  } else if (element.type === 'image') {
    addThemeValue(themeColors, element.colorMask, area);
  } else if (element.type === 'table') {
    addThemeValue(themeColors, element.theme?.color, area);
    for (const row of element.data) {
      for (const cell of row) {
        addThemeValue(themeColors, cell.style?.backcolor, area);
        addThemeValue(fontColors, cell.style?.color, area);
        addThemeValue(fontNames, cell.style?.fontname, area);
      }
    }
  } else if (element.type === 'chart') {
    addThemeValue(themeColors, element.fill, area);
    for (const color of element.themeColors) addThemeValue(themeColors, color, area / Math.max(element.themeColors.length, 1));
    addThemeValue(fontColors, element.textColor, area);
  } else if (element.type === 'line' || element.type === 'audio') {
    addThemeValue(themeColors, element.color, area);
  } else if (element.type === 'latex') {
    addThemeValue(fontColors, element.color, area);
  }
}
function extractThemeFromDeck(stores: Stores, options: FikaThemeExtractionOptions = {}): SlideTheme {
  const targetSlides = options.slideIds?.length ? options.slideIds.map(slideId => ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex).slide) : stores.slides.slides;
  const backgroundColors: Record<string, number> = {};
  const themeColors: Record<string, number> = {};
  const fontColors: Record<string, number> = {};
  const fontNames: Record<string, number> = {};
  for (const slide of targetSlides) {
    if (slide.background?.type === 'solid') addThemeValue(backgroundColors, slide.background.color, 1);else if (slide.background?.type === 'gradient' && slide.background.gradient) {
      for (const item of slide.background.gradient.colors) addThemeValue(backgroundColors, item.color, 1 / Math.max(slide.background.gradient.colors.length, 1));
    }
    for (const element of slide.elements) collectElementTheme(element, themeColors, fontColors, fontNames);
  }
  const maxThemeColors = Math.max(1, Math.trunc(options.maxThemeColors || DEFAULT_EXTRACTED_THEME_COLORS));
  const extractedTheme = clonePlain(stores.slides.theme);
  const [backgroundColor] = rankedThemeValues(backgroundColors);
  const colors = rankedThemeValues(themeColors).slice(0, maxThemeColors);
  const [fontColor] = rankedThemeValues(fontColors);
  const [fontName] = rankedThemeValues(fontNames);
  if (backgroundColor) extractedTheme.backgroundColor = backgroundColor;
  if (colors.length) extractedTheme.themeColors = colors;
  if (fontColor) extractedTheme.fontColor = fontColor;
  if (fontName) extractedTheme.fontName = fontName;
  return clonePlain(extractedTheme);
}
function hasOutline(element: PPTElement): element is OutlineElement {
  return (OUTLINE_ELEMENT_TYPES as readonly string[]).includes(element.type);
}
function hasShadow(element: PPTElement): element is ShadowElement {
  return (SHADOW_ELEMENT_TYPES as readonly string[]).includes(element.type);
}
function applyThemeToSlideContent(stores: Stores, theme: SlideTheme, options: FikaApplyThemeOptions = {}) {
  if (!options.applyToSlides) return;
  const slides = clonePlain(stores.slides.slides);
  for (const slide of slides) {
    if (!slide.background || slide.background.type !== 'image') {
      slide.background = {
        type: 'solid',
        color: theme.backgroundColor
      };
    }
    for (const element of slide.elements) {
      if (element.type === 'text') {
        element.defaultColor = theme.fontColor;
        element.defaultFontName = theme.fontName;
        element.content = stripThemeInlineStyles(element.content);
      } else if (element.type === 'shape' && element.text) {
        element.text.defaultColor = theme.fontColor;
        element.text.defaultFontName = theme.fontName;
        element.text.content = stripThemeInlineStyles(element.text.content);
      } else if (element.type === 'table') {
        for (const row of element.data) {
          for (const cell of row) {
            cell.style = {
              ...(cell.style || {}),
              color: theme.fontColor,
              fontname: theme.fontName
            };
          }
        }
      } else if (element.type === 'chart') {
        element.themeColors = clonePlain(theme.themeColors);
        element.textColor = resolveChartLabelColor(element, {
          background: slide.background,
          fallbackSurface: theme.backgroundColor,
          fontColor: theme.fontColor
        });
      } else if (element.type === 'latex') {
        element.color = theme.fontColor;
      }
      if (options.includeElementStyles && hasOutline(element) && element.outline) element.outline = clonePlain(theme.outline);
      if (options.includeElementStyles && hasShadow(element) && element.shadow) element.shadow = clonePlain(theme.shadow);
    }
  }
  stores.slides.setSlides(slides);
}
function applyViewport(stores: Stores, viewport?: Partial<FikaDeckViewport>) {
  if (!viewport) return;
  if (viewport.size !== undefined) stores.slides.setViewportSize(viewport.size);
  if (viewport.ratio !== undefined) stores.slides.setViewportRatio(viewport.ratio);
}
function documentFromStores(stores: Stores): FikaDeckDocument {
  return {
    title: stores.slides.title,
    slides: clonePlain(stores.slides.slides),
    theme: clonePlain(stores.slides.theme),
    viewport: viewportFromStores(stores),
    templates: clonePlain(stores.slides.templates)
  };
}
function restoreDocument(stores: Stores, document: FikaDeckInput, slideIndex = 0) {
  const nextDocument = clonePlain(document);
  stores.slides.setTitle(nextDocument.title);
  stores.slides.setSlides(clonePlain(nextDocument.slides), mergeDeckTheme(stores.slides.theme, nextDocument.theme));
  applyViewport(stores, inferViewportFromSlides(nextDocument.slides, nextDocument.viewport) ?? nextDocument.viewport);
  if (nextDocument.templates) stores.slides.setTemplates(clonePlain(nextDocument.templates));
  stores.slides.updateSlideIndex(clampIndex(slideIndex, stores.slides.slides.length));
  stores.main.setActiveElementIdList([]);
  stores.main.setActiveGroupElementId('');
}
function captureRuntimeState(stores: Stores): RuntimeState {
  return {
    title: stores.slides.title,
    slides: stores.slides.slides,
    theme: stores.slides.theme,
    templates: stores.slides.templates,
    viewportSize: stores.slides.viewportSize,
    viewportRatio: stores.slides.viewportRatio,
    slideIndex: stores.slides.slideIndex,
    activeElementIdList: [...stores.main.activeElementIdList],
    handleElementId: stores.main.handleElementId,
    activeGroupElementId: stores.main.activeGroupElementId,
    hiddenElementIdList: [...stores.main.hiddenElementIdList],
    selectedSlidesIndex: [...stores.main.selectedSlidesIndex],
    canvasScale: stores.main.canvasScale,
    canvasPercentage: stores.main.canvasPercentage,
    screening: stores.screen.screening,
    snapshotCursor: stores.snapshot.snapshotCursor,
    snapshotLength: stores.snapshot.snapshotLength
  };
}
function restoreRuntimeState(stores: Stores, state: RuntimeState) {
  stores.slides.setTitle(state.title);
  stores.slides.setSlides(state.slides, state.theme, { clone: false });
  stores.slides.setTemplates(state.templates);
  stores.slides.setViewportSize(state.viewportSize);
  stores.slides.setViewportRatio(state.viewportRatio);
  stores.slides.updateSlideIndex(state.slideIndex);
  stores.main.updateSelectedSlidesIndex([...state.selectedSlidesIndex]);
  stores.main.setActiveElementIdList([...state.activeElementIdList]);
  stores.main.setHandleElementId(state.handleElementId);
  stores.main.setActiveGroupElementId(state.activeGroupElementId);
  stores.main.setHiddenElementIdList([...state.hiddenElementIdList]);
  stores.main.setCanvasScale(state.canvasScale);
  stores.main.setCanvasPercentage(state.canvasPercentage);
  stores.screen.setScreening(state.screening);
  stores.snapshot.setSnapshotCursor(state.snapshotCursor);
  stores.snapshot.setSnapshotLength(state.snapshotLength);
}
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cloneJsonSafePayload<T = unknown>(payload: unknown, path: string): T {
  try {
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) throw new Error('Payload is not JSON-serializable');
    return JSON.parse(serialized) as T;
  } catch {
    throw new AgenticCommandError('InvalidDocument', 'Document payload must be JSON-serializable', path);
  }
}
function documentPayloadRoot(payload: unknown): {
  document: unknown;
  path: string;
} {
  if (isRecord(payload) && Object.prototype.hasOwnProperty.call(payload, 'document')) {
    return {
      document: payload.document,
      path: 'payload.document'
    };
  }
  return {
    document: payload,
    path: 'payload'
  };
}
function importApplyOptionsFromPayload(payload: unknown): ImportApplyOptions {
  if (!isRecord(payload)) return {};
  const options: ImportApplyOptions = {};
  if (payload.mode === 'append' || payload.mode === 'replace') options.mode = payload.mode;
  if (payload.cover === true || payload.cover === false) options.cover = payload.cover;
  if (payload.confirm === true || payload.confirm === false) options.confirm = payload.confirm;
  return options;
}
function requireDocumentRecord(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) throw new AgenticCommandError('InvalidDocument', 'Document payload must be an object', path);
  return value;
}
function optionalDocumentRecord(value: unknown, path: string): JsonRecord | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new AgenticCommandError('InvalidDocument', 'Expected an object', path);
  return value;
}
function optionalDocumentArray(value: unknown, path: string): unknown[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new AgenticCommandError('InvalidDocument', 'Expected an array', path);
  return value;
}
function normalizeDocumentElement(value: unknown, path: string): PPTElement {
  const element = requireDocumentRecord(value, path);
  if (element.id !== undefined && typeof element.id !== 'string') {
    throw new AgenticCommandError('InvalidDocument', 'Element id must be a string when provided', `${path}.id`);
  }
  if (typeof element.type !== 'string' || !DOCUMENT_ELEMENT_TYPES.has(element.type)) {
    throw new AgenticCommandError('InvalidDocument', 'Element type must be a supported string', `${path}.type`);
  }
  return normalizeElement(element as Partial<PPTElement> & {
    type: PPTElement['type'];
  });
}
function normalizeDocumentSlides(value: unknown, path: string): Slide[] {
  if (!Array.isArray(value)) throw new AgenticCommandError('InvalidDocument', 'Document slides must be an array', path);
  return value.map((slideValue, index) => {
    const slidePath = `${path}[${index}]`;
    const slide = requireDocumentRecord(slideValue, slidePath);
    if (slide.id !== undefined && typeof slide.id !== 'string') {
      throw new AgenticCommandError('InvalidDocument', 'Slide id must be a string when provided', `${slidePath}.id`);
    }
    if (slide.remark !== undefined && typeof slide.remark !== 'string') {
      throw new AgenticCommandError('InvalidDocument', 'Slide remark must be a string when provided', `${slidePath}.remark`);
    }
    optionalDocumentRecord(slide.background, `${slidePath}.background`);
    optionalDocumentRecord(slide.sectionTag, `${slidePath}.sectionTag`);
    optionalDocumentArray(slide.notes, `${slidePath}.notes`);
    optionalDocumentArray(slide.animations, `${slidePath}.animations`);
    const elements = (optionalDocumentArray(slide.elements, `${slidePath}.elements`) || []).map((element, elementIndex) => normalizeDocumentElement(element, `${slidePath}.elements[${elementIndex}]`));
    return normalizeSlide({
      ...slide,
      elements
    } as Partial<Slide>);
  });
}
function normalizeDocumentTheme(value: unknown, path: string): FikaSlideThemePatch | undefined {
  const theme = optionalDocumentRecord(value, path);
  return theme ? clonePlain(theme) as FikaSlideThemePatch : undefined;
}
function normalizeDocumentViewport(value: unknown, path: string): Partial<FikaDeckViewport> | undefined {
  const viewport = optionalDocumentRecord(value, path);
  if (!viewport) return undefined;
  const normalized: Partial<FikaDeckViewport> = {};
  if (viewport.size !== undefined) {
    if (typeof viewport.size !== 'number' || !Number.isFinite(viewport.size)) {
      throw new AgenticCommandError('InvalidDocument', 'Viewport size must be a finite number', `${path}.size`);
    }
    normalized.size = viewport.size;
  }
  if (viewport.ratio !== undefined) {
    if (typeof viewport.ratio !== 'number' || !Number.isFinite(viewport.ratio)) {
      throw new AgenticCommandError('InvalidDocument', 'Viewport ratio must be a finite number', `${path}.ratio`);
    }
    normalized.ratio = viewport.ratio;
  }
  return normalized;
}
function normalizeDocumentTemplates(value: unknown, path: string): SlideTemplate[] | undefined {
  const templates = optionalDocumentArray(value, path);
  if (!templates) return undefined;
  return templates.map((templateValue, index) => {
    const templatePath = `${path}[${index}]`;
    const template = requireDocumentRecord(templateValue, templatePath);
    if (typeof template.name !== 'string') throw new AgenticCommandError('InvalidDocument', 'Template name must be a string', `${templatePath}.name`);
    if (typeof template.id !== 'string') throw new AgenticCommandError('InvalidDocument', 'Template id must be a string', `${templatePath}.id`);
    if (typeof template.cover !== 'string') throw new AgenticCommandError('InvalidDocument', 'Template cover must be a string', `${templatePath}.cover`);
    let origin: string | undefined;
    if (template.origin !== undefined) {
      if (typeof template.origin !== 'string') {
        throw new AgenticCommandError('InvalidDocument', 'Template origin must be a string when provided', `${templatePath}.origin`);
      }
      origin = template.origin;
    }
    return {
      name: template.name,
      id: template.id,
      cover: template.cover,
      ...(origin ? { origin } : {}),
    };
  });
}
function documentFromPayload(payload: unknown, path = 'payload'): FikaDeckInput {
  const document = requireDocumentRecord(cloneJsonSafePayload(payload, path), path);
  if (typeof document.title !== 'string') {
    throw new AgenticCommandError('InvalidDocument', 'Document title must be a string', `${path}.title`);
  }
  const slides = normalizeDocumentSlides(document.slides, `${path}.slides`);
  const theme = normalizeDocumentTheme(document.theme, `${path}.theme`);
  const viewport = normalizeDocumentViewport(document.viewport, `${path}.viewport`);
  const templates = normalizeDocumentTemplates(document.templates, `${path}.templates`);
  return {
    title: document.title,
    slides,
    ...(theme ? {
      theme
    } : {}),
    ...(viewport ? {
      viewport
    } : {}),
    ...(templates ? {
      templates
    } : {})
  };
}
function documentPatchFromPayload(payload: unknown): FikaDeckPatch {
  const patch = requireDocumentRecord(cloneJsonSafePayload(payload, 'payload'), 'payload');
  const documentPatch: FikaDeckPatch = {};
  if (patch.title !== undefined) {
    if (typeof patch.title !== 'string') {
      throw new AgenticCommandError('InvalidDocument', 'Document title must be a string', 'payload.title');
    }
    documentPatch.title = patch.title;
  }
  if (patch.slides !== undefined) documentPatch.slides = normalizeDocumentSlides(patch.slides, 'payload.slides');
  if (patch.theme !== undefined) documentPatch.theme = normalizeDocumentTheme(patch.theme, 'payload.theme');
  if (patch.viewport !== undefined) documentPatch.viewport = normalizeDocumentViewport(patch.viewport, 'payload.viewport');
  if (patch.templates !== undefined) documentPatch.templates = normalizeDocumentTemplates(patch.templates, 'payload.templates');
  return documentPatch;
}
function importDocumentFromPayload(payload: unknown): FikaDeckInput {
  const root = documentPayloadRoot(payload);
  return documentFromPayload(root.document, root.path);
}
function getState(stores: Stores, documentVersion: number): FikaBridgeState {
  const currentSlide = stores.slides.slides[stores.slides.slideIndex];
  return {
    title: stores.slides.title,
    slideIndex: stores.slides.slides.length ? toApiSlideIndex(stores.slides.slideIndex) : 0,
    slideCount: stores.slides.slides.length,
    currentSlideId: currentSlide?.id,
    selectedSlideIndexes: stores.main.selectedSlidesIndex.map(toApiSlideIndex),
    selectedElementIds: [...stores.main.activeElementIdList],
    handleElementId: stores.main.handleElementId,
    activeGroupElementId: stores.main.activeGroupElementId,
    hiddenElementIds: [...stores.main.hiddenElementIdList],
    viewportSize: stores.slides.viewportSize,
    viewportRatio: stores.slides.viewportRatio,
    canvasScale: stores.main.canvasScale,
    canvasPercentage: stores.main.canvasPercentage,
    screening: stores.screen.screening,
    canUndo: stores.snapshot.canUndo,
    canRedo: stores.snapshot.canRedo,
    documentVersion
  };
}
function contrastTheme(stores: Stores) {
  return {
    backgroundColor: stores.slides.theme.backgroundColor,
    fontColor: stores.slides.theme.fontColor
  };
}
function updateSlideAt(stores: Stores, slideIndex: number, patch: Partial<Slide>): Slide {
  const slide = stores.slides.slides[slideIndex];
  if (!slide) throw new Error(`Slide index not found: ${slideIndex}`);
  assertColorFields(patch, 'slide');
  stores.slides.updateSlide(clonePlain(patch), slide.id);
  return clonePlain(stores.slides.slides[slideIndex]);
}
function updateElementAt(stores: Stores, slideIndex: number, elementIndex: number, patch: Partial<PPTElement>): PPTElement {
  const slide = stores.slides.slides[slideIndex];
  const element = slide?.elements[elementIndex];
  if (!slide || !element) throw new Error('Element location is invalid');
  assertElementPatch(patch, element);
  stores.slides.updateElement({
    id: element.id,
    props: clonePatch(patch),
    slideId: slide.id
  });
  return clonePlain(stores.slides.slides[slideIndex].elements[elementIndex]);
}
type ImageFilterKey = keyof NonNullable<PPTImageElement['filters']>;
const fullImageRange: NonNullable<PPTImageElement['clip']>['range'] = [[0, 0], [100, 100]];
function imageElement(stores: Stores, elementId: string, slideId?: string) {
  const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
  if (found.element.type !== 'image') throw new Error(`Element is not an image: ${elementId}`);
  return found as typeof found & {
    element: PPTImageElement;
  };
}
function updateImageElementAt(stores: Stores, slideIndex: number, elementIndex: number, patch: Partial<PPTImageElement>, removeProps: Array<keyof PPTImageElement> = []): PPTImageElement {
  const slide = stores.slides.slides[slideIndex];
  const element = slide?.elements[elementIndex];
  if (!slide || !element || element.type !== 'image') throw new Error('Image element location is invalid');
  const nextElement = {
    ...element,
    ...clonePatch(patch),
    type: 'image'
  } as PPTImageElement;
  for (const prop of removeProps) delete (nextElement as Partial<PPTImageElement>)[prop];
  const elements = slide.elements.slice();
  elements[elementIndex] = nextElement;
  stores.slides.updateSlide({ elements }, slide.id);
  return clonePlain(nextElement);
}
function imageFilterValue(key: ImageFilterKey, value: string | number) {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) throw new Error(`Image filter ${String(key)} must be finite`);
  if (key === 'blur') return `${value}px`;
  if (key === 'hue-rotate') return `${value}deg`;
  const percent = key === 'opacity' && value >= 0 && value <= 1 ? value * 100 : value;
  return `${percent}%`;
}
function replaceElementAt(stores: Stores, slideIndex: number, elementIndex: number, element: PPTElement): PPTElement {
  const slide = stores.slides.slides[slideIndex];
  if (!slide || !slide.elements[elementIndex]) throw new Error('Element location is invalid');
  const elements = slide.elements.slice();
  elements[elementIndex] = clonePlain(element);
  stores.slides.updateSlide({ elements }, slide.id);
  return clonePlain(elements[elementIndex]);
}
function updateElementsWithPatch(stores: Stores, payload: {
  elementId: string | string[];
  slideId?: string;
}, getPatch: (element: PPTElement) => Partial<PPTElement>): PPTElement[] {
  const ids = toIdList(payload.elementId);
  const updated: PPTElement[] = [];
  for (const id of ids) {
    const found = findElement(stores.slides.slides, id, payload.slideId, stores.slides.slideIndex);
    updated.push(updateElementAt(stores, found.slideIndex, found.elementIndex, getPatch(found.element)));
  }
  return updated;
}
function updateStyleElement<TElement extends PPTElement>(stores: Stores, elementId: string, slideId: string | undefined, allowedTypes: readonly PPTElement['type'][], styleName: string, patch: Partial<PPTElement>): TElement {
  const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
  if (!allowedTypes.includes(found.element.type)) {
    throw new Error(`${styleName} is not supported for ${found.element.type} element: ${elementId}`);
  }
  return updateElementAt(stores, found.slideIndex, found.elementIndex, patch) as TElement;
}
function getElementTransformPatch(element: PPTElement, transform: FikaElementTransformPatch): Partial<PPTElement> {
  const patch: FikaElementTransformPatch = {};
  if (transform.left !== undefined) patch.left = transform.left;
  if (transform.top !== undefined) patch.top = transform.top;
  if (transform.width !== undefined) patch.width = transform.width;
  if (transform.height !== undefined) {
    if (!('height' in element)) throw new Error(`Element does not support height: ${element.id}`);
    patch.height = transform.height;
  }
  if (transform.rotate !== undefined) {
    if (!('rotate' in element)) throw new Error(`Element does not support rotate: ${element.id}`);
    patch.rotate = transform.rotate;
  }
  if (transform.opacity !== undefined) {
    if (element.type !== 'text' && element.type !== 'shape') throw new Error(`Element does not support opacity: ${element.id}`);
    patch.opacity = transform.opacity;
  }
  if (transform.flipH !== undefined || transform.flipV !== undefined) {
    if (element.type !== 'image' && element.type !== 'shape') throw new Error(`Element does not support flip: ${element.id}`);
    if (transform.flipH !== undefined) patch.flipH = transform.flipH;
    if (transform.flipV !== undefined) patch.flipV = transform.flipV;
  }
  return patch as Partial<PPTElement>;
}
function getElementMovePatch(element: PPTElement, position: FikaElementMoveInput): Partial<PPTElement> {
  const patch: FikaElementTransformPatch = {};
  if (position.left !== undefined) patch.left = position.left;else if (position.dx !== undefined) patch.left = element.left + position.dx;
  if (position.top !== undefined) patch.top = position.top;else if (position.dy !== undefined) patch.top = element.top + position.dy;
  return patch as Partial<PPTElement>;
}
function getElementResizePatch(element: PPTElement, size: FikaElementResizeInput): Partial<PPTElement> {
  const patch: FikaElementTransformPatch = {};
  if (size.width !== undefined) patch.width = size.width;else if (size.dw !== undefined) patch.width = element.width + size.dw;
  if (size.height !== undefined) {
    if (!('height' in element)) throw new Error(`Element does not support height: ${element.id}`);
    patch.height = size.height;
  } else if (size.dh !== undefined) {
    if (!('height' in element)) throw new Error(`Element does not support height: ${element.id}`);
    patch.height = element.height + size.dh;
  }
  return patch as Partial<PPTElement>;
}
function setSelection(stores: Stores, elementIds: string[], handleElementId = '', activeGroupElementId = '') {
  stores.main.setActiveElementIdList(elementIds);
  if (handleElementId) stores.main.setHandleElementId(handleElementId);
  stores.main.setActiveGroupElementId(activeGroupElementId);
}
function selectElements(stores: Stores, payload: {
  elementId: string | string[];
  slideId?: string;
}) {
  const ids = toIdList(payload.elementId);
  for (const id of ids) findElement(stores.slides.slides, id, payload.slideId, stores.slides.slideIndex);
  setSelection(stores, ids, ids[0] || '');
}
function selectElementGroup(stores: Stores, payload: {
  groupIdOrElementId: string;
  slideId?: string;
}) {
  const {
    slide
  } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
  const seed = slide.elements.find(element => element.id === payload.groupIdOrElementId);
  const groupId = seed?.groupId || payload.groupIdOrElementId;
  const members = slide.elements.filter(element => element.groupId === groupId);
  if (!members.length) throw new Error(`Element group not found: ${payload.groupIdOrElementId}`);
  const handleElementId = seed?.id || members[0].id;
  setSelection(stores, members.map(element => element.id), handleElementId, handleElementId);
}
function reorderElementList(stores: Stores, payload: {
  elementId: string;
  slideId?: string;
  toIndex: number;
}): PPTElement[] {
  const found = findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex);
  const elements = clonePlain(found.slide.elements);
  const [element] = elements.splice(found.elementIndex, 1);
  if (!element) throw new Error(`Element not found: ${payload.elementId}`);
  elements.splice(insertIndex(payload.toIndex, elements.length), 0, element);
  updateSlideAt(stores, found.slideIndex, {
    elements
  });
  return elements;
}
function orderElementLayer(stores: Stores, payload: {
  elementId: string;
  slideId?: string;
}, order: ElementOrderCommand): PPTElement[] {
  const found = findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex);
  const maxIndex = found.slide.elements.length - 1;
  const toIndex = order === 'front' ? maxIndex : order === 'back' ? 0 : order === 'forward' ? Math.min(found.elementIndex + 1, maxIndex) : Math.max(found.elementIndex - 1, 0);
  return reorderElementList(stores, {
    ...payload,
    toIndex
  });
}
function cloneSlideBackground(background?: SlideBackground): SlideBackground | undefined {
  if (!background) return undefined;
  assertColorFields(background, 'background');
  return clonePlain(background);
}
function resolveBackgroundTargetIds(payload: {
  slideIds?: string[];
  slideId?: string | string[];
}): Set<string> | null {
  if (payload.slideIds?.length) return new Set(payload.slideIds);
  if (payload.slideId === undefined) return null;
  const ids = toIdList(payload.slideId);
  return ids.length ? new Set(ids) : null;
}
const SHAPE_CATEGORY_ALIASES: Record<string, FikaShapePreset['categoryKey']> = {
  rect: 'rectangle',
  rectangle: 'rectangle'
};
function listShapePresets(categoryKey?: string): FikaShapePreset[] {
  const resolved = categoryKey ? SHAPE_CATEGORY_ALIASES[categoryKey] ?? categoryKey : undefined;
  return SHAPE_LIST.filter(category => !resolved || category.categoryKey === resolved).flatMap(category => category.children.map((preset, index) => ({
    ...clonePlain(preset),
    id: `${category.categoryKey}.${index}`,
    categoryKey: category.categoryKey,
    index
  })));
}
function resolveShapePreset(input: FikaCreateShapeInput = {}): ShapePoolItem | undefined {
  if (input.preset) return clonePlain(input.preset);
  if (input.presetId) {
    const dotIndex = input.presetId.lastIndexOf('.');
    if (dotIndex === -1) throw new Error(`Invalid shape preset ID: ${input.presetId}`);
    const categoryKey = input.presetId.slice(0, dotIndex) as FikaShapePreset['categoryKey'];
    const presetIndex = Number(input.presetId.slice(dotIndex + 1));
    if (!Number.isInteger(presetIndex)) throw new Error(`Invalid shape preset ID: ${input.presetId}`);
    const preset = SHAPE_LIST.find(category => category.categoryKey === categoryKey)?.children[presetIndex];
    if (!preset) throw new Error(`Shape preset not found: ${input.presetId}`);
    return clonePlain(preset);
  }
  if (input.categoryKey) {
    const presetIndex = input.presetIndex ?? 0;
    const preset = SHAPE_LIST.find(category => category.categoryKey === input.categoryKey)?.children[presetIndex];
    if (!preset) throw new Error(`Shape preset not found: ${input.categoryKey}.${presetIndex}`);
    return clonePlain(preset);
  }
  return undefined;
}
function normalizeShapeText(theme: SlideTheme, ...patches: Array<Partial<ShapeText> | undefined>): PPTShapeElement['text'] | undefined {
  const text = Object.assign({}, ...patches.filter(Boolean)) as Partial<ShapeText>;
  if (!Object.keys(text).length) return undefined;
  return {
    content: text.content ?? '',
    defaultFontName: text.defaultFontName ?? theme.fontName,
    defaultColor: text.defaultColor ?? theme.fontColor,
    align: text.align ?? 'top',
    ...text
  };
}
function normalizeShapeFillPatch(fill: FikaShapeFillInput): FikaShapePatch {
  if (typeof fill === 'string') return {
    fill,
    gradient: undefined,
    pattern: undefined
  };
  if (fill.fill !== undefined && !('gradient' in fill) && !('pattern' in fill)) {
    return {
      ...fill,
      gradient: undefined,
      pattern: undefined
    };
  }
  return clonePatch(fill);
}
function listAnimations(stores: Stores, slideId?: string, elementId?: string): PPTAnimation[] {
  const {
    slide
  } = ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex);
  const animations = slide.animations || [];
  return clonePlain(elementId ? animations.filter(animation => animation.elId === elementId) : animations);
}
const ANIMATION_TRIGGERS: PPTAnimation['trigger'][] = ['click', 'meantime', 'auto'];
function normalizeAnimationPatch(patch: Partial<PPTAnimation>): Partial<PPTAnimation> {
  const nextPatch = clonePlain(patch);
  if (nextPatch.trigger !== undefined && !ANIMATION_TRIGGERS.includes(nextPatch.trigger)) {
    throw new Error(`Invalid animation trigger: ${String(nextPatch.trigger)}`);
  }
  if (nextPatch.duration !== undefined && (typeof nextPatch.duration !== 'number' || !Number.isFinite(nextPatch.duration) || nextPatch.duration < 0)) {
    throw new Error('Animation duration must be a non-negative finite number');
  }
  return nextPatch;
}
function updateAnimationAt(stores: Stores, slideId: string, animationId: string, patch: Partial<PPTAnimation>): PPTAnimation {
  const {
    slide,
    index
  } = ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex);
  const animations = clonePlain(slide.animations || []);
  const animationIndex = animations.findIndex(animation => animation.id === animationId);
  if (animationIndex === -1) throw new Error(`Animation not found: ${animationId}`);
  const animation = normalizeAnimation({
    ...animations[animationIndex],
    ...normalizeAnimationPatch(omitUndefined(patch))
  });
  ensureElementOnSlide(slide, animation.elId);
  animations[animationIndex] = animation;
  updateSlideAt(stores, index, {
    animations
  });
  return clonePlain(animation);
}
function sequenceAnimations(stores: Stores, slideId?: string): FikaAnimationSequenceStep[] {
  const animations = listAnimations(stores, slideId);
  const sequence: FikaAnimationSequenceStep[] = [];
  for (const animation of animations) {
    const animationItem = clonePlain(animation);
    if (animationItem.trigger === 'click' || !sequence.length) {
      sequence.push({
        index: sequence.length,
        animations: [animationItem],
        autoNext: false
      });
    } else if (animationItem.trigger === 'meantime') {
      const last = sequence[sequence.length - 1];
      last.animations = last.animations.filter(item => item.elId !== animationItem.elId);
      last.animations.push(animationItem);
    } else if (animationItem.trigger === 'auto') {
      const last = sequence[sequence.length - 1];
      last.autoNext = true;
      sequence.push({
        index: sequence.length,
        animations: [animationItem],
        autoNext: false
      });
    }
  }
  return sequence;
}
function omitUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
function animationCatalog(): FikaAnimationCatalog {
  return clonePlain({
    enter: getEnterAnimations(),
    exit: getExitAnimations(),
    attention: getAttentionAnimations(),
    slide: getSlideAnimations()
  });
}
const TURNING_MODES = SLIDE_ANIMATIONS.map(item => item.value);
function isTurningMode(value: unknown): value is TurningMode {
  return typeof value === 'string' && TURNING_MODES.includes(value as TurningMode);
}
function normalizeTurningMode(value: unknown): TurningMode | undefined {
  if (value === undefined) return undefined;
  if (isTurningMode(value)) return value;
  throw new Error(`Invalid turningMode: ${String(value)}`);
}
function searchPattern(query: string, options: FikaSearchOptions = {}) {
  if (!query) throw new Error('Search query is required');
  const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(source, options.caseSensitive ? 'g' : 'gi');
}
function findTextMatches(text: string, pattern: RegExp, baseResult: Omit<FikaSearchResult, 'match' | 'start' | 'end'>) {
  const matches: FikaSearchResult[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    matches.push({
      ...baseResult,
      match: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
    if (match.index === pattern.lastIndex) pattern.lastIndex++;
    match = pattern.exec(text);
  }
  pattern.lastIndex = 0;
  return matches;
}
function sectionRangeFromStart(slides: Slide[], startIndex: number): FikaSectionRange {
  const slide = slides[startIndex];
  if (!slide?.sectionTag) throw new Error(`Section start not found at slide index: ${startIndex}`);
  const nextSectionIndex = slides.findIndex((item, index) => index > startIndex && !!item.sectionTag);
  const endIndex = nextSectionIndex === -1 ? slides.length - 1 : nextSectionIndex - 1;
  return {
    slideId: slide.id,
    index: startIndex,
    section: clonePlain(slide.sectionTag),
    startIndex,
    endIndex,
    slideIds: slides.slice(startIndex, endIndex + 1).map(item => item.id)
  };
}
function listSectionRanges(slides: Slide[]): FikaSectionRange[] {
  return slides.flatMap((slide, index) => slide.sectionTag ? [sectionRangeFromStart(slides, index)] : []);
}
function findSectionRange(slides: Slide[], sectionIdOrSlideId: string): FikaSectionRange {
  const range = listSectionRanges(slides).find(item => item.section.id === sectionIdOrSlideId || item.slideId === sectionIdOrSlideId);
  if (!range) throw new Error(`Section not found: ${sectionIdOrSlideId}`);
  return range;
}
function tableColumnCount(table: Pick<PPTTableElement, 'colWidths' | 'data'>): number {
  return Math.max(table.colWidths.length, ...table.data.map(row => row.length), 0);
}
function normalizeColWidths(colWidths: number[], columnCount: number): number[] {
  if (columnCount <= 0) return [];
  const widths = colWidths.slice(0, columnCount).map(width => Number.isFinite(width) && width > 0 ? width : 0);
  while (widths.length < columnCount) widths.push(1);
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return Array.from({
    length: columnCount
  }, () => 1 / columnCount);
  return widths.map(width => width / total);
}
function normalizeTableData(data: TableCell[][], columnCount: number): TableCell[][] {
  return data.map(row => {
    const nextRow = [...row];
    while (nextRow.length < columnCount) nextRow.push(createTableCell());
    if (nextRow.length > columnCount) nextRow.length = columnCount;
    return nextRow;
  });
}
function normalizeTableShape(table: PPTTableElement, data: TableCell[][], colWidths = table.colWidths) {
  const columnCount = Math.max(colWidths.length, ...data.map(row => row.length), 0);
  return {
    data: normalizeTableData(data, columnCount),
    colWidths: normalizeColWidths(colWidths, columnCount)
  };
}
function finiteSpan(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1;
}
function findMergedCellOrigin(data: TableCell[][], row: number, col: number) {
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    for (let colIndex = 0; colIndex < data[rowIndex].length; colIndex++) {
      const cell = data[rowIndex][colIndex];
      const rowspan = finiteSpan(cell.rowspan);
      const colspan = finiteSpan(cell.colspan);
      if (rowIndex <= row && row < rowIndex + rowspan && colIndex <= col && col < colIndex + colspan) {
        return {
          row: rowIndex,
          col: colIndex,
          cell
        };
      }
    }
  }
  return null;
}
function applyParagraphAttrs(content: string, attrs: FikaRichTextParagraphAttrs): string {
  if (typeof document === 'undefined') throw new Error('Paragraph attrs require a DOM environment');
  const template = document.createElement('template');
  template.innerHTML = content;
  const paragraphs = Array.from(template.content.querySelectorAll('p'));
  if (!paragraphs.length) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = content;
    template.innerHTML = '';
    template.content.appendChild(paragraph);
    paragraphs.push(paragraph);
  }
  for (const paragraph of paragraphs) {
    if (attrs.align !== undefined) {
      paragraph.removeAttribute('align');
      if (attrs.align) paragraph.style.textAlign = attrs.align;else paragraph.style.removeProperty('text-align');
    }
    if (attrs.indent !== undefined) {
      const indent = Math.max(0, Math.trunc(attrs.indent));
      if (indent) paragraph.setAttribute('data-indent', String(indent));else paragraph.removeAttribute('data-indent');
    }
    if (attrs.textIndent !== undefined) {
      const textIndent = Math.max(0, Math.trunc(attrs.textIndent));
      if (textIndent) paragraph.style.textIndent = `${textIndent}em`;else paragraph.style.removeProperty('text-indent');
    }
    if (!paragraph.getAttribute('style')) paragraph.removeAttribute('style');
  }
  return template.innerHTML;
}
function replaceTextMatches(text: string, pattern: RegExp, replacement: string, options: FikaReplaceOptions | undefined, baseResult: Omit<FikaSearchResult, 'match' | 'start' | 'end'>, hasReplaced: (localCount: number) => boolean) {
  const results: FikaSearchResult[] = [];
  pattern.lastIndex = 0;
  const nextText = text.replace(pattern, (match, ...args) => {
    const maybeGroups = args[args.length - 1];
    const start = (maybeGroups && typeof maybeGroups === 'object' ? args[args.length - 3] : args[args.length - 2]) as number;
    if (!options?.replaceAll && hasReplaced(results.length)) return match;
    results.push({
      ...baseResult,
      match,
      start,
      end: start + match.length
    });
    return replacement;
  });
  pattern.lastIndex = 0;
  return {
    text: nextText,
    results
  };
}
function findNote(notes: Note[], noteId: string): {
  note: Note;
  noteIndex: number;
} {
  const noteIndex = notes.findIndex(note => note.id === noteId);
  if (noteIndex === -1) throw new Error(`Note not found: ${noteId}`);
  return {
    note: notes[noteIndex],
    noteIndex
  };
}
function findReply(replies: NoteReply[], replyId: string): {
  reply: NoteReply;
  replyIndex: number;
} {
  const replyIndex = replies.findIndex(reply => reply.id === replyId);
  if (replyIndex === -1) throw new Error(`Note reply not found: ${replyId}`);
  return {
    reply: replies[replyIndex],
    replyIndex
  };
}
type SlideReference = string | number;
type SlideSelectorPayload = {
  slideId?: string;
  index?: number;
  slideIdOrIndex?: SlideReference;
};
function slideReferenceFromPayload(payload?: SlideReference | SlideSelectorPayload): SlideReference | undefined {
  if (payload === undefined || payload === null) return undefined;
  if (typeof payload === 'string' || typeof payload === 'number') return payload;
  return payload.slideIdOrIndex ?? payload.slideId ?? payload.index;
}
function resolveSlideIndex(stores: Stores, payload?: SlideReference | SlideSelectorPayload): number {
  const slides = stores.slides.slides;
  const path = payload && typeof payload === 'object' ? payload.slideIdOrIndex !== undefined ? 'slideIdOrIndex' : payload.slideId !== undefined ? 'slideId' : payload.index !== undefined ? 'index' : 'slideIdOrIndex' : 'slideIdOrIndex';
  if (!slides.length) throw new AgenticCommandError('SlideUnavailable', 'No slide is available', path);
  const slideReference = slideReferenceFromPayload(payload);
  if (slideReference === undefined) return clampIndex(stores.slides.slideIndex, slides.length);
  if (typeof slideReference === 'number') return fromApiSlideIndex(slideReference, slides.length, path);
  if (!slideReference) throw new AgenticCommandError('InvalidSlideId', 'Slide ID is required', path);
  const index = slides.findIndex(slide => slide.id === slideReference);
  if (index < 0) throw new AgenticCommandError('SlideNotFound', `Slide not found: ${slideReference}`, path);
  return index;
}
function readSlide(stores: Stores, payload?: SlideReference | SlideSelectorPayload): {
  slide: Slide;
  index: number;
} | null {
  if (!stores.slides.slides.length) return null;
  const index = resolveSlideIndex(stores, payload);
  return {
    slide: stores.slides.slides[index],
    index
  };
}
function normalizeSlideForInsert(slide?: Partial<Slide>): Slide {
  const cloned = clonePlain(slide || {});
  return normalizeSlide({
    ...cloned,
    elements: (cloned.elements || []).map(element => normalizeElement(element))
  });
}
function normalizeSlidePatch(patch: Partial<Slide>): Partial<Slide> {
  const cloned = clonePlain(patch);
  if (cloned.elements) cloned.elements = cloned.elements.map(element => normalizeElement(element));
  return cloned;
}

/** Strip tags/entities so empty text boxes (`<div></div>`, `&nbsp;`) read as ''. */
function stripSlideText(html: string | undefined): string {
  if (!html) return '';
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A slide is a "pristine starter" when the author has put nothing on it: either
 * it has no elements, or only EMPTY text/placeholder boxes. Fika's default
 * deck opens with exactly one such cover slide (visually blank). The first
 * `slides.createFromLayout` REPLACES that starter instead of appending after
 * it, so a freshly built deck never carries a leading blank and the agent never
 * needs to manually delete slide 0.
 */
function isPristineStarterSlide(slide: Slide | undefined | null): boolean {
  const elements = slide?.elements ?? [];
  if (elements.length === 0) return true;
  return elements.every(element => element.type === 'text' && stripSlideText(element.content) === '');
}
function ensureSlideIdAvailable(slides: Slide[], slideId: string, currentSlideId?: string) {
  if (slideId === currentSlideId) return;
  if (slides.some(slide => slide.id === slideId)) {
    throw new AgenticCommandError('DuplicateSlideId', `Slide ID already exists: ${slideId}`, 'slide.id');
  }
}
function toUniqueSlideIds(slideId: string | string[]): string[] {
  const ids = toIdList(slideId);
  if (!ids.length) throw new AgenticCommandError('InvalidSlideId', 'At least one slide ID is required', 'slideId');
  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (!id) throw new AgenticCommandError('InvalidSlideId', 'Slide ID is required', `slideId[${index}]`);
    if (!seen.has(id)) {
      seen.add(id);
      uniqueIds.push(id);
    }
  });
  return uniqueIds;
}
function duplicateSlideData(slide: Slide): Slide {
  return cloneSlidesWithRemappedIds([slide], {
    preserveExternalSlideLinks: true
  }).slides[0];
}
function applySlideSelection(stores: Stores, storeIndex: number) {
  const index = clampIndex(storeIndex, stores.slides.slides.length);
  stores.slides.updateSlideIndex(index);
  stores.main.updateSelectedSlidesIndex(stores.slides.slides.length ? [index] : []);
  stores.main.setActiveElementIdList([]);
}
function selectSlide(stores: Stores, slideIdOrIndex: FikaSlideReference | SlideSelectorPayload | undefined) {
  applySlideSelection(stores, resolveSlideIndex(stores, slideIdOrIndex));
}
export function createAgenticApi(options: {
  setLocale?: (locale: Parameters<typeof applyLocale>[0]) => Promise<void>;
  unmount?: () => void;
} = {}): AgenticRuntime {
  const stores = createStores();
  const listeners = new Set<FikaBridgeListener>();
  const stopHandles: Array<() => void> = [];
  let destroyed = false;
  let documentVersion = 0;
  let snapshotId = 0;
  let currentWarnings: FikaCommandIssue[] | null = null;
  let lastAnchor: CompositionAnchor | undefined;
  /** Per-deck-index planned anchors; kept in sync with insert/delete/move/duplicate. */
  let plannedAnchors: Array<CompositionAnchor | undefined> | undefined;
  let compositionSession: {
    styleId: string;
    slideCount: number;
    plan: ReturnType<typeof sequenceComposition>;
  } | undefined;
  const syncPlanOnInsert = (index: number, count = 1) => {
    if (count <= 0) return;
    if (plannedAnchors) {
      const pad = Array.from({
        length: count
      }, () => undefined as CompositionAnchor | undefined);
      plannedAnchors.splice(index, 0, ...pad);
    }
    if (compositionSession && compositionSession.plan.loudIndex >= index) {
      compositionSession = {
        ...compositionSession,
        plan: {
          ...compositionSession.plan,
          loudIndex: compositionSession.plan.loudIndex + count
        }
      };
    }
  };
  const syncPlanOnDeleteIndexes = (indexes: number[]) => {
    if (!indexes.length) return;
    const descending = [...indexes].sort((a, b) => b - a);
    if (plannedAnchors) {
      for (const i of descending) {
        if (i >= 0 && i < plannedAnchors.length) plannedAnchors.splice(i, 1);
      }
    }
    if (compositionSession) {
      let loud = compositionSession.plan.loudIndex;
      for (const i of [...indexes].sort((a, b) => a - b)) {
        if (loud === i) loud = -1;else if (loud > i) loud -= 1;
      }
      compositionSession = {
        ...compositionSession,
        plan: {
          ...compositionSession.plan,
          loudIndex: loud
        }
      };
    }
  };
  const syncPlanOnMove = (fromIndex: number, toIndex: number) => {
    if (plannedAnchors && fromIndex >= 0 && fromIndex < plannedAnchors.length) {
      const [entry] = plannedAnchors.splice(fromIndex, 1);
      const clamped = Math.max(0, Math.min(toIndex, plannedAnchors.length));
      plannedAnchors.splice(clamped, 0, entry);
    }
    if (compositionSession) {
      let loud = compositionSession.plan.loudIndex;
      if (loud === fromIndex) loud = toIndex;else if (loud >= 0) {
        if (loud > fromIndex) loud -= 1;
        if (loud >= toIndex) loud += 1;
      }
      compositionSession = {
        ...compositionSession,
        plan: {
          ...compositionSession.plan,
          loudIndex: loud
        }
      };
    }
  };
  const emit = (event: Omit<FikaBridgeEvent, 'documentVersion'>) => {
    if (destroyed && event.type !== 'destroyed') return;
    const fullEvent: FikaBridgeEvent = {
      ...event,
      documentVersion
    };
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener(fullEvent);
    }
  };
  const commitSnapshot = async (command: FikaAgentCommand) => {
    await stores.snapshot.addSnapshot();
    snapshotId++;
    return snapshotId;
  };
  const emitDocumentChanged = (command: FikaAgentCommand) => {
    if (!listeners.size) return;
    emit({
      type: 'documentChanged',
      command,
      data: documentFromStores(stores)
    });
  };
  const makeResult = <TData,>(command: FikaAgentCommand, changed: boolean, data?: TData, ok = true, warnings?: FikaCommandIssue[]): FikaCommandResult<TData> => {
    const result: FikaCommandResult<TData> = {
      ok,
      commandId: command.id,
      type: command.type,
      changed,
      documentVersion,
      data
    };
    if (warnings?.length) result.warnings = warnings;
    return result;
  };
  const syncDataDocumentVersion = <TData,>(data: TData): TData => {
    if (data && typeof data === 'object' && 'documentVersion' in data) {
      ;
      (data as {
        documentVersion: number;
      }).documentVersion = documentVersion;
    }
    return data;
  };
  const failResult = (command: FikaAgentCommand, error: unknown): FikaCommandResult => ({
    ok: false,
    commandId: command.id,
    type: command.type,
    changed: false,
    documentVersion,
    errors: [issueFromError(error)]
  });
  const skippedResult = (command: FikaAgentCommand): FikaCommandResult => ({
    ok: false,
    commandId: command.id,
    type: command.type,
    changed: false,
    documentVersion,
    errors: [createIssue('BatchSkipped', 'Skipped because an earlier command failed in an atomic batch.', undefined, true)]
  });
  const addWarning = (issue: FikaCommandIssue) => {
    currentWarnings?.push(issue);
  };

  const HTML_TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?>/;
  const containsHtmlTag = (value: unknown): boolean => typeof value === 'string' && HTML_TAG_RE.test(value);
  const warnLiteralHtml = (value: unknown, path: string) => {
    if (containsHtmlTag(value)) {
      addWarning(createIssue('LiteralHtmlInMarkdown', 'This Markdown/plain-text input contains HTML tags. Raw HTML is escaped here and will appear as literal text on the slide. Use Markdown (or plain text) for content; only the `content` / text.setContent path renders literal HTML (e.g. when intentionally showing a code snippet).', path, true));
    }
  };
  const warnLiteralHtmlInSlots = (slots: Record<string, unknown> | undefined) => {
    if (!slots) return;
    const visit = (value: unknown, path: string): boolean => {
      if (containsHtmlTag(value)) {
        warnLiteralHtml(value, path);
        return true;
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (visit(value[i], `${path}[${i}]`)) return true;
        }
      } else if (value && typeof value === 'object') {
        for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
          if (visit(childValue, `${path}.${childKey}`)) return true;
        }
      }
      return false;
    };
    for (const [key, value] of Object.entries(slots)) {
      if (visit(value, `payload.slots.${key}`)) return;
    }
  };
  const markRolledBack = (result: FikaCommandResult): FikaCommandResult => ({
    ...result,
    changed: false,
    snapshotId: undefined,
    warnings: [...(result.warnings || []), createIssue('BatchRolledBack', 'Rolled back because a command failed in an atomic batch.', undefined, true)]
  });
  const withMutation = async <TData,>(command: FikaAgentCommand, handler: () => TData | Promise<TData>, changed: boolean | ((data: TData) => boolean) = true, runOptions: RunCommandOptions = {}): Promise<FikaCommandResult<TData>> => {
    if (destroyed) return failResult(command, new Error('Fika controller has been destroyed')) as FikaCommandResult<TData>;
    const before = captureRuntimeState(stores);
    const beforeLastAnchor = lastAnchor;
    const beforeVersion = documentVersion;
    const warnings: FikaCommandIssue[] = [];
    const previousWarnings = currentWarnings;
    const dryRun = runOptions.dryRun ?? command.meta?.dryRun === true;
    currentWarnings = warnings;
    try {
      const data = await handler();
      if (destroyed) {
        restoreRuntimeState(stores, before);
        documentVersion = beforeVersion;
        lastAnchor = beforeLastAnchor;
        return failResult(command, new Error('Fika controller has been destroyed')) as FikaCommandResult<TData>;
      }
      const didChange = typeof changed === 'function' ? changed(data) : changed;
      if (didChange && (runOptions.restoreOnSuccess ?? dryRun)) {
        restoreRuntimeState(stores, before);
        lastAnchor = beforeLastAnchor;
      }
      const blocking = warnings.find(w => w.recoverable === false && w.code === 'SlideQualityError');
      if (blocking && didChange && !dryRun) {
        restoreRuntimeState(stores, before);
        documentVersion = beforeVersion;
        lastAnchor = beforeLastAnchor;
        const result = makeResult(command, false, syncDataDocumentVersion(data), false, warnings);
        result.errors = [blocking];
        if (runOptions.emitEvents !== false) emit({ type: 'commandFailed',
          command,
          result
        });
        return result;
      }
      let nextSnapshotId: number | undefined;
      if (didChange && !dryRun) {
        if (command.meta?.commit !== false && runOptions.commit !== false) nextSnapshotId = await commitSnapshot(command);
        if (runOptions.version !== false) documentVersion++;
      }
      const result = makeResult(command, didChange && !dryRun, syncDataDocumentVersion(data), true, warnings);
      if (nextSnapshotId !== undefined) result.snapshotId = nextSnapshotId;
      if (destroyed) return result;
      if (result.changed && runOptions.emitDocumentChanged !== false) emitDocumentChanged(command);
      if (runOptions.emitEvents !== false) emit({
        type: 'commandApplied',
        command,
        result
      });
      return result;
    } catch (error) {
      restoreRuntimeState(stores, before);
      documentVersion = beforeVersion;
      lastAnchor = beforeLastAnchor;
      const result = failResult(command, error);
      if (!destroyed && runOptions.emitEvents !== false) emit({
        type: 'commandFailed',
        command,
        result
      });
      return result as FikaCommandResult<TData>;
    } finally {
      currentWarnings = previousWarnings;
    }
  };
  const readOnlyCommands = new Set<FikaCommandType>(['deck.get', 'deck.getTheme', 'deck.extractTheme', 'animations.list', 'animations.catalog', 'animations.sequence', 'templates.catalog', 'templates.slidesCatalog', 'styles.catalog', 'layouts.catalog', 'slides.current', 'slides.read', 'slides.getTransition', 'slides.getRemark', 'notes.listReplies', 'sections.list', 'search.find', 'text.getContent', 'media.resolveAsset', 'export.json', 'shapes.presets']);
  const stateOnlyCommands = new Set<FikaCommandType>(['slides.select', 'elements.select', 'elements.selectGroup', 'elements.clearSelection', 'elements.setHandle', 'elements.hide', 'elements.show', 'history.commit', 'view.goToSlide', 'view.nextSlide', 'view.previousSlide', 'view.setZoom', 'view.enterPresentation', 'view.exitPresentation', 'view.setLocale']);
  const isReadOnlyCommandType = (type: FikaCommandType) => type.endsWith('.get') || type.endsWith('.list') || readOnlyCommands.has(type);
  const changesDocument = (command: FikaAgentCommand) => !stateOnlyCommands.has(command.type);
  const registry = new Map<FikaCommandType, CommandDescriptor>();
  const register = <TPayload,>(type: FikaCommandType, handler: (payload: TPayload, command: FikaAgentCommand<TPayload>) => unknown | Promise<unknown>) => {
    if (!isCanonicalCommandType(type)) throw new Error(`Command type must use domain.action format: ${type}`);
    if (registry.has(type)) throw new Error(`Duplicate command registration: ${type}`);
    registry.set(type, {
      type,
      handler: handler as Handler,
      mutates: !isReadOnlyCommandType(type)
    });
  };
  const commandTypeFailure = (command: FikaAgentCommand): FikaCommandResult | null => {
    if (!isCanonicalCommandType(String(command.type))) {
      return failResult(command, new AgenticCommandError('InvalidCommandType', `Command type must use domain.action format: ${String(command.type)}`, 'type'));
    }
    if (!registry.has(command.type)) {
      return failResult(command, new AgenticCommandError('UnsupportedCommand', `Unsupported command: ${command.type}`, 'type'));
    }
    return null;
  };
  const richTextElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'text' && found.element.type !== 'shape') throw new Error(`Element does not support rich text: ${elementId}`);
    return found as typeof found & {
      element: FikaRichTextElement;
    };
  };
  const defaultShapeText = (): ShapeText => ({
    content: '',
    align: 'middle',
    defaultFontName: stores.slides.theme.fontName,
    defaultColor: stores.slides.theme.fontColor
  });
  const textElementStylePatch = (style: FikaRichTextStylePatch): Partial<PPTTextElement> => {
    const patch: Partial<PPTTextElement> = {};
    if (style.defaultFontName !== undefined) patch.defaultFontName = style.defaultFontName;
    if (style.defaultColor !== undefined) patch.defaultColor = style.defaultColor;
    if (style.lineHeight !== undefined) patch.lineHeight = style.lineHeight;
    if (style.paragraphSpace !== undefined) patch.paragraphSpace = style.paragraphSpace;
    if (style.wordSpace !== undefined) patch.wordSpace = style.wordSpace;
    if (style.inset !== undefined) patch.inset = clonePlain(style.inset);
    if (style.vertical !== undefined) patch.vertical = style.vertical;
    return patch;
  };
  const shapeTextStylePatch = (style: FikaRichTextStylePatch): Partial<ShapeText> => {
    const patch: Partial<ShapeText> = {};
    if (style.defaultFontName !== undefined) patch.defaultFontName = style.defaultFontName;
    if (style.defaultColor !== undefined) patch.defaultColor = style.defaultColor;
    if (style.lineHeight !== undefined) patch.lineHeight = style.lineHeight;
    if (style.paragraphSpace !== undefined) patch.paragraphSpace = style.paragraphSpace;
    if (style.wordSpace !== undefined) patch.wordSpace = style.wordSpace;
    if (style.inset !== undefined) patch.inset = clonePlain(style.inset);
    if (style.align !== undefined) patch.align = style.align;
    return patch;
  };
  const updateRichTextContent = (payload: {
    elementId: string;
    slideId?: string;
    content: string;
  }) => {
    const found = richTextElement(payload.elementId, payload.slideId);
    const content = agentTextToHtmlBreaks(payload.content);
    if (found.element.type === 'text') {
      return updateElementAt(stores, found.slideIndex, found.elementIndex, {
        content
      } as Partial<PPTElement>) as PPTTextElement;
    }
    const text = {
      ...defaultShapeText(),
      ...(found.element as PPTShapeElement).text,
      content
    };
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      text
    } as Partial<PPTElement>) as PPTShapeElement;
  };
  const updateRichTextStyle = (payload: {
    elementId: string;
    slideId?: string;
    style: FikaRichTextStylePatch;
  }) => {
    const found = richTextElement(payload.elementId, payload.slideId);
    if (found.element.type === 'text') {
      return updateElementAt(stores, found.slideIndex, found.elementIndex, textElementStylePatch(payload.style) as Partial<PPTElement>) as PPTTextElement;
    }
    const text = {
      ...defaultShapeText(),
      ...(found.element as PPTShapeElement).text,
      ...shapeTextStylePatch(payload.style)
    };
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      text
    } as Partial<PPTElement>) as PPTShapeElement;
  };
  const updateRichTextParagraphAttrs = (payload: {
    elementId: string;
    slideId?: string;
    attrs: FikaRichTextParagraphAttrs;
  }) => {
    const found = richTextElement(payload.elementId, payload.slideId);
    if (found.element.type === 'text') {
      return updateElementAt(stores, found.slideIndex, found.elementIndex, {
        content: applyParagraphAttrs(found.element.content, payload.attrs)
      } as Partial<PPTElement>) as PPTTextElement;
    }
    const currentText = {
      ...defaultShapeText(),
      ...(found.element as PPTShapeElement).text
    };
    const text = {
      ...currentText,
      content: applyParagraphAttrs(currentText.content, payload.attrs)
    };
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      text
    } as Partial<PPTElement>) as PPTShapeElement;
  };
  register('deck.get', () => documentFromStores(stores));
  register('deck.set', (payload: FikaDeckInput) => {
    restoreDocument(stores, documentFromPayload(payload));
    return documentFromStores(stores);
  });
  const importDocument = (payload: unknown) => {
    const document = importDocumentFromPayload(payload);
    const apply = resolveImportApply(stores.slides.slides.length, {
      ...importApplyOptionsFromPayload(payload),
      confirm: false
    }).apply;
    if (apply === 'append') {
      const {
        slides
      } = cloneSlidesWithRemappedIds(document.slides, {
        preserveExternalSlideLinks: true
      });
      stores.slides.addSlide(slides);
      stores.main.setActiveElementIdList([]);
      stores.main.setActiveGroupElementId('');
      return documentFromStores(stores);
    }
    restoreDocument(stores, document);
    return documentFromStores(stores);
  };
  register('import.json', importDocument);
  register('import.fika', importDocument);
  register('import.pptxSafe', importDocument);
  register('export.json', () => documentFromStores(stores));
  register('deck.patch', (payload: FikaDeckPatch) => {
    const patch = documentPatchFromPayload(payload);
    if (patch.title !== undefined) stores.slides.setTitle(patch.title);
    if (patch.slides) {
      stores.slides.setSlides(clonePlain(patch.slides), patch.theme ? mergeDeckTheme(stores.slides.theme, patch.theme) : undefined);
    } else if (patch.theme) stores.slides.setTheme(mergeDeckTheme(stores.slides.theme, patch.theme));
    applyViewport(stores, patch.viewport);
    if (patch.templates) stores.slides.setTemplates(clonePlain(patch.templates));
    return documentFromStores(stores);
  });
  register('deck.setTitle', (payload: {
    title: string;
  }) => {
    stores.slides.setTitle(payload.title);
    return {
      title: stores.slides.title
    };
  });
  register('deck.setTheme', (payload: {
    theme: FikaSlideThemePatch;
  }) => {
    const theme = normalizeDocumentTheme(payload.theme, 'payload.theme') || {};
    stores.slides.setTheme(mergeDeckTheme(stores.slides.theme, theme));
    return clonePlain(stores.slides.theme);
  });
  register('deck.getTheme', () => clonePlain(stores.slides.theme));
  register('deck.applyTheme', (payload: {
    theme: FikaSlideThemePatch;
    options?: FikaApplyThemeOptions;
  }) => {
    const theme = normalizeDocumentTheme(payload.theme, 'payload.theme') || {};
    stores.slides.setTheme(mergeDeckTheme(stores.slides.theme, theme));
    applyThemeToSlideContent(stores, stores.slides.theme, payload.options);
    return clonePlain(stores.slides.theme);
  });
  register('deck.extractTheme', (payload: {
    options?: FikaThemeExtractionOptions;
  } = {}) => extractThemeFromDeck(stores, payload?.options));
  register('deck.applyTemplate', async (payload: {
    templateId: string;
  } = {
    templateId: ''
  }) => {
    if (!payload?.templateId) {
      throw new AgenticCommandError('InvalidTemplate', 'templateId is required. Call templates.catalog.', 'payload.templateId');
    }
    assertKnownTemplateId(payload.templateId);
    const data = await loadTemplatePayload(payload.templateId);
    const themePatch = templateThemePatch(data);
    if (themePatch) stores.slides.setTheme(mergeDeckTheme(stores.slides.theme, themePatch));
    if (data.width) stores.slides.setViewportSize(data.width);
    if (data.width && data.height) stores.slides.setViewportRatio(data.height / data.width);
    return {
      templateId: payload.templateId,
      theme: clonePlain(stores.slides.theme)
    };
  });
  register('templates.catalog', () => listTemplateCatalog());
  register('templates.slidesCatalog', async (payload: {
    templateId: string;
  } = {
    templateId: ''
  }) => {
    if (!payload?.templateId) {
      throw new AgenticCommandError('InvalidTemplate', 'templateId is required. Call templates.catalog.', 'payload.templateId');
    }
    assertKnownTemplateId(payload.templateId);
    return buildTemplateSlidesCatalog(payload.templateId);
  });
  register('styles.catalog', () => listStylePresets());
  register('layouts.catalog', () => listLayouts());
  register('deck.applyStyle', (payload: {
    styleId: string;
  } = {
    styleId: ''
  }) => {
    if (!payload?.styleId) {
      throw new AgenticCommandError('InvalidStyle', 'styleId is required. Call styles.catalog.', 'payload.styleId');
    }
    if (!getStylePreset(payload.styleId)) {
      addWarning(createIssue('UnknownStyle', `Unknown style "${payload.styleId}"; falling back to the default style. Call styles.catalog for valid ids.`, 'payload.styleId', true));
    }
    const preset = resolveStylePreset(payload.styleId);
    if (compositionSession?.styleId === preset.id && stores.slides.theme.styleId === preset.id) {
      addWarning(createIssue('BootstrapIdempotent', `Style "${preset.id}" is already active from deck.setup — applyStyle skipped. Continue building slides.`, undefined, true));
      return {
        styleId: preset.id,
        theme: clonePlain(stores.slides.theme),
        skipped: true
      };
    }
    stores.slides.setTheme(mergeDeckTheme(stores.slides.theme, styleThemePatch(preset)));
    return {
      styleId: preset.id,
      theme: clonePlain(stores.slides.theme)
    };
  });
  register('deck.planComposition', (payload: {
    slideCount: number;
    hints?: import('./composition').CompositionSlideHint[];
  } = {
    slideCount: 0
  }) => {
    if (!payload || !Number.isFinite(payload.slideCount) || payload.slideCount <= 0) {
      throw new AgenticCommandError('InvalidCompositionPlan', 'slideCount (a positive integer) is required.', 'payload.slideCount');
    }
    const preset = resolveStylePreset(stores.slides.theme.styleId);
    if (compositionSession && compositionSession.slideCount === payload.slideCount && compositionSession.styleId === preset.id && !payload.hints?.length) {
      plannedAnchors = compositionSession.plan.slides.map(entry => entry.anchor);
      addWarning(createIssue('BootstrapIdempotent', `Composition plan for ${payload.slideCount} slides is already active from deck.setup — planComposition skipped. Continue with createFromLayout.`, undefined, true));
      return {
        plan: toApiCompositionPlan(compositionSession.plan),
        styleId: preset.id,
        motif: {
          ...preset.motif
        },
        skipped: true
      };
    }
    const plan = sequenceComposition(payload.slideCount, preset.id, payload.hints ?? []);
    plannedAnchors = plan.slides.map(entry => entry.anchor);
    compositionSession = {
      styleId: preset.id,
      slideCount: payload.slideCount,
      plan
    };
    return {
      plan: toApiCompositionPlan(plan),
      styleId: preset.id,
      motif: {
        ...preset.motif
      }
    };
  });
  register('deck.setup', async (payload: {
    styleId: string;
    slideCount: number;
    hints?: import('./composition').CompositionSlideHint[];
    title?: {
      slots?: Record<string, unknown>;
      variantId?: string;
    };
  } = {
    styleId: '',
    slideCount: 0
  }) => {
    if (!payload?.styleId) {
      throw new AgenticCommandError('InvalidStyle', 'styleId is required. Call styles.catalog or pass one of: academic, minimal, bold, playful.', 'payload.styleId');
    }
    if (!payload || !Number.isFinite(payload.slideCount) || payload.slideCount <= 0) {
      throw new AgenticCommandError('InvalidCompositionPlan', 'slideCount (a positive integer) is required.', 'payload.slideCount');
    }
    if (!getStylePreset(payload.styleId)) {
      addWarning(createIssue('UnknownStyle', `Unknown style "${payload.styleId}"; falling back to the default style. Valid ids: academic, minimal, bold, playful.`, 'payload.styleId', true));
    }
    const preset = resolveStylePreset(payload.styleId);
    stores.slides.setTheme(mergeDeckTheme(stores.slides.theme, styleThemePatch(preset)));
    const plan = sequenceComposition(payload.slideCount, preset.id, payload.hints ?? []);
    plannedAnchors = plan.slides.map(entry => entry.anchor);
    compositionSession = {
      styleId: preset.id,
      slideCount: payload.slideCount,
      plan
    };
    let titleSlideId: string | undefined;
    let titleBuilt = false;
    const titleSlots = payload.title?.slots;
    if (titleSlots && typeof titleSlots === 'object') {
      const viewport = viewportFromStores(stores);
      const layoutMeta = listLayouts().find(l => l.id === 'title');
      const plannedAnchor = plannedAnchors?.[0];
      let effectiveVariantId = payload.title?.variantId;
      if (!effectiveVariantId && plannedAnchor && layoutMeta?.variants?.length) {
        const supportedAnchors = [...new Set(layoutMeta.variants.map(v => v.anchor))];
        const nearest = pickNearestAnchor(plannedAnchor, supportedAnchors);
        const matching = nearest ? layoutMeta.variants.find(v => v.anchor === nearest.anchor) : undefined;
        if (matching) effectiveVariantId = matching.id;
      }
      const built = await buildLayoutSlide(
        'title', titleSlots, preset, {
        width: viewport.size,
        height: viewport.size * viewport.ratio
      }, 'auto', effectiveVariantId);
      for (const warning of built.warnings) {
        addWarning(createIssue('LayoutContent', warning, undefined, true));
      }
      const slide = normalizeSlideForInsert(built.slide);
      const currentSlides = stores.slides.slides;
      const replaceStarter = currentSlides.length === 1 && isPristineStarterSlide(currentSlides[0]);
      ensureSlideIdAvailable(currentSlides, slide.id);
      if (currentSlides.length === 0) {
        stores.slides.addSlide(slide, { index: 0, select: false, keepSectionTag: true });
      } else if (replaceStarter || currentSlides.length === 1) {
        stores.slides.replaceSlide(slide, currentSlides[0].id);
      } else {
        stores.slides.addSlide(slide, { index: 0, select: false, keepSectionTag: true });
      }
      applySlideSelection(stores, 0);
      lastAnchor = built.anchor;
      titleSlideId = slide.id;
      titleBuilt = true;
    }
    return {
      styleId: preset.id,
      theme: clonePlain(stores.slides.theme),
      plan: toApiCompositionPlan(plan),
      motif: {
        ...preset.motif
      },
      styles: listStylePresets(),
      ...(titleSlideId ? {
        titleSlideId,
        titleBuilt
      } : {})
    };
  });
  register('deck.setViewport', (payload: {
    size?: number;
    ratio?: number;
  }) => {
    const viewport = normalizeDocumentViewport(cloneJsonSafePayload(payload, 'payload'), 'payload');
    applyViewport(stores, viewport);
    return getState(stores, documentVersion);
  });
  register('deck.setTemplates', (payload: {
    templates: Parameters<typeof stores.slides.setTemplates>[0];
  }) => {
    const root = requireDocumentRecord(cloneJsonSafePayload(payload, 'payload'), 'payload');
    const templates = normalizeDocumentTemplates(root.templates, 'payload.templates');
    if (!templates) throw new AgenticCommandError('InvalidDocument', 'Templates must be an array', 'payload.templates');
    stores.slides.setTemplates(templates);
    return clonePlain(stores.slides.templates);
  });
  register('slides.list', () => clonePlain(stores.slides.slides));
  register('slides.get', (payload: SlideSelectorPayload = {}) => {
    const found = readSlide(stores, payload);
    return found ? clonePlain(found.slide) : null;
  });
  register('slides.current', () => {
    const found = readSlide(stores);
    return found ? clonePlain(found.slide) : null;
  });
  register('slides.read', (payload: SlideSelectorPayload = {}) => {
    const found = readSlide(stores, payload);
    return found ? clonePlain(found.slide) : null;
  });
  register('slides.create', (payload: {
    slide?: Partial<Slide>;
    index?: number;
    select?: boolean;
  } = {}) => {
    const slide = normalizeSlideForInsert(payload.slide);
    ensureSlideIdAvailable(stores.slides.slides, slide.id);
    const index = fromApiInsertSlideIndex(payload.index, stores.slides.slides.length);
    syncPlanOnInsert(index, 1);
    stores.slides.addSlide(slide, { index, select: false, keepSectionTag: true });
    if (payload.select !== false) applySlideSelection(stores, index);
    return clonePlain(slide);
  });
  register('slides.createFromLayout', async (payload: {
    layoutId: string;
    variantId?: string;
    slots?: Record<string, unknown>;
    index?: number;
    select?: boolean;
    backgroundMode?: FikaLayoutBackgroundMode;
  } = {
    layoutId: ''
  }) => {
    if (!payload?.layoutId) {
      throw new AgenticCommandError('InvalidLayout', 'layoutId is required. Call layouts.catalog.', 'payload.layoutId');
    }
    warnLiteralHtmlInSlots(payload.slots);
    const preset = resolveStylePreset(stores.slides.theme.styleId);
    const viewport = viewportFromStores(stores);

    const currentSlides = stores.slides.slides;
    const replaceStarter = payload.index === undefined && currentSlides.length === 1 && isPristineStarterSlide(currentSlides[0]);
    const replaceDuplicateTitle = !replaceStarter && payload.index === undefined && payload.layoutId === 'title' && currentSlides.length === 1 && !isPristineStarterSlide(currentSlides[0]);
    const requestedIndex = payload.index;
    const replaceStoreIndex = typeof requestedIndex === 'number' && Number.isFinite(requestedIndex) && requestedIndex >= 1 && requestedIndex <= currentSlides.length ? requestedIndex - 1 : null;
    const replaceAtIndex = replaceStoreIndex !== null;
    const index = replaceStarter || replaceDuplicateTitle ? 0 : replaceStoreIndex !== null ? replaceStoreIndex : fromApiInsertSlideIndex(requestedIndex, currentSlides.length);
    const replacing = replaceStarter || replaceDuplicateTitle || replaceAtIndex;
    if (replaceDuplicateTitle) {
      addWarning(createIssue('BootstrapIdempotent', 'A title slide already exists after deck.setup — replaced slide 1 instead of appending a duplicate cover.', undefined, true));
    }
    const plannedAnchor = plannedAnchors?.[index];
    let effectiveVariantId = payload.variantId;
    const layoutMeta = listLayouts().find(l => l.id === payload.layoutId);
    let usedNearestAnchor = false;
    let keptAgentVariantDespiteDrift = false;
    if (plannedAnchor && layoutMeta?.variants?.length) {
      const supportedAnchors = [...new Set(layoutMeta.variants.map(v => v.anchor))];
      const nearest = pickNearestAnchor(plannedAnchor, supportedAnchors);
      const targetAnchor = nearest?.anchor;
      const EMPTY_FIELD_VARIANTS = new Set(['leftRail', 'rightRail', 'leftOffset', 'rightOffset']);
      const matching = targetAnchor ? layoutMeta.variants.find(v => v.anchor === targetAnchor && !EMPTY_FIELD_VARIANTS.has(v.id)) ?? layoutMeta.variants.find(v => !EMPTY_FIELD_VARIANTS.has(v.id)) ?? layoutMeta.variants.find(v => v.anchor === targetAnchor) : undefined;
      const requestedVariant = effectiveVariantId ? layoutMeta.variants.find(v => v.id === effectiveVariantId) : undefined;
      const requestedAnchor = requestedVariant?.anchor;
      if (!effectiveVariantId && matching) {
        if (nearest && !nearest.exact) {
          usedNearestAnchor = true;
          addWarning(createIssue('CompositionNearestAnchor', `[anchorNearest] Slide ${index + 1} was planned as "${plannedAnchor}" but "${payload.layoutId}" has no such variant — used nearest "${nearest.anchor}" via variant "${matching.id}". Soft advisory only; do not rebuild solely for this.`, undefined, true));
        }
        effectiveVariantId = matching.id;
      } else if (requestedAnchor && requestedAnchor !== plannedAnchor) {
        keptAgentVariantDespiteDrift = true;
        addWarning(createIssue('CompositionDrift', `[anchorDrift] Slide ${index + 1} was planned as "${plannedAnchor}" but "${effectiveVariantId}" builds as "${requestedAnchor}". Kept the chosen variant — do not slides.delete for drift alone.`, undefined, true));
      }
    }
    const built = await buildLayoutSlide(payload.layoutId, payload.slots ?? {}, preset, {
      width: viewport.size,
      height: viewport.size * viewport.ratio
    }, payload.backgroundMode ?? 'auto', effectiveVariantId);
    for (const warning of built.warnings) {
      addWarning(createIssue('LayoutContent', warning, undefined, true));
    }
    const slide = normalizeSlideForInsert(built.slide);

    const feature = slide.background?.type === 'solid' && slide.background.color === preset.palette.featureBackground;
    const qaIssues = validateSlide(slide, preset, {
      anchor: built.anchor,
      previousAnchor: lastAnchor,
      feature,
      expectsBody: layoutExpectsBody(payload.layoutId),
      layoutId: payload.layoutId
    });
    for (const issue of qaIssues) {
      addWarning(createIssue(issue.severity === 'error' ? 'SlideQualityError' : 'SlideQuality', `[${issue.code}] ${issue.message}`, issue.elementIds?.length ? `elements.${issue.elementIds.join(',')}` : undefined, issue.severity !== 'error'));
    }
    lastAnchor = built.anchor;
    ensureSlideIdAvailable(currentSlides, slide.id, replacing ? currentSlides[index]?.id : undefined);
    if (replacing && currentSlides[index]) {
      stores.slides.replaceSlide(slide, currentSlides[index].id);
    } else {
      stores.slides.addSlide(slide, { index, select: false, keepSectionTag: true });
    }
    if (payload.select !== false) applySlideSelection(stores, index);

    if (plannedAnchor && plannedAnchor !== built.anchor && !usedNearestAnchor && !keptAgentVariantDespiteDrift) {
      addWarning(createIssue('CompositionDrift', `[anchorDrift] Slide ${index + 1} was planned as "${plannedAnchor}" but "${payload.layoutId}" built as "${built.anchor}". Soft advisory — keep the slide unless content is broken; do not slides.delete for drift alone.`, undefined, true));
    }
    const loudIndex = compositionSession?.plan.loudIndex;
    if (typeof loudIndex === 'number' && index === loudIndex && payload.layoutId !== 'imageFull' && plannedAnchor === 'fullBleed') {
      addWarning(createIssue('CompositionLoudMiss', `[loudMiss] Slide ${index + 1} is the planned loud slide — prefer layoutId "imageFull" with image:{src,sourceUrl} from image_search. Soft advisory; keep this slide only if a full-bleed visual truly does not fit.`, undefined, true));
    }
    const textElementIds = slide.elements.filter((element): element is PPTTextElement => element.type === 'text').map(element => element.id);
    return {
      slideId: slide.id,
      slideIndex: toApiSlideIndex(index),
      layoutId: payload.layoutId,
      variantId: built.variantId,
      anchor: built.anchor,
      replacedStarter: replaceStarter || replaceDuplicateTitle,
      replaced: replacing,
      elementIds: slide.elements.map(element => element.id),
      textElementIds
    };
  });
  register('slides.insertFromTemplate', async (payload: {
    templateId: string;
    slug: string;
    index?: number;
    select?: boolean;
    applyTemplateTheme?: boolean;
  } = {
    templateId: '',
    slug: ''
  }) => {
    if (!payload?.templateId) throw new AgenticCommandError('InvalidTemplate', 'templateId is required.', 'payload.templateId');
    if (!payload?.slug) throw new AgenticCommandError('InvalidTemplateSlide', 'slug is required. Call templates.slidesCatalog.', 'payload.slug');
    assertKnownTemplateId(payload.templateId);
    const data = await loadTemplatePayload(payload.templateId);
    if (payload.applyTemplateTheme !== false && stores.slides.slides.length === 0) {
      const themePatch = templateThemePatch(data);
      if (themePatch) stores.slides.setTheme({
        ...stores.slides.theme,
        ...themePatch
      });
    }
    const {
      slide: sourceSlide
    } = resolveTemplateSlide(data, payload.slug);
    const slide = normalizeSlideForInsert(sourceSlide);
    const index = fromApiInsertSlideIndex(payload.index, stores.slides.slides.length);
    syncPlanOnInsert(index, 1);
    stores.slides.addSlide(slide, { index, select: false, keepSectionTag: true });
    if (payload.select !== false) applySlideSelection(stores, index);
    const textElementIds = slide.elements.filter((element): element is PPTTextElement => element.type === 'text').map(element => element.id);
    const placeholderElementIds = slide.elements.filter((element): element is PPTTextElement => element.type === 'text' && !!element.placeholder).map(element => element.id);
    return {
      slideId: slide.id,
      slideIndex: toApiSlideIndex(index),
      templateId: payload.templateId,
      slug: payload.slug,
      elementIds: slide.elements.map(element => element.id),
      textElementIds,
      placeholderElementIds
    };
  });
  register('slides.insert', (payload: FikaInsertSlidesInput) => {
    const sourceSlides = Array.isArray(payload.slides) ? payload.slides : [payload.slides];
    if (!sourceSlides.length) throw new Error('At least one slide is required');
    const cloned = cloneSlidesWithRemappedIds(sourceSlides, {
      preserveExternalSlideLinks: payload.preserveExternalSlideLinks
    });
    const index = fromApiInsertSlideIndex(payload.index, stores.slides.slides.length);
    syncPlanOnInsert(index, cloned.slides.length);
    stores.slides.addSlide(cloned.slides, { index, select: false, keepSectionTag: true });
    if (payload.select !== false) applySlideSelection(stores, index);
    return {
      slides: cloned.slides,
      remap: {
        slideIds: cloned.slideIdMap,
        elementIds: cloned.elementIdMap,
        groupIds: cloned.groupIdMap,
        animationIds: cloned.animationIdMap
      }
    };
  });
  register('slides.update', (payload: {
    slideId: string;
    patch: Partial<Slide>;
  }) => {
    const index = resolveSlideIndex(stores, {
      slideId: payload.slideId
    });
    const patch = normalizeSlidePatch(payload.patch);
    if (patch.id) ensureSlideIdAvailable(stores.slides.slides, patch.id, payload.slideId);
    return updateSlideAt(stores, index, patch);
  });
  register('slides.delete', (payload: {
    slideId: string | string[];
  }) => {
    const deleted = toUniqueSlideIds(payload.slideId);
    const deletedIndexes = deleted.map(slideId => resolveSlideIndex(stores, {
      slideId
    }));
    const currentSlideId = stores.slides.currentSlide?.id;
    const deletedIds = new Set(deleted);
    const remainingSlides = stores.slides.slides.filter(slide => !deletedIds.has(slide.id));
    const deletedTargetLinks = findSlideLinkReferences(remainingSlides, deletedIds);
    syncPlanOnDeleteIndexes(deletedIndexes);
    stores.slides.deleteSlide(deleted);
    const currentIndex = currentSlideId ? stores.slides.slides.findIndex(slide => slide.id === currentSlideId) : -1;
    const slideIndex = stores.slides.slides.length ? currentIndex >= 0 ? currentIndex : clampIndex(Math.min(...deletedIndexes), stores.slides.slides.length) : 0;
    stores.slides.updateSlideIndex(slideIndex);
    stores.main.setActiveElementIdList([]);
    stores.main.updateSelectedSlidesIndex(stores.slides.slides.length ? [slideIndex] : []);
    for (const reference of deletedTargetLinks.slice(0, 5)) {
      addWarning(createIssue('SlideLinkTargetDeleted', `Element ${reference.elementId} links to deleted slide ${reference.target}.`, `slides.${reference.slideId}.elements.${reference.elementId}.link`, true));
    }
    if (deletedTargetLinks.length > 5) {
      addWarning(createIssue('SlideLinkTargetDeleted', `${deletedTargetLinks.length - 5} more element slide link(s) point to deleted slides.`, 'slides.delete', true));
    }
    return {
      deleted,
      slideIndex: stores.slides.slides.length ? toApiSlideIndex(slideIndex) : 0,
      currentSlideId: stores.slides.slides[slideIndex]?.id
    };
  });
  register('slides.duplicate', (payload: SlideSelectorPayload & {
    select?: boolean;
  } = {}) => {
    const found = readSlide(stores, payload);
    if (!found) throw new AgenticCommandError('SlideUnavailable', 'No slide is available', 'slideIdOrIndex');
    const {
      slide,
      index
    } = found;
    const duplicated = duplicateSlideData(slide);
    const toIndex = insertIndex(index + 1, stores.slides.slides.length);
    syncPlanOnInsert(toIndex, 1);
    stores.slides.addSlide(duplicated, { index: toIndex, select: false, keepSectionTag: true });
    if (payload.select !== false) applySlideSelection(stores, toIndex);
    return duplicated;
  });
  register('slides.move', (payload: SlideSelectorPayload & {
    toIndex: number;
  }) => {
    const fromIndex = resolveSlideIndex(stores, payload);
    if (!stores.slides.slides[fromIndex]) throw new Error(`Slide index not found: ${fromIndex}`);
    const toIndex = fromApiInsertSlideIndex(payload.toIndex, stores.slides.slides.length - 1, 'toIndex');
    syncPlanOnMove(fromIndex, toIndex);
    stores.slides.moveSlide(fromIndex, toIndex);
    applySlideSelection(stores, toIndex);
    return clonePlain(stores.slides.slides);
  });
  register('slides.select', (payload: SlideSelectorPayload) => {
    selectSlide(stores, payload);
    return getState(stores, documentVersion);
  });
  register('slides.setBackground', (payload: {
    slideId: string;
    background?: Slide['background'];
  }) => {
    const {
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    return updateSlideAt(stores, index, {
      background: cloneSlideBackground(payload.background)
    });
  });
  register('slides.applyBackground', (payload: {
    background: Slide['background'];
    slideIds?: string[];
    slideId?: string | string[];
  }) => {
    const targetIds = resolveBackgroundTargetIds(payload);
    const updated: Slide[] = [];
    for (let index = 0; index < stores.slides.slides.length; index++) {
      const slide = stores.slides.slides[index];
      if (targetIds && !targetIds.has(slide.id)) continue;
      updated.push(updateSlideAt(stores, index, {
        background: cloneSlideBackground(payload.background)
      }));
    }
    return updated;
  });
  register('slides.applyBackgroundToAll', (payload: {
    background: Slide['background'];
  }) => {
    const updated: Slide[] = [];
    for (let index = 0; index < stores.slides.slides.length; index++) {
      updated.push(updateSlideAt(stores, index, {
        background: cloneSlideBackground(payload.background)
      }));
    }
    return updated;
  });
  register('slides.getTransition', (payload: {
    slideId?: string;
  } = {}) => {
    const {
      slide
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    return {
      slideId: slide.id,
      turningMode: slide.turningMode
    };
  });
  register('slides.setTransition', (payload: {
    slideId: string;
    turningMode?: Slide['turningMode'];
  }) => {
    const {
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    return updateSlideAt(stores, index, {
      turningMode: normalizeTurningMode(payload.turningMode)
    });
  });
  register('slides.getRemark', (payload: {
    slideId?: string;
  } = {}) => {
    const {
      slide
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    return slide.remark || '';
  });
  register('slides.setRemark', (payload: {
    slideId: string;
    remark: string;
  }) => {
    const {
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    return updateSlideAt(stores, index, {
      remark: payload.remark
    });
  });
  register('elements.list', (payload: {
    slideId?: string;
  } = {}) => clonePlain(ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex).slide.elements));
  register('elements.get', (payload: {
    elementId: string;
    slideId?: string;
  }) => clonePlain(findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex).element));
  register('elements.create', (payload: {
    slideId?: string;
    index?: number;
    element: Partial<PPTElement> & {
      type: PPTElement['type'];
    };
    select?: boolean;
  }) => {
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const element = normalizeElement(payload.element, stores.slides.theme);
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(payload.index, elements.length), 0, element);
    updateSlideAt(stores, slideIndex, {
      elements
    });
    if (payload.select !== false) stores.main.setActiveElementIdList([element.id]);
    return clonePlain(element);
  });
  register('elements.insert', (payload: FikaInsertElementsInput) => {
    const sourceElements = Array.isArray(payload.elements) ? payload.elements : [payload.elements];
    if (!sourceElements.length) throw new Error('At least one element is required');
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const cloned = cloneElementsWithRemappedIds(sourceElements, payload.animations || [], {
      offset: payload.offset,
      preserveExternalSlideLinks: payload.preserveExternalSlideLinks,
      slideIdMap: payload.slideIdMap
    });
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(payload.index, elements.length), 0, ...cloned.elements);
    const animations = [...(slide.animations || []), ...cloned.animations];
    updateSlideAt(stores, slideIndex, {
      elements,
      animations
    });
    if (payload.select !== false) stores.main.setActiveElementIdList(cloned.elements.map(element => element.id));
    return {
      slideId: slide.id,
      elements: cloned.elements,
      animations: cloned.animations,
      remap: {
        slideIds: payload.slideIdMap,
        elementIds: cloned.elementIdMap,
        groupIds: cloned.groupIdMap,
        animationIds: cloned.animationIdMap
      }
    };
  });
  register('elements.update', (payload: {
    elementId: string | string[];
    slideId?: string;
    patch: Partial<PPTElement>;
  }) => {
    const ids = toIdList(payload.elementId);
    const updated: PPTElement[] = [];
    for (const id of ids) {
      const found = findElement(stores.slides.slides, id, payload.slideId, stores.slides.slideIndex);
      updated.push(updateElementAt(stores, found.slideIndex, found.elementIndex, payload.patch));
    }
    return updated;
  });
  register('elements.setTransform', (payload: {
    elementId: string | string[];
    slideId?: string;
    transform: FikaElementTransformPatch;
  }) => {
    return updateElementsWithPatch(stores, payload, element => getElementTransformPatch(element, payload.transform));
  });
  register('elements.move', (payload: {
    elementId: string | string[];
    slideId?: string;
    position: FikaElementMoveInput;
  }) => {
    return updateElementsWithPatch(stores, payload, element => getElementMovePatch(element, payload.position));
  });
  register('elements.resize', (payload: {
    elementId: string | string[];
    slideId?: string;
    size: FikaElementResizeInput;
  }) => {
    return updateElementsWithPatch(stores, payload, element => getElementResizePatch(element, payload.size));
  });
  register('elements.rotate', (payload: {
    elementId: string | string[];
    slideId?: string;
    rotate: number;
  }) => {
    return updateElementsWithPatch(stores, payload, element => getElementTransformPatch(element, {
      rotate: payload.rotate
    }));
  });
  register('elements.setOpacity', (payload: {
    elementId: string | string[];
    slideId?: string;
    opacity: number;
  }) => {
    return updateElementsWithPatch(stores, payload, element => getElementTransformPatch(element, {
      opacity: payload.opacity
    }));
  });
  register('elements.setFlip', (payload: {
    elementId: string | string[];
    slideId?: string;
    flip: FikaElementFlipInput;
  }) => {
    return updateElementsWithPatch(stores, payload, element => getElementTransformPatch(element, payload.flip));
  });
  register('elements.delete', (payload: {
    elementId: string | string[];
    slideId?: string;
  }) => {
    const ids = toIdList(payload.elementId);
    const removalsBySlide = new Map<number, Set<string>>();
    for (const id of ids) {
      const found = findElement(stores.slides.slides, id, payload.slideId, stores.slides.slideIndex);
      const removals = removalsBySlide.get(found.slideIndex) || new Set<string>();
      removals.add(id);
      removalsBySlide.set(found.slideIndex, removals);
    }
    for (const [slideIndex, removals] of removalsBySlide) {
      const slide = stores.slides.slides[slideIndex];
      if (!slide) throw new Error(`Slide index not found: ${slideIndex}`);
      updateSlideAt(stores, slideIndex, {
        elements: slide.elements.filter(element => !removals.has(element.id))
      });
    }
    stores.main.setActiveElementIdList(stores.main.activeElementIdList.filter(id => !ids.includes(id)));
    if (ids.includes(stores.main.activeGroupElementId)) stores.main.setActiveGroupElementId('');
    return {
      deleted: ids
    };
  });
  register('elements.reorder', (payload: {
    elementId: string;
    slideId?: string;
    toIndex: number;
  }) => reorderElementList(stores, payload));
  register('elements.bringForward', (payload: {
    elementId: string;
    slideId?: string;
  }) => orderElementLayer(stores, payload, 'forward'));
  register('elements.sendBackward', (payload: {
    elementId: string;
    slideId?: string;
  }) => orderElementLayer(stores, payload, 'backward'));
  register('elements.bringToFront', (payload: {
    elementId: string;
    slideId?: string;
  }) => orderElementLayer(stores, payload, 'front'));
  register('elements.sendToBack', (payload: {
    elementId: string;
    slideId?: string;
  }) => orderElementLayer(stores, payload, 'back'));
  register('elements.select', (payload: {
    elementId: string | string[];
    slideId?: string;
  }) => {
    selectElements(stores, payload);
    return getState(stores, documentVersion);
  });
  register('elements.selectGroup', (payload: {
    groupIdOrElementId: string;
    slideId?: string;
  }) => {
    selectElementGroup(stores, payload);
    return getState(stores, documentVersion);
  });
  register('elements.clearSelection', () => {
    setSelection(stores, []);
    return getState(stores, documentVersion);
  });
  register('elements.setHandle', (payload: {
    elementId: string;
    slideId?: string;
  }) => {
    findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex);
    if (!stores.main.activeElementIdList.includes(payload.elementId)) selectElements(stores, payload);
    stores.main.setHandleElementId(payload.elementId);
    if (!stores.main.activeElementIdList.includes(stores.main.activeGroupElementId)) stores.main.setActiveGroupElementId('');
    return getState(stores, documentVersion);
  });
  register('elements.group', (payload: {
    elementIds: string[];
    groupId?: string;
    slideId?: string;
  }) => {
    const elementIds = [...new Set(payload.elementIds)];
    if (!elementIds.length) throw new AgenticCommandError('InvalidElementId', 'At least one element ID is required', 'elementIds');
    const first = findElement(stores.slides.slides, elementIds[0], payload.slideId, stores.slides.slideIndex);
    const groupId = payload.groupId || createId('group');
    const elements = clonePlain(first.slide.elements);
    const updated: PPTElement[] = [];
    for (const id of elementIds) {
      const elementIndex = elements.findIndex(element => element.id === id);
      if (elementIndex === -1) throw new AgenticCommandError('ElementNotFound', `Element not found on slide ${first.slide.id}: ${id}`, 'elementIds');
      elements[elementIndex] = {
        ...elements[elementIndex],
        groupId
      } as PPTElement;
      updated.push(clonePlain(elements[elementIndex]));
    }
    updateSlideAt(stores, first.slideIndex, {
      elements
    });
    return updated;
  });
  register('elements.ungroup', (payload: {
    groupIdOrElementId: string;
    slideId?: string;
  }) => {
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const seed = slide.elements.find(element => element.id === payload.groupIdOrElementId);
    const groupId = seed?.groupId || payload.groupIdOrElementId;
    const elements = clonePlain(slide.elements);
    const updated: PPTElement[] = [];
    for (const element of elements) {
      if (element.groupId !== groupId) continue;
      delete element.groupId;
      updated.push(clonePlain(element));
    }
    if (!updated.length) throw new AgenticCommandError('ElementGroupNotFound', `Element group not found: ${payload.groupIdOrElementId}`, 'groupIdOrElementId');
    updateSlideAt(stores, slideIndex, {
      elements
    });
    return updated;
  });
  const setElementLock = (payload: {
    elementId: string | string[];
    slideId?: string;
    locked: boolean;
  }) => {
    return toIdList(payload.elementId).map(id => {
      const found = findElement(stores.slides.slides, id, payload.slideId, stores.slides.slideIndex);
      return updateElementAt(stores, found.slideIndex, found.elementIndex, {
        lock: payload.locked
      } as Partial<PPTElement>);
    });
  };
  register('elements.lock', (payload: {
    elementId: string | string[];
    slideId?: string;
    locked?: boolean;
  }) => {
    return setElementLock({
      elementId: payload.elementId,
      slideId: payload.slideId,
      locked: payload.locked ?? true
    });
  });
  register('elements.unlock', (payload: {
    elementId: string | string[];
    slideId?: string;
  }) => {
    return setElementLock({
      elementId: payload.elementId,
      slideId: payload.slideId,
      locked: false
    });
  });
  const setElementHidden = (payload: {
    elementId: string | string[];
    slideId?: string;
    hidden: boolean;
  }) => {
    const ids = toIdList(payload.elementId);
    for (const id of ids) findElement(stores.slides.slides, id, payload.slideId, stores.slides.slideIndex);
    const current = new Set(stores.main.hiddenElementIdList);
    for (const id of ids) {
      if (payload.hidden) current.add(id);else current.delete(id);
    }
    stores.main.setHiddenElementIdList([...current]);
    if (payload.hidden && ids.some(id => stores.main.activeElementIdList.includes(id))) {
      setSelection(stores, []);
    }
    return getState(stores, documentVersion);
  };
  register('elements.hide', (payload: {
    elementId: string | string[];
    slideId?: string;
    hidden?: boolean;
  }) => {
    return setElementHidden({
      elementId: payload.elementId,
      slideId: payload.slideId,
      hidden: payload.hidden ?? true
    });
  });
  register('elements.show', (payload: {
    elementId: string | string[];
    slideId?: string;
  }) => {
    return setElementHidden({
      elementId: payload.elementId,
      slideId: payload.slideId,
      hidden: false
    });
  });
  const setElementLink = (payload: {
    elementId: string;
    slideId?: string;
    link?: PPTElement['link'];
  }) => {
    const found = findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex);
    const link = normalizeElementLink(payload.link, stores.slides.slides);
    if (!link) {
      const slide = stores.slides.slides[found.slideIndex];
      const element = slide?.elements[found.elementIndex];
      if (!element) throw new Error('Element location is invalid');
      const nextElement = { ...element };
      delete nextElement.link;
      const elements = slide.elements.slice();
      elements[found.elementIndex] = nextElement;
      stores.slides.updateSlide({ elements }, slide.id);
      return [clonePlain(nextElement)];
    }
    return [updateElementAt(stores, found.slideIndex, found.elementIndex, {
      link
    } as Partial<PPTElement>)];
  };
  register('elements.setLink', setElementLink);
  register('links.set', setElementLink);
  register('links.remove', (payload: {
    elementId: string;
    slideId?: string;
  }) => setElementLink({
    elementId: payload.elementId,
    slideId: payload.slideId
  }));
  const getShapeElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'shape') throw new Error(`Element is not a shape: ${elementId}`);
    return found as typeof found & {
      element: PPTShapeElement;
    };
  };
  const createShapeElementFromInput = (payload: FikaCreateShapeInput = {}) => {
    const {
      slideId: _slideId,
      index: _index,
      select: _select,
      presetId: _presetId,
      categoryKey: _categoryKey,
      presetIndex: _presetIndex,
      preset: _preset,
      element,
      ...shapePatch
    } = payload;
    const preset = resolveShapePreset(payload);
    const presetPatch: Partial<PPTShapeElement> = preset ? {
      viewBox: clonePlain(preset.viewBox),
      path: preset.path,
      ...(preset.special ? {
        special: true
      } : {}),
      ...(preset.pathFormula ? {
        pathFormula: preset.pathFormula
      } : {})
    } : {};
    const hasOutlinePatch = Object.prototype.hasOwnProperty.call(shapePatch, 'outline');
    const hasTextPatch = Object.prototype.hasOwnProperty.call(shapePatch, 'text');
    const presetOutline = preset?.withborder ? stores.slides.theme.outline : undefined;
    const outline = hasOutlinePatch ? shapePatch.outline ? {
      ...(presetOutline || {}),
      ...(element?.outline || {}),
      ...shapePatch.outline
    } : undefined : element?.outline || presetOutline;
    const text = hasTextPatch ? shapePatch.text ? normalizeShapeText(stores.slides.theme, element?.text, shapePatch.text) : undefined : normalizeShapeText(stores.slides.theme, element?.text);
    return normalizeShapeElement({
      fill: stores.slides.theme.themeColors[0] || '#ffffff',
      fixedRatio: false,
      ...presetPatch,
      ...element,
      ...(shapePatch as Partial<PPTShapeElement>),
      ...(outline ? {
        outline
      } : {}),
      ...(text ? {
        text
      } : {})
    });
  };
  const patchShapeElement = (elementId: string, slideId: string | undefined, patch: FikaShapePatch): PPTShapeElement => {
    const found = getShapeElement(elementId, slideId);
    const normalizedPatch = clonePatch(patch) as FikaShapePatch;
    if ('text' in patch) {
      normalizedPatch.text = patch.text ? normalizeShapeText(stores.slides.theme, found.element.text, patch.text) : undefined;
    }
    const element = mergeShapeElement(found.element, normalizedPatch as Partial<PPTShapeElement>);
    return replaceElementAt(stores, found.slideIndex, found.elementIndex, element) as PPTShapeElement;
  };
  const createShapeOnSlide = (payload: FikaCreateShapeInput = {}) => {
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const element = createShapeElementFromInput(payload);
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(payload.index, elements.length), 0, element);
    updateSlideAt(stores, slideIndex, {
      elements
    });
    if (payload.select !== false) stores.main.setActiveElementIdList([element.id]);
    return clonePlain(element);
  };
  register('shapes.presets', (payload: {
    categoryKey?: FikaShapePreset['categoryKey'] | 'rect';
  } = {}) => listShapePresets(payload.categoryKey));
  register('shapes.create', (payload: FikaCreateShapeInput = {}) => createShapeOnSlide(payload));
  register('shapes.patch', (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaShapePatch;
  }) => patchShapeElement(payload.elementId, payload.slideId, payload.patch));
  register('shapes.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaShapePatch;
  }) => patchShapeElement(payload.elementId, payload.slideId, payload.patch));
  register('shapes.setPath', (payload: {
    elementId: string;
    slideId?: string;
    path: string;
    viewBox?: PPTShapeElement['viewBox'];
    fixedRatio?: boolean;
  }) => patchShapeElement(payload.elementId, payload.slideId, {
    path: payload.path,
    ...(payload.viewBox ? {
      viewBox: payload.viewBox
    } : {}),
    ...(payload.fixedRatio !== undefined ? {
      fixedRatio: payload.fixedRatio
    } : {})
  }));
  register('shapes.setFormula', (payload: {
    elementId: string;
    slideId?: string;
    pathFormula: PPTShapeElement['pathFormula'];
    keypoints?: number[];
  }) => patchShapeElement(payload.elementId, payload.slideId, {
    pathFormula: payload.pathFormula,
    ...(payload.keypoints ? {
      keypoints: payload.keypoints
    } : {})
  }));
  register('shapes.setFill', (payload: {
    elementId: string;
    slideId?: string;
    fill: FikaShapeFillInput;
  }) => patchShapeElement(payload.elementId, payload.slideId, normalizeShapeFillPatch(payload.fill)));
  register('shapes.setOutline', (payload: {
    elementId: string;
    slideId?: string;
    outline?: FikaShapePatch['outline'];
  }) => patchShapeElement(payload.elementId, payload.slideId, {
    outline: payload.outline
  }));
  register('shapes.setText', (payload: {
    elementId: string;
    slideId?: string;
    text?: Partial<ShapeText>;
  }) => patchShapeElement(payload.elementId, payload.slideId, {
    text: payload.text
  }));
  const latexElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'latex') throw new Error(`Element is not a LaTeX element: ${elementId}`);
    return found as typeof found & {
      element: PPTLatexElement;
    };
  };
  register('latex.get', (payload: {
    elementId: string;
    slideId?: string;
  }) => {
    const element = findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex).element;
    return element.type === 'latex' ? clonePlain(element) : null;
  });
  register('latex.create', (payload: FikaCreateLatexElementInput) => {
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const element = normalizeLatexElement(payload.element);
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(payload.index, elements.length), 0, element);
    updateSlideAt(stores, slideIndex, {
      elements
    });
    if (payload.select !== false) stores.main.setActiveElementIdList([element.id]);
    return element;
  });
  register('latex.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaLatexElementPatch;
  }) => {
    const found = latexElement(payload.elementId, payload.slideId);
    const patch = {
      ...clonePatch(payload.patch),
      type: 'latex' as const
    };
    const nextLatex = typeof patch.latex === 'string' ? patch.latex.trim() : '';
    const hasNewPath = typeof patch.path === 'string' && patch.path.trim().length > 0;
    if (nextLatex && nextLatex !== found.element.latex && !hasNewPath) {
      const geometry = deriveLatexGeometry(nextLatex);
      patch.latex = nextLatex;
      patch.path = geometry.path;
      if (patch.viewBox === undefined) patch.viewBox = geometry.viewBox;
    }
    return updateElementAt(stores, found.slideIndex, found.elementIndex, patch) as PPTLatexElement;
  });
  register('elements.setOutline', (payload: {
    elementId: string | string[];
    slideId?: string;
    outline: PPTElementOutline;
  }) => {
    return toIdList(payload.elementId).map(id => updateStyleElement<OutlineElement>(stores, id, payload.slideId, OUTLINE_ELEMENT_TYPES, 'Outline', {
      outline: payload.outline
    } as Partial<PPTElement>));
  });
  register('elements.setShadow', (payload: {
    elementId: string | string[];
    slideId?: string;
    shadow: PPTElementShadow;
  }) => {
    return toIdList(payload.elementId).map(id => updateStyleElement<ShadowElement>(stores, id, payload.slideId, SHADOW_ELEMENT_TYPES, 'Shadow', {
      shadow: payload.shadow
    } as Partial<PPTElement>));
  });
  register('elements.setFill', (payload: {
    elementId: string | string[];
    slideId?: string;
    fill: string;
  }) => {
    return toIdList(payload.elementId).map(id => {
      const found = findElement(stores.slides.slides, id, payload.slideId, stores.slides.slideIndex);
      if (!FILL_ELEMENT_TYPES.includes(found.element.type as (typeof FILL_ELEMENT_TYPES)[number])) {
        throw new Error(`Fill is not supported for ${found.element.type} element: ${id}`);
      }
      const patch = found.element.type === 'shape' ? {
        fill: payload.fill,
        gradient: undefined,
        pattern: undefined
      } : {
        fill: payload.fill
      };
      return updateElementAt(stores, found.slideIndex, found.elementIndex, patch as Partial<PPTElement>) as FillElement;
    });
  });
  register('elements.setGradient', (payload: {
    elementId: string | string[];
    slideId?: string;
    gradient: Gradient;
  }) => {
    return toIdList(payload.elementId).map(id => updateStyleElement<PPTShapeElement>(stores, id, payload.slideId, ['shape'], 'Gradient', {
      gradient: payload.gradient,
      pattern: undefined
    } as Partial<PPTElement>));
  });
  register('elements.setColorMask', (payload: {
    elementId: string | string[];
    slideId?: string;
    colorMask: string;
  }) => {
    return toIdList(payload.elementId).map(id => updateStyleElement<PPTImageElement>(stores, id, payload.slideId, ['image'], 'Color mask', {
      colorMask: payload.colorMask
    } as Partial<PPTElement>));
  });
  const getTextElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'text') throw new Error(`Element is not text: ${elementId}`);
    return found as typeof found & {
      element: PPTTextElement;
    };
  };
  const updateTextElement = (elementId: string, slideId: string | undefined, patch: Partial<PPTTextElement>): PPTTextElement => {
    const found = getTextElement(elementId, slideId);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      ...patch,
      type: 'text'
    } as Partial<PPTElement>) as PPTTextElement;
  };
  register('text.list', (payload: {
    slideId?: string;
  } = {}) => {
    const {
      slide
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    return clonePlain(slide.elements.filter((element): element is PPTTextElement => element.type === 'text'));
  });
  register('text.get', (payload: {
    elementId: string;
    slideId?: string;
  }) => {
    const element = findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex).element;
    return element.type === 'text' ? clonePlain(element) : null;
  });
  register('text.create', async (payload: {
    slideId?: string;
    index?: number;
    content?: string;
    markdown?: string;
    element?: Partial<PPTTextElement>;
    select?: boolean;
  } = {}) => {
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    if (payload.element?.content == null && payload.content == null) warnLiteralHtml(payload.markdown, 'payload.markdown');
    const rawHtmlContent = payload.element?.content ?? payload.content;
    const resolvedContent = rawHtmlContent != null ? agentTextToHtmlBreaks(rawHtmlContent) : payload.markdown != null ? await markdownToHtml(payload.markdown) : '';
    const element = normalizeElement({
      ...payload.element,
      type: 'text',
      content: resolvedContent,
      defaultFontName: payload.element?.defaultFontName ?? stores.slides.theme.fontName ?? '',
      defaultColor: payload.element?.defaultColor ?? stores.slides.theme.fontColor ?? '#000000'
    }) as PPTTextElement;
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(payload.index, elements.length), 0, element);
    updateSlideAt(stores, slideIndex, {
      elements
    });
    if (payload.select !== false) stores.main.setActiveElementIdList([element.id]);
    return element;
  });
  register('text.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: Partial<PPTTextElement>;
  }) => {
    return updateTextElement(payload.elementId, payload.slideId, payload.patch);
  });
  register('text.delete', (payload: {
    elementId: string | string[];
    slideId?: string;
  }) => {
    const ids = toIdList(payload.elementId);
    const removalsBySlide = new Map<number, Set<string>>();
    for (const id of ids) {
      const found = getTextElement(id, payload.slideId);
      const removals = removalsBySlide.get(found.slideIndex) || new Set<string>();
      removals.add(id);
      removalsBySlide.set(found.slideIndex, removals);
    }
    for (const [slideIndex, removals] of removalsBySlide) {
      const slide = stores.slides.slides[slideIndex];
      if (!slide) throw new Error(`Slide index not found: ${slideIndex}`);
      updateSlideAt(stores, slideIndex, {
        elements: slide.elements.filter(element => !removals.has(element.id))
      });
    }
    stores.main.setActiveElementIdList(stores.main.activeElementIdList.filter(id => !ids.includes(id)));
    return {
      deleted: ids
    };
  });
  register('text.getContent', (payload: {
    elementId: string;
    slideId?: string;
  }) => {
    const element = findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex).element;
    return element.type === 'text' ? element.content : null;
  });
  register('text.setContent', (payload: {
    elementId: string;
    slideId?: string;
    content: string;
  }) => {
    return updateTextElement(payload.elementId, payload.slideId, {
      content: agentTextToHtmlBreaks(payload.content)
    });
  });
  register('text.setMarkdown', async (payload: {
    elementId: string;
    slideId?: string;
    markdown: string;
  }) => {
    warnLiteralHtml(payload.markdown, 'payload.markdown');
    return updateTextElement(payload.elementId, payload.slideId, {
      content: await markdownToHtml(payload.markdown)
    });
  });
  register('text.updateContent', (payload: {
    elementId: string;
    slideId?: string;
    content?: string;
    prepend?: string;
    append?: string;
  }) => {
    const {
      element
    } = getTextElement(payload.elementId, payload.slideId);
    const baseContent = payload.content != null ? agentTextToHtmlBreaks(payload.content) : element.content;
    const prepend = payload.prepend != null ? agentTextToHtmlBreaks(payload.prepend) : '';
    const append = payload.append != null ? agentTextToHtmlBreaks(payload.append) : '';
    return updateTextElement(payload.elementId, payload.slideId, {
      content: `${prepend}${baseContent}${append}`
    });
  });
  register('text.clearContent', (payload: {
    elementId: string;
    slideId?: string;
  }) => {
    return updateTextElement(payload.elementId, payload.slideId, {
      content: ''
    });
  });
  register('text.setStyle', (payload: {
    elementId: string;
    slideId?: string;
    style: Partial<PPTTextElement>;
  }) => {
    return updateTextElement(payload.elementId, payload.slideId, payload.style);
  });
  const getLineElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'line') throw new Error(`Element is not a line: ${elementId}`);
    return found as typeof found & {
      element: PPTLineElement;
    };
  };
  const updateLineElementAt = (elementId: string, slideId: string | undefined, patch: FikaLineElementPatch): PPTLineElement => {
    const found = getLineElement(elementId, slideId);
    const element = updateLineElement(found.element, patch as Partial<PPTLineElement>);
    return replaceElementAt(stores, found.slideIndex, found.elementIndex, element) as PPTLineElement;
  };
  register('lines.get', (payload: {
    elementId: string;
    slideId?: string;
  }) => {
    const element = findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex).element;
    return element.type === 'line' ? clonePlain(element) : null;
  });
  register('lines.create', (payload: FikaCreateLineElementInput) => {
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const element = normalizeLineElement(payload.element);
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(payload.index, elements.length), 0, element);
    updateSlideAt(stores, slideIndex, {
      elements
    });
    if (payload.select !== false) stores.main.setActiveElementIdList([element.id]);
    return element;
  });
  register('lines.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaLineElementPatch;
  }) => {
    return updateLineElementAt(payload.elementId, payload.slideId, payload.patch);
  });
  register('lines.setStyle', (payload: {
    elementId: string;
    slideId?: string;
    style: FikaLineStyleInput;
  }) => {
    return updateLineElementAt(payload.elementId, payload.slideId, payload.style);
  });
  register('lines.setArrowheads', (payload: {
    elementId: string;
    slideId?: string;
    points: PPTLineElement['points'];
  }) => {
    return updateLineElementAt(payload.elementId, payload.slideId, {
      points: payload.points
    });
  });
  register('lines.setDirection', (payload: {
    elementId: string;
    slideId?: string;
    direction?: FikaLineDirectionInput;
  }) => {
    const direction = payload.direction === 'auto' ? undefined : payload.direction;
    return updateLineElementAt(payload.elementId, payload.slideId, {
      broken2Direction: direction
    });
  });
  register('richText.setContent', (payload: {
    elementId: string;
    slideId?: string;
    content: string;
  }) => updateRichTextContent(payload));
  register('richText.setStyle', (payload: {
    elementId: string;
    slideId?: string;
    style: FikaRichTextStylePatch;
  }) => updateRichTextStyle(payload));
  register('richText.setParagraphAttrs', (payload: {
    elementId: string;
    slideId?: string;
    attrs: FikaRichTextParagraphAttrs;
  }) => updateRichTextParagraphAttrs(payload));
  register('animations.list', (payload: {
    slideId?: string;
    elementId?: string;
  } = {}) => listAnimations(stores, payload.slideId, payload.elementId));
  register('animations.catalog', () => animationCatalog());
  register('animations.sequence', (payload: {
    slideId?: string;
  } = {}) => sequenceAnimations(stores, payload.slideId));
  register('animations.create', (payload: {
    slideId: string;
    animation: Partial<PPTAnimation> & {
      elId: string;
      effect: string;
      type: PPTAnimation['type'];
    };
  }) => {
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    ensureElementOnSlide(slide, payload.animation.elId);
    const animation = normalizeAnimation(payload.animation);
    updateSlideAt(stores, index, {
      animations: [...(slide.animations || []), animation]
    });
    return animation;
  });
  register('animations.update', (payload: {
    slideId: string;
    animationId: string;
    patch: Partial<PPTAnimation>;
  }) => {
    return updateAnimationAt(stores, payload.slideId, payload.animationId, payload.patch);
  });
  register('animations.setTrigger', (payload: {
    slideId: string;
    animationId: string;
    trigger: PPTAnimation['trigger'];
  }) => {
    return updateAnimationAt(stores, payload.slideId, payload.animationId, {
      trigger: payload.trigger
    });
  });
  register('animations.setDuration', (payload: {
    slideId: string;
    animationId: string;
    duration: number;
  }) => {
    return updateAnimationAt(stores, payload.slideId, payload.animationId, {
      duration: payload.duration
    });
  });
  register('animations.delete', (payload: {
    slideId: string;
    animationId: string | string[];
  }) => {
    const ids = toIdList(payload.animationId);
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    for (const id of ids) {
      const animation = (slide.animations || []).find(item => item.id === id);
      if (!animation) throw new Error(`Animation not found: ${id}`);
      ensureElementOnSlide(slide, animation.elId);
    }
    updateSlideAt(stores, index, {
      animations: (slide.animations || []).filter(animation => !ids.includes(animation.id))
    });
    return {
      deleted: ids
    };
  });
  register('animations.reorder', (payload: {
    slideId: string;
    animationId: string;
    toIndex: number;
  }) => {
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const animations = clonePlain(slide.animations || []);
    const fromIndex = animations.findIndex(animation => animation.id === payload.animationId);
    if (fromIndex === -1) throw new Error(`Animation not found: ${payload.animationId}`);
    const [animation] = animations.splice(fromIndex, 1);
    if (!animation) throw new Error(`Animation not found: ${payload.animationId}`);
    animations.splice(insertIndex(payload.toIndex, animations.length), 0, animation);
    updateSlideAt(stores, index, {
      animations
    });
    return animations;
  });
  const tableElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'table') throw new Error(`Element is not a table: ${elementId}`);
    return found as typeof found & {
      element: PPTTableElement;
    };
  };
  register('tables.create', (payload: FikaCreateTableInput = {}) => {
    const {
      slideId,
      index,
      select,
      element: elementInput,
      ...tableInput
    } = payload;
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex);
    const elementPayload = {
      ...tableInput,
      ...(elementInput || {}),
      type: 'table'
    } as unknown as Partial<PPTTableElement> & {
      type: 'table';
    };
    const element = normalizeElement(elementPayload, stores.slides.theme) as PPTTableElement;
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(index, elements.length), 0, element);
    updateSlideAt(stores, slideIndex, {
      elements
    });
    if (select !== false) stores.main.setActiveElementIdList([element.id]);
    return element;
  });
  register('tables.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaTableElementPatch;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const patch = normalizeTableElementPatch(found.element, payload.patch);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, patch) as PPTTableElement;
  });
  register('tables.setCell', (payload: {
    elementId: string;
    slideId?: string;
    row: number;
    col: number;
    patch: Partial<TableCell>;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const {
      data,
      colWidths
    } = normalizeTableShape(found.element, clonePlain(found.element.data));
    const row = assertIndexInRange(payload.row, data.length, 'row');
    const col = assertIndexInRange(payload.col, data[row]?.length || 0, 'col');
    data[row][col] = {
      ...data[row][col],
      ...payload.patch
    };
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data,
      colWidths
    } as Partial<PPTElement>) as PPTTableElement;
  });
  register('tables.setCellStyle', (payload: {
    elementId: string;
    slideId?: string;
    row: number;
    col: number;
    style: Partial<TableCellStyle>;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const {
      data,
      colWidths
    } = normalizeTableShape(found.element, clonePlain(found.element.data));
    const row = assertIndexInRange(payload.row, data.length, 'row');
    const col = assertIndexInRange(payload.col, data[row]?.length || 0, 'col');
    data[row][col].style = {
      ...(data[row][col].style || {}),
      ...payload.style
    };
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data,
      colWidths
    } as Partial<PPTElement>) as PPTTableElement;
  });
  register('tables.insertRow', (payload: {
    elementId: string;
    slideId?: string;
    rowIndex: number;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const columnCount = Math.max(tableColumnCount(found.element), 1);
    const data = normalizeTableData(clonePlain(found.element.data), columnCount);
    data.splice(insertIndex(payload.rowIndex, data.length), 0, Array.from({
      length: columnCount
    }, () => createTableCell()));
    const colWidths = normalizeColWidths(found.element.colWidths, columnCount);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data,
      colWidths
    } as Partial<PPTElement>) as PPTTableElement;
  });
  register('tables.deleteRow', (payload: {
    elementId: string;
    slideId?: string;
    rowIndex: number;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const columnCount = tableColumnCount(found.element);
    const data = normalizeTableData(clonePlain(found.element.data), columnCount);
    if (!data.length) throw new Error('Table has no rows to delete');
    data.splice(assertIndexInRange(payload.rowIndex, data.length, 'rowIndex'), 1);
    const colWidths = normalizeColWidths(found.element.colWidths, columnCount);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data,
      colWidths
    } as Partial<PPTElement>) as PPTTableElement;
  });
  register('tables.insertColumn', (payload: {
    elementId: string;
    slideId?: string;
    colIndex: number;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const columnCount = tableColumnCount(found.element);
    const insertAt = insertIndex(payload.colIndex, columnCount);
    const data = normalizeTableData(clonePlain(found.element.data), columnCount);
    for (const row of data) row.splice(insertAt, 0, createTableCell());
    const colWidths = normalizeColWidths(found.element.colWidths, columnCount);
    colWidths.splice(insertAt, 0, columnCount > 0 ? 1 / columnCount : 1);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data,
      colWidths: normalizeColWidths(colWidths, columnCount + 1)
    } as Partial<PPTElement>) as PPTTableElement;
  });
  register('tables.deleteColumn', (payload: {
    elementId: string;
    slideId?: string;
    colIndex: number;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const columnCount = tableColumnCount(found.element);
    if (columnCount <= 0) throw new Error('Table has no columns to delete');
    const deleteAt = assertIndexInRange(payload.colIndex, columnCount, 'colIndex');
    const data = normalizeTableData(clonePlain(found.element.data), columnCount);
    for (const row of data) row.splice(deleteAt, 1);
    const colWidths = normalizeColWidths(found.element.colWidths, columnCount);
    colWidths.splice(deleteAt, 1);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data,
      colWidths: normalizeColWidths(colWidths, columnCount - 1)
    } as Partial<PPTElement>) as PPTTableElement;
  });
  register('tables.mergeCells', (payload: {
    elementId: string;
    slideId?: string;
    row: number;
    col: number;
    rowspan: number;
    colspan: number;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const {
      data,
      colWidths
    } = normalizeTableShape(found.element, clonePlain(found.element.data));
    const columnCount = tableColumnCount({
      ...found.element,
      data,
      colWidths
    });
    const row = assertIndexInRange(payload.row, data.length, 'row');
    const col = assertIndexInRange(payload.col, data[row]?.length || 0, 'col');
    assertPositiveNumber(payload.rowspan, 'rowspan');
    assertPositiveNumber(payload.colspan, 'colspan');
    const cell = data[row][col];
    const rowspan = Math.min(finiteSpan(payload.rowspan), data.length - row);
    const colspan = Math.min(finiteSpan(payload.colspan), columnCount - col);
    cell.rowspan = rowspan;
    cell.colspan = colspan;
    for (let rowIndex = row; rowIndex < row + rowspan; rowIndex++) {
      for (let colIndex = col; colIndex < col + colspan; colIndex++) {
        if (rowIndex === row && colIndex === col) continue;
        data[rowIndex][colIndex].rowspan = 1;
        data[rowIndex][colIndex].colspan = 1;
      }
    }
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data,
      colWidths
    } as Partial<PPTElement>) as PPTTableElement;
  });
  register('tables.splitCell', (payload: {
    elementId: string;
    slideId?: string;
    row: number;
    col: number;
  }) => {
    const found = tableElement(payload.elementId, payload.slideId);
    const {
      data,
      colWidths
    } = normalizeTableShape(found.element, clonePlain(found.element.data));
    const row = assertIndexInRange(payload.row, data.length, 'row');
    const col = assertIndexInRange(payload.col, data[row]?.length || 0, 'col');
    const origin = findMergedCellOrigin(data, row, col);
    if (!origin) throw new Error(`Table cell not found: ${row},${col}`);
    origin.cell.rowspan = 1;
    origin.cell.colspan = 1;
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data,
      colWidths
    } as Partial<PPTElement>) as PPTTableElement;
  });
  const chartElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'chart') throw new Error(`Element is not a chart: ${elementId}`);
    return found as typeof found & {
      element: PPTChartElement;
    };
  };
  const normalizeChartStringList = (value: unknown, field: 'labels' | 'legends') => {
    if (!Array.isArray(value)) throw new Error(`Chart ${field} must be an array`);
    return value.map((item, index) => {
      if (item === null || item === undefined) throw new Error(`Chart ${field}[${index}] is required`);
      return String(item);
    });
  };
  const normalizeChartSeriesRow = (value: unknown, path: string) => {
    if (!Array.isArray(value)) throw new Error(`Chart ${path} must be an array`);
    return Array.from(value, (item, index) => {
      const number = typeof item === 'number' ? item : Number(item);
      if (!Number.isFinite(number)) throw new Error(`Chart ${path}[${index}] must be a finite number`);
      return number;
    });
  };
  const normalizeChartSeries = (value: unknown) => {
    if (!Array.isArray(value)) throw new Error('Chart series must be an array');
    if (value.length === 0) throw new Error('Chart data must include at least one series');
    return Array.from(value, (item, index) => normalizeChartSeriesRow(item, `series[${index}]`));
  };
  const normalizeChartData = (data: ChartData) => ({
    labels: normalizeChartStringList(data.labels, 'labels'),
    legends: normalizeChartStringList(data.legends, 'legends'),
    series: normalizeChartSeries(data.series)
  });
  const normalizeSeriesIndex = (index: number, length: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= length) throw new Error(`Chart series index out of range: ${index}`);
    return index;
  };
  register('charts.create', (payload: FikaCreateChartInput = {}) => {
    const {
      slideId,
      index,
      select,
      ...chart
    } = payload;
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex);
    const data = chart.data ? normalizeChartData(chart.data) : normalizeChartData({
      labels: ['A', 'B'],
      legends: ['Series 1'],
      series: [[10, 20]]
    });
    const element = normalizeElement({
      ...chart,
      chartType: chart.chartType ?? 'bar',
      data,
      themeColors: chart.themeColors ?? stores.slides.theme.themeColors,
      textColor: resolveChartLabelColor({
        textColor: chart.textColor ?? stores.slides.theme.fontColor,
        fill: chart.fill
      }, {
        background: slide.background,
        fallbackSurface: stores.slides.theme.backgroundColor,
        fontColor: stores.slides.theme.fontColor
      }),
      lineColor: chart.lineColor ?? '#e8ecf4',
      type: 'chart'
    }, stores.slides.theme) as PPTChartElement;
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(index, elements.length), 0, element);
    updateSlideAt(stores, slideIndex, {
      elements
    });
    if (select !== false) stores.main.setActiveElementIdList([element.id]);
    return element;
  });
  register('charts.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaChartElementPatch;
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    const patch = clonePatch(payload.patch) as Partial<PPTChartElement>;
    if (patch.data !== undefined) patch.data = normalizeChartData(patch.data);
    if (patch.options !== undefined) patch.options = {
      ...(found.element.options || {}),
      ...patch.options
    };
    if (patch.outline !== undefined) patch.outline = patch.outline ? {
      ...(found.element.outline || stores.slides.theme.outline),
      ...patch.outline
    } : undefined;
    return updateElementAt(stores, found.slideIndex, found.elementIndex, patch as Partial<PPTElement>) as PPTChartElement;
  });
  register('charts.setType', (payload: {
    elementId: string;
    slideId?: string;
    chartType: ChartType;
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      chartType: payload.chartType
    } as Partial<PPTElement>) as PPTChartElement;
  });
  register('charts.setData', (payload: {
    elementId: string;
    slideId?: string;
    data: ChartData;
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data: normalizeChartData(payload.data)
    } as Partial<PPTElement>) as PPTChartElement;
  });
  register('charts.setLabels', (payload: {
    elementId: string;
    slideId?: string;
    labels: string[];
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    const data = normalizeChartData({
      ...found.element.data,
      labels: payload.labels
    });
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data
    } as Partial<PPTElement>) as PPTChartElement;
  });
  register('charts.setLegends', (payload: {
    elementId: string;
    slideId?: string;
    legends: string[];
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    const data = normalizeChartData({
      ...found.element.data,
      legends: payload.legends
    });
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data
    } as Partial<PPTElement>) as PPTChartElement;
  });
  register('charts.setSeries', (payload: {
    elementId: string;
    slideId?: string;
    index: number;
    series: number[];
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    const series = normalizeChartSeries(found.element.data.series);
    series[normalizeSeriesIndex(payload.index, series.length)] = normalizeChartSeriesRow(payload.series, `series[${payload.index}]`);
    const data = normalizeChartData({
      ...found.element.data,
      series
    });
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data
    } as Partial<PPTElement>) as PPTChartElement;
  });
  register('charts.addSeries', (payload: {
    elementId: string;
    slideId?: string;
    series: number[];
    legend?: string;
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    const series = normalizeChartSeries(found.element.data.series);
    series.push(normalizeChartSeriesRow(payload.series, `series[${series.length}]`));
    const legends = [...(found.element.data.legends || [])];
    if (legends.length === series.length - 1) legends.push(payload.legend || `Series ${series.length}`);
    const data = normalizeChartData({
      ...found.element.data,
      series,
      legends
    });
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data
    } as Partial<PPTElement>) as PPTChartElement;
  });
  register('charts.deleteSeries', (payload: {
    elementId: string;
    slideId?: string;
    index: number;
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    const series = normalizeChartSeries(found.element.data.series);
    if (series.length === 1) throw new Error('Chart data must include at least one series');
    const seriesIndex = normalizeSeriesIndex(payload.index, series.length);
    series.splice(seriesIndex, 1);
    const legends = [...(found.element.data.legends || [])];
    if (legends.length === series.length + 1) legends.splice(seriesIndex, 1);
    const data = normalizeChartData({
      ...found.element.data,
      series,
      legends
    });
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      data
    } as Partial<PPTElement>) as PPTChartElement;
  });
  register('charts.setOptions', (payload: {
    elementId: string;
    slideId?: string;
    options: ChartOptions;
  }) => {
    const found = chartElement(payload.elementId, payload.slideId);
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      options: clonePlain(payload.options)
    } as Partial<PPTElement>) as PPTChartElement;
  });
  const mediaSourceUrl = (asset: ReturnType<typeof resolveMediaAsset>): string | undefined => {
    const direct = asset.sourceUrl?.trim();
    if (direct) return direct;
    const meta = asset.metadata?.sourceUrl;
    return typeof meta === 'string' && meta.trim() ? meta.trim() : undefined;
  };
  const setImageSource = (payload: {
    elementId: string;
    slideId?: string;
    asset?: Parameters<typeof resolveMediaAsset>[0];
    src?: string;
    patch?: Partial<PPTImageElement>;
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    const asset = resolveMediaAsset(payload.asset ?? payload.src ?? '', 'image');
    const patch: Partial<PPTImageElement> = {
      ...payload.patch,
      src: asset.src
    };
    if (!('link' in (payload.patch || {}))) {
      const sourceUrl = mediaSourceUrl(asset);
      if (sourceUrl) {
        patch.link = normalizeElementLink({
          type: 'web',
          target: sourceUrl
        }, stores.slides.slides);
      }
    }
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, patch);
  };
  register('images.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: Partial<PPTImageElement>;
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, payload.patch);
  });
  register('images.setSource', setImageSource);
  register('media.resolveAsset', (payload: {
    asset: FikaMediaAssetInput;
    kind?: FikaMediaAssetKind;
  }) => resolveMediaAsset(payload.asset, payload.kind));
  register('media.setImageSource', setImageSource);
  const setMediaSource = <TElement extends MediaElement,>(payload: {
    elementId: string;
    slideId?: string;
    asset: FikaMediaAssetInput;
    patch?: MediaElementPatch;
  }, kind: FikaMediaAssetKind) => {
    const found = findElement(stores.slides.slides, payload.elementId, payload.slideId, stores.slides.slideIndex);
    if (found.element.type !== kind) throw new Error(`Element is not ${kind}: ${payload.elementId}`);
    const asset = resolveMediaAsset(payload.asset, kind);
    const patch = {
      ...(payload.patch || {}),
      src: asset.src,
      type: kind
    } as MediaElementPatch & {
      type: FikaMediaAssetKind;
      ext?: string;
      poster?: string;
    };
    if (kind !== 'image' && asset.ext && patch.ext === undefined) patch.ext = asset.ext;
    if ((kind === 'video' || kind === 'audio') && asset.poster && patch.poster === undefined) patch.poster = asset.poster;
    return updateElementAt(stores, found.slideIndex, found.elementIndex, patch as Partial<PPTElement>) as TElement;
  };
  register('media.setVideoSource', (payload: {
    elementId: string;
    slideId?: string;
    asset: FikaMediaAssetInput;
    patch?: Partial<PPTVideoElement>;
  }) => {
    return setMediaSource<PPTVideoElement>(payload, 'video');
  });
  register('media.setAudioSource', (payload: {
    elementId: string;
    slideId?: string;
    asset: FikaMediaAssetInput;
    patch?: Partial<PPTAudioElement>;
  }) => {
    return setMediaSource<PPTAudioElement>(payload, 'audio');
  });
  register('images.setClip', (payload: {
    elementId: string;
    slideId?: string;
    clip?: PPTImageElement['clip'];
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, payload.clip ? {
      clip: payload.clip
    } : {}, payload.clip ? [] : ['clip']);
  });
  register('images.setCrop', (payload: {
    elementId: string;
    slideId?: string;
    range: NonNullable<PPTImageElement['clip']>['range'];
    shape?: NonNullable<PPTImageElement['clip']>['shape'];
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    const clip = {
      ...(found.element.clip || {
        shape: 'rect',
        range: clonePlain(fullImageRange)
      }),
      range: clonePlain(payload.range),
      ...(payload.shape ? {
        shape: payload.shape
      } : {})
    };
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, {
      clip
    });
  });
  register('images.setMask', (payload: {
    elementId: string;
    slideId?: string;
    mask: {
      shape?: string;
      radius?: number;
      colorMask?: string;
    };
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    const patch: Partial<PPTImageElement> = {};
    const removeProps: Array<keyof PPTImageElement> = [];
    if ('shape' in payload.mask) {
      if (payload.mask.shape === undefined) removeProps.push('clip');else patch.clip = {
        ...(found.element.clip || {
          shape: 'rect',
          range: clonePlain(fullImageRange)
        }),
        shape: payload.mask.shape
      };
    }
    if ('radius' in payload.mask) {
      if (payload.mask.radius === undefined) removeProps.push('radius');else patch.radius = payload.mask.radius;
    }
    if ('colorMask' in payload.mask) {
      if (payload.mask.colorMask === undefined) removeProps.push('colorMask');else patch.colorMask = payload.mask.colorMask;
    }
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, patch, removeProps);
  });
  register('images.setRadius', (payload: {
    elementId: string;
    slideId?: string;
    radius?: PPTImageElement['radius'];
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, payload.radius === undefined ? {} : {
      radius: payload.radius
    }, payload.radius === undefined ? ['radius'] : []);
  });
  register('images.setFilters', (payload: {
    elementId: string;
    slideId?: string;
    filters?: PPTImageElement['filters'];
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, payload.filters === undefined ? {} : {
      filters: payload.filters
    }, payload.filters === undefined ? ['filters'] : []);
  });
  register('images.setFilter', (payload: {
    elementId: string;
    slideId?: string;
    key: ImageFilterKey;
    value?: string | number;
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    const filters = {
      ...(found.element.filters || {})
    };
    if (payload.value === undefined) delete filters[payload.key];else filters[payload.key] = imageFilterValue(payload.key, payload.value);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, {
      filters
    });
  });
  register('images.setOpacity', (payload: {
    elementId: string;
    slideId?: string;
    opacity: string | number;
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    const filters = {
      ...(found.element.filters || {}),
      opacity: imageFilterValue('opacity', payload.opacity)
    };
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, {
      filters
    });
  });
  register('images.setFlip', (payload: {
    elementId: string;
    slideId?: string;
    flip: Pick<PPTImageElement, 'flipH' | 'flipV'>;
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, payload.flip);
  });
  register('images.setShadow', (payload: {
    elementId: string;
    slideId?: string;
    shadow?: Partial<NonNullable<PPTImageElement['shadow']>>;
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    if (payload.shadow === undefined) return updateImageElementAt(stores, found.slideIndex, found.elementIndex, {}, ['shadow']);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, {
      shadow: {
        ...(found.element.shadow || stores.slides.theme.shadow),
        ...payload.shadow
      }
    });
  });
  register('images.setColorMask', (payload: {
    elementId: string;
    slideId?: string;
    colorMask?: string;
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, payload.colorMask === undefined ? {} : {
      colorMask: payload.colorMask
    }, payload.colorMask === undefined ? ['colorMask'] : []);
  });
  register('images.setImageType', (payload: {
    elementId: string;
    slideId?: string;
    imageType?: PPTImageElement['imageType'];
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    return updateImageElementAt(stores, found.slideIndex, found.elementIndex, payload.imageType === undefined ? {} : {
      imageType: payload.imageType
    }, payload.imageType === undefined ? ['imageType'] : []);
  });
  register('images.setAsBackground', (payload: {
    elementId: string;
    slideId?: string;
    options?: {
      slideId?: string;
      size?: NonNullable<SlideBackground['image']>['size'];
      deleteElement?: boolean;
    };
  }) => {
    const found = imageElement(stores, payload.elementId, payload.slideId);
    const targetSlideId = payload.options?.slideId || found.slide.id;
    const targetIndex = stores.slides.slides.findIndex(slide => slide.id === targetSlideId);
    if (targetIndex === -1) throw new Error(`Slide not found: ${targetSlideId}`);
    updateSlideAt(stores, targetIndex, {
      background: {
        ...stores.slides.slides[targetIndex].background,
        type: 'image',
        image: {
          src: found.element.src,
          size: payload.options?.size || 'cover'
        }
      }
    });
    if (payload.options?.deleteElement) {
      const source = stores.slides.slides[found.slideIndex];
      updateSlideAt(stores, found.slideIndex, {
        elements: source.elements.filter(element => element.id !== found.element.id)
      });
    }
    return clonePlain(stores.slides.slides[targetIndex]);
  });
  const videoElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'video') throw new Error(`Element is not a video: ${elementId}`);
    return found as typeof found & {
      element: PPTVideoElement;
    };
  };
  const videoAssetPatch = (asset: FikaMediaAssetInput): FikaVideoSourcePatch & Pick<FikaVideoPlaybackPatch, 'poster'> => {
    const resolved = resolveMediaAsset(asset, 'video');
    return omitUndefined({
      src: resolved.src,
      ext: resolved.ext,
      poster: resolved.poster
    }) as FikaVideoSourcePatch & Pick<FikaVideoPlaybackPatch, 'poster'>;
  };
  const updateVideoElement = (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaVideoPatch;
  }): PPTVideoElement => {
    const found = videoElement(payload.elementId, payload.slideId);
    const patch = omitUndefined(clonePatch(payload.patch)) as Partial<PPTVideoElement>;
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      ...patch,
      type: 'video'
    } as Partial<PPTElement>) as PPTVideoElement;
  };
  register('videos.get', (payload: {
    elementId: string;
    slideId?: string;
  }) => clonePlain(videoElement(payload.elementId, payload.slideId).element));
  register('videos.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaVideoPatch;
  }) => updateVideoElement(payload));
  register('videos.setSource', (payload: {
    elementId: string;
    slideId?: string;
    source: FikaVideoSourcePatch;
  }) => {
    return updateVideoElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: videoAssetPatch(payload.source)
    });
  });
  register('videos.setPlayback', (payload: {
    elementId: string;
    slideId?: string;
    playback: FikaVideoPlaybackPatch;
  }) => {
    return updateVideoElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: payload.playback
    });
  });
  register('videos.setAutoplay', (payload: {
    elementId: string;
    slideId?: string;
    autoplay: boolean;
  }) => {
    return updateVideoElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: {
        autoplay: payload.autoplay
      }
    });
  });
  register('videos.setPoster', (payload: {
    elementId: string;
    slideId?: string;
    poster: string;
  }) => {
    return updateVideoElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: {
        poster: payload.poster
      }
    });
  });
  register('videos.setSize', (payload: {
    elementId: string;
    slideId?: string;
    size: FikaVideoSizePatch;
  }) => {
    return updateVideoElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: payload.size
    });
  });
  register('videos.setPosition', (payload: {
    elementId: string;
    slideId?: string;
    position: FikaVideoPositionPatch;
  }) => {
    return updateVideoElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: payload.position
    });
  });
  const audioElement = (elementId: string, slideId?: string) => {
    const found = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex);
    if (found.element.type !== 'audio') throw new Error(`Element is not an audio: ${elementId}`);
    return found as typeof found & {
      element: PPTAudioElement;
    };
  };
  const audioAssetPatch = (source: FikaAudioSourceInput): Pick<PPTAudioElement, 'src'> & Partial<Pick<PPTAudioElement, 'ext'>> => {
    const resolved = resolveMediaAsset(source, 'audio');
    return omitUndefined({
      src: resolved.src,
      ext: resolved.ext
    }) as Pick<PPTAudioElement, 'src'> & Partial<Pick<PPTAudioElement, 'ext'>>;
  };
  const updateAudioElement = (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaAudioElementPatch;
  }): PPTAudioElement => {
    const found = audioElement(payload.elementId, payload.slideId);
    const patch = omitUndefined(normalizeAudioPatch(payload.patch)) as Partial<PPTAudioElement>;
    return updateElementAt(stores, found.slideIndex, found.elementIndex, {
      ...patch,
      type: 'audio'
    } as Partial<PPTElement>) as PPTAudioElement;
  };
  register('audio.get', (payload: {
    elementId: string;
    slideId?: string;
  }) => clonePlain(audioElement(payload.elementId, payload.slideId).element));
  register('audio.create', (payload: FikaCreateAudioInput) => {
    const {
      slide,
      index: slideIndex
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const element = normalizeAudioElement(payload, stores.slides.theme.themeColors[0] || '#4472c4');
    const elements = clonePlain(slide.elements);
    elements.splice(insertIndex(payload.index, elements.length), 0, element);
    updateSlideAt(stores, slideIndex, {
      elements
    });
    if (payload.select !== false) stores.main.setActiveElementIdList([element.id]);
    return element;
  });
  register('audio.update', (payload: {
    elementId: string;
    slideId?: string;
    patch: FikaAudioElementPatch;
  }) => updateAudioElement(payload));
  register('audio.setSource', (payload: {
    elementId: string;
    slideId?: string;
    source: FikaAudioSourceInput;
  }) => {
    return updateAudioElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: audioAssetPatch(payload.source)
    });
  });
  register('audio.setPlayback', (payload: {
    elementId: string;
    slideId?: string;
    playback: Pick<FikaAudioElementPatch, 'autoplay' | 'loop'>;
  }) => {
    return updateAudioElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: payload.playback
    });
  });
  register('audio.setIcon', (payload: {
    elementId: string;
    slideId?: string;
    icon: Pick<FikaAudioElementPatch, 'color' | 'fixedRatio'>;
  }) => {
    return updateAudioElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: payload.icon
    });
  });
  register('audio.transform', (payload: {
    elementId: string;
    slideId?: string;
    transform: FikaAudioTransformPatch;
  }) => {
    return updateAudioElement({
      elementId: payload.elementId,
      slideId: payload.slideId,
      patch: {
        transform: payload.transform
      }
    });
  });
  register('notes.create', (payload: {
    slideId: string;
    note: FikaNoteInput;
  }) => {
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const note = normalizeNote(payload.note);
    if (note.elId) ensureElementOnSlide(slide, note.elId);
    updateSlideAt(stores, index, {
      notes: [...(slide.notes || []), note]
    });
    return note;
  });
  register('notes.update', (payload: {
    slideId: string;
    noteId: string;
    patch: FikaNotePatch;
  }) => {
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const notes = clonePlain(slide.notes || []);
    const {
      noteIndex
    } = findNote(notes, payload.noteId);
    const patch = normalizeNotePatch(payload.patch);
    if (patch.elId) ensureElementOnSlide(slide, patch.elId);
    notes[noteIndex] = {
      ...notes[noteIndex],
      ...patch
    };
    updateSlideAt(stores, index, {
      notes
    });
    return notes[noteIndex];
  });
  register('notes.delete', (payload: {
    slideId: string;
    noteId: string | string[];
  }) => {
    const ids = toIdList(payload.noteId);
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    updateSlideAt(stores, index, {
      notes: (slide.notes || []).filter(note => !ids.includes(note.id))
    });
    return {
      deleted: ids
    };
  });
  register('notes.reply', (payload: {
    slideId: string;
    noteId: string;
    reply: FikaNoteReplyInput;
  }) => {
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const notes = clonePlain(slide.notes || []);
    const {
      note
    } = findNote(notes, payload.noteId);
    const reply = normalizeReply(payload.reply);
    note.replies = [...(note.replies || []), reply];
    updateSlideAt(stores, index, {
      notes
    });
    return reply;
  });
  register('notes.listReplies', (payload: {
    slideId: string;
    noteId: string;
  }) => {
    const {
      note
    } = findNote(ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex).slide.notes || [], payload.noteId);
    return clonePlain(note.replies || []);
  });
  register('notes.updateReply', (payload: {
    slideId: string;
    noteId: string;
    replyId: string;
    patch: Partial<NoteReply>;
  }) => {
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const notes = clonePlain(slide.notes || []);
    const {
      note
    } = findNote(notes, payload.noteId);
    const replies = clonePlain(note.replies || []);
    const {
      replyIndex
    } = findReply(replies, payload.replyId);
    const nextReply = {
      ...replies[replyIndex],
      ...clonePlain(payload.patch)
    };
    replies[replyIndex] = nextReply;
    note.replies = replies;
    updateSlideAt(stores, index, {
      notes
    });
    return nextReply;
  });
  register('notes.deleteReply', (payload: {
    slideId: string;
    noteId: string;
    replyId: string | string[];
  }) => {
    const ids = toIdList(payload.replyId);
    const {
      slide,
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    const notes = clonePlain(slide.notes || []);
    const {
      note
    } = findNote(notes, payload.noteId);
    const replies = clonePlain(note.replies || []);
    for (const id of ids) findReply(replies, id);
    note.replies = replies.filter(reply => !ids.includes(reply.id));
    updateSlideAt(stores, index, {
      notes
    });
    return {
      deleted: ids
    };
  });
  register('sections.list', () => listSectionRanges(stores.slides.slides));
  register('sections.set', (payload: {
    slideId: string;
    section: NonNullable<Slide['sectionTag']>;
  }) => {
    if (!payload.section?.id) throw new Error('Section id is required');
    const {
      index
    } = ensureSlide(stores.slides.slides, payload.slideId, stores.slides.slideIndex);
    for (const slide of stores.slides.slides) {
      if (slide.id !== payload.slideId && slide.sectionTag?.id === payload.section.id) {
        stores.slides.removeSlideProps({ id: slide.id, propName: 'sectionTag' });
      }
    }
    return updateSlideAt(stores, index, { sectionTag: clonePlain(payload.section) });
  });
  register('sections.clear', (payload: {
    sectionIdOrSlideId?: string;
    slideId?: string;
    sectionId?: string;
  }) => {
    const sectionIdOrSlideId = payload.sectionIdOrSlideId || payload.sectionId || payload.slideId;
    if (!sectionIdOrSlideId) throw new Error('Section id or slide id is required');
    const range = findSectionRange(stores.slides.slides, sectionIdOrSlideId);
    stores.slides.removeSlideProps({ id: stores.slides.slides[range.startIndex].id, propName: 'sectionTag' });
    return clonePlain(stores.slides.slides[range.startIndex]);
  });
  register('sections.rename', (payload: {
    sectionId: string;
    title: string;
  }) => {
    const range = findSectionRange(stores.slides.slides, payload.sectionId);
    updateSlideAt(stores, range.startIndex, {
      sectionTag: {
        ...range.section,
        title: payload.title
      }
    });
    return clonePlain(stores.slides.slides.slice(range.startIndex, range.endIndex + 1));
  });
  register('sections.delete', (payload: {
    sectionId: string;
  }) => {
    const range = findSectionRange(stores.slides.slides, payload.sectionId);
    if (range.slideIds.length >= stores.slides.slides.length) throw new Error('Cannot delete every slide through a section range');
    stores.slides.deleteSlide(range.slideIds);
    stores.main.setActiveElementIdList([]);
    return {
      deleted: range.slideIds
    };
  });
  register('sections.assignRange', (payload: {
    startIndex: number;
    endIndex: number;
    section: NonNullable<Slide['sectionTag']>;
  }) => {
    if (!payload.section?.id) throw new Error('Section id is required');
    const startIndex = fromApiSlideIndex(payload.startIndex, stores.slides.slides.length, 'startIndex');
    const endIndex = fromApiSlideIndex(payload.endIndex, stores.slides.slides.length, 'endIndex');
    const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const section = clonePlain(payload.section);
    for (let index = 0; index < stores.slides.slides.length; index++) {
      const slide = stores.slides.slides[index];
      if (slide.sectionTag?.id === section.id && index !== from) {
        stores.slides.removeSlideProps({ id: slide.id, propName: 'sectionTag' });
      }
    }
    for (let index = from; index <= to; index++) {
      if (index === from) updateSlideAt(stores, index, { sectionTag: section });
      else if (stores.slides.slides[index].sectionTag) stores.slides.removeSlideProps({ id: stores.slides.slides[index].id, propName: 'sectionTag' });
    }
    return clonePlain(stores.slides.slides.slice(from, to + 1));
  });
  register('sections.move', (payload: {
    sectionId: string;
    toIndex: number;
  }) => {
    const range = findSectionRange(stores.slides.slides, payload.sectionId);
    const targetIndex = fromApiInsertSlideIndex(payload.toIndex, stores.slides.slides.length, 'toIndex');
    if (targetIndex >= range.startIndex && targetIndex <= range.endIndex + 1) return clonePlain(stores.slides.slides);
    const slides = stores.slides.slides.slice();
    const movingSlides = slides.splice(range.startIndex, range.slideIds.length);
    const adjustedIndex = targetIndex > range.startIndex ? targetIndex - movingSlides.length : targetIndex;
    slides.splice(insertIndex(adjustedIndex, slides.length), 0, ...movingSlides);
    stores.slides.setSlides(slides, undefined, { clone: false });
    stores.slides.updateSlideIndex(clampIndex(adjustedIndex, slides.length));
    return clonePlain(slides);
  });
  register('search.find', (payload: {
    query: string;
    options?: FikaSearchOptions;
  }): FikaSearchResults => {
    const pattern = searchPattern(payload.query, payload.options);
    const results: FikaSearchResult[] = [];
    for (const slide of stores.slides.slides) {
      for (const element of slide.elements) {
        if (element.type === 'text') {
          results.push(...findTextMatches(element.content, pattern, {
            slideId: slide.id,
            elementId: element.id,
            elementType: element.type,
            path: 'content'
          }));
        } else if (element.type === 'shape' && element.text?.content) {
          results.push(...findTextMatches(element.text.content, pattern, {
            slideId: slide.id,
            elementId: element.id,
            elementType: element.type,
            path: 'text.content'
          }));
        } else if (element.type === 'table') {
          element.data.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
            results.push(...findTextMatches(cell.text, pattern, {
              slideId: slide.id,
              elementId: element.id,
              elementType: element.type,
              path: `data.${rowIndex}.${colIndex}.text`,
              row: rowIndex,
              col: colIndex
            }));
          }));
        }
      }
    }
    return {
      count: results.length,
      results
    };
  });
  register('search.replace', (payload: {
    query: string;
    replacement: string;
    options?: FikaReplaceOptions;
  }): FikaSearchResults => {
    const pattern = searchPattern(payload.query, payload.options);
    const slides = clonePlain(stores.slides.slides);
    const results: FikaSearchResult[] = [];
    const replace = (value: string, baseResult: Omit<FikaSearchResult, 'match' | 'start' | 'end'>) => {
      const replaced = replaceTextMatches(value, pattern, payload.replacement, payload.options, baseResult, localCount => results.length + localCount > 0);
      results.push(...replaced.results);
      return replaced.text;
    };
    for (const slide of slides) {
      for (const element of slide.elements) {
        if (element.type === 'text') {
          element.content = replace(element.content, {
            slideId: slide.id,
            elementId: element.id,
            elementType: element.type,
            path: 'content'
          });
        } else if (element.type === 'shape' && element.text?.content) {
          element.text.content = replace(element.text.content, {
            slideId: slide.id,
            elementId: element.id,
            elementType: element.type,
            path: 'text.content'
          });
        } else if (element.type === 'table') {
          element.data.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
            cell.text = replace(cell.text, {
              slideId: slide.id,
              elementId: element.id,
              elementType: element.type,
              path: `data.${rowIndex}.${colIndex}.text`,
              row: rowIndex,
              col: colIndex
            });
          }));
        }
      }
    }
    if (results.length) stores.slides.setSlides(slides);
    return {
      count: results.length,
      results
    };
  });
  register('history.commit', async () => getState(stores, documentVersion));
  register('history.undo', async () => {
    await stores.snapshot.unDo();
    return getState(stores, documentVersion);
  });
  register('history.redo', async () => {
    await stores.snapshot.reDo();
    return getState(stores, documentVersion);
  });
  register('view.goToSlide', (payload: {
    slideIdOrIndex: FikaSlideReference;
  }) => {
    selectSlide(stores, payload.slideIdOrIndex);
    return getState(stores, documentVersion);
  });
  register('view.nextSlide', () => {
    applySlideSelection(stores, stores.slides.slideIndex + 1);
    return getState(stores, documentVersion);
  });
  register('view.previousSlide', () => {
    applySlideSelection(stores, stores.slides.slideIndex - 1);
    return getState(stores, documentVersion);
  });
  register('view.setZoom', (payload: {
    scale: number;
  }) => {
    stores.main.setCanvasScale(payload.scale);
    return getState(stores, documentVersion);
  });
  register('view.enterPresentation', () => {
    beginScreening();
    return getState(stores, documentVersion);
  });
  register('view.exitPresentation', () => {
    exitScreening();
    return getState(stores, documentVersion);
  });
  register('view.setLocale', async (payload: {
    locale: Parameters<typeof applyLocale>[0];
  }) => {
    await (options.setLocale || applyLocale)(payload.locale);
    return {
      locale: payload.locale
    };
  });
  const executeHistoryCommit = async <TData = unknown,>(command: FikaAgentCommand): Promise<FikaCommandResult<TData>> => {
    if (destroyed) return failResult(command, new Error('Fika controller has been destroyed')) as FikaCommandResult<TData>;
    const before = captureRuntimeState(stores);
    const beforeDocumentVersion = documentVersion;
    try {
      if (command.meta?.dryRun || command.meta?.commit === false) {
        const result = makeResult(command, false, getState(stores, documentVersion));
        emit({
          type: 'commandApplied',
          command,
          result
        });
        return result as FikaCommandResult<TData>;
      }
      const nextSnapshotId = await commitSnapshot(command);
      const result = makeResult(command, true, getState(stores, documentVersion));
      result.snapshotId = nextSnapshotId;
      emit({
        type: 'commandApplied',
        command,
        result
      });
      return result as FikaCommandResult<TData>;
    } catch (error) {
      restoreRuntimeState(stores, before);
      documentVersion = beforeDocumentVersion;
      const result = failResult(command, error);
      emit({
        type: 'commandFailed',
        command,
        result
      });
      return result as FikaCommandResult<TData>;
    }
  };
  const executeHistoryTraversal = async <TData = unknown,>(command: FikaAgentCommand, direction: 'undo' | 'redo'): Promise<FikaCommandResult<TData>> => {
    if (destroyed) return failResult(command, new Error('Fika controller has been destroyed')) as FikaCommandResult<TData>;
    const canTraverse = direction === 'undo' ? stores.snapshot.canUndo : stores.snapshot.canRedo;
    if (!canTraverse) {
      const result = makeResult(command, false, getState(stores, documentVersion));
      emit({
        type: 'commandApplied',
        command,
        result
      });
      return result as FikaCommandResult<TData>;
    }
    const before = captureRuntimeState(stores);
    const beforeDocumentVersion = documentVersion;
    try {
      if (direction === 'undo') await stores.snapshot.unDo();else await stores.snapshot.reDo();
      if (command.meta?.dryRun) restoreRuntimeState(stores, before);else documentVersion++;
      const result = makeResult(command, !command.meta?.dryRun, getState(stores, documentVersion));
      if (result.changed) emitDocumentChanged(command);
      emit({
        type: 'commandApplied',
        command,
        result
      });
      return result as FikaCommandResult<TData>;
    } catch (error) {
      restoreRuntimeState(stores, before);
      documentVersion = beforeDocumentVersion;
      const result = failResult(command, error);
      emit({
        type: 'commandFailed',
        command,
        result
      });
      return result as FikaCommandResult<TData>;
    }
  };
  const execute = async <TData = unknown,>(command: FikaAgentCommand): Promise<FikaCommandResult<TData>> => {
    if (destroyed) return failResult(command, new Error('Fika controller has been destroyed')) as FikaCommandResult<TData>;
    const failure = commandTypeFailure(command);
    if (failure) {
      const result = failure;
      emit({
        type: 'commandFailed',
        command,
        result
      });
      return result as FikaCommandResult<TData>;
    }
    const descriptor = registry.get(command.type)!;
    if (command.type === 'history.commit') return executeHistoryCommit(command);
    if (command.type === 'history.undo') return executeHistoryTraversal(command, 'undo');
    if (command.type === 'history.redo') return executeHistoryTraversal(command, 'redo');
    const changed = command.type === 'search.replace' ? (data: TData) => (data as FikaSearchResults).count > 0 : command.type === 'deck.applyStyle' || command.type === 'deck.planComposition' ? (data: TData) => !(data as {
      skipped?: boolean;
    })?.skipped : descriptor.mutates;
    return withMutation<TData>(command, () => descriptor.handler(command.payload, command) as TData | Promise<TData>, changed, {
      commit: changesDocument(command),
      emitDocumentChanged: changesDocument(command),
      version: changesDocument(command)
    });
  };
  const executeBatch = async (commands: FikaAgentCommand[], batchOptions: FikaBatchOptions = {}) => {
    if (destroyed) return commands.map(command => failResult(command, new Error('Fika controller has been destroyed')));
    const before = captureRuntimeState(stores);
    const beforeDocumentVersion = documentVersion;
    const beforeLastAnchor = lastAnchor;
    const batchDryRun = batchOptions.dryRun === true;
    const atomic = batchOptions.atomic !== false;
    const results: FikaCommandResult[] = [];
    for (let index = 0; index < commands.length; index++) {
      const command = commands[index];
      const descriptor = registry.get(command.type);
      const commandBefore = captureRuntimeState(stores);
      const commandBeforeLastAnchor = lastAnchor;
      const commandDryRun = command.meta?.dryRun === true && !batchDryRun;
      let result: FikaCommandResult;
      const commandFailure = commandTypeFailure(command);
      if (commandFailure || !descriptor) {
        result = commandFailure || failResult(command, new AgenticCommandError('UnsupportedCommand', `Unsupported command: ${command.type}`, 'type'));
      } else {
        const warnings: FikaCommandIssue[] = [];
        const previousWarnings = currentWarnings;
        currentWarnings = warnings;
        try {
          const data = await descriptor.handler(command.payload, {
            ...command,
            meta: {
              ...command.meta,
              commit: false,
              dryRun: batchDryRun || command.meta?.dryRun
            }
          });
          const skippedBootstrap = (command.type === 'deck.applyStyle' || command.type === 'deck.planComposition') && (data as {
            skipped?: boolean;
          })?.skipped;
          const changed = command.type === 'search.replace' ? (data as FikaSearchResults).count > 0 : skippedBootstrap ? false : descriptor.mutates;
          const blocking = warnings.find(w => w.recoverable === false && w.code === 'SlideQualityError');
          if (blocking && changed && !batchDryRun && !commandDryRun) {
            restoreRuntimeState(stores, commandBefore);
            lastAnchor = commandBeforeLastAnchor;
            result = makeResult(command, false, data, false, warnings);
            result.errors = [blocking];
          } else {
            result = makeResult(command, changed && !batchDryRun && !commandDryRun, data, !blocking, warnings);
            if (blocking) result.errors = [blocking];
          }
          if (commandDryRun) {
            restoreRuntimeState(stores, commandBefore);
            lastAnchor = commandBeforeLastAnchor;
          }
          if (destroyed) {
            restoreRuntimeState(stores, before);
            lastAnchor = beforeLastAnchor;
            documentVersion = beforeDocumentVersion;
            const destroyedResults = commands.map(command => failResult(command, new Error('Fika controller has been destroyed')));
            for (const result of destroyedResults) result.documentVersion = documentVersion;
            return destroyedResults;
          }
        } catch (error) {
          restoreRuntimeState(stores, commandBefore);
          lastAnchor = commandBeforeLastAnchor;
          result = failResult(command, error);
        } finally {
          currentWarnings = previousWarnings;
        }
      }
      results.push(result);
      if (!result.ok && atomic) {
        restoreRuntimeState(stores, before);
        lastAnchor = beforeLastAnchor;
        for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
          if (results[resultIndex].changed) results[resultIndex] = markRolledBack(results[resultIndex]);
        }
        for (const skippedCommand of commands.slice(index + 1)) results.push(skippedResult(skippedCommand));
        break;
      }
    }
    if (batchDryRun) {
      restoreRuntimeState(stores, before);
      lastAnchor = beforeLastAnchor;
    }
    const documentChangedResults = results.filter((result, index) => result.changed && !!commands[index] && changesDocument(commands[index]));
    documentVersion = beforeDocumentVersion;
    if (documentChangedResults.length) {
      const batchCommand: FikaAgentCommand = {
        type: 'batch.commit',
        meta: {
          label: 'Batch command commit'
        }
      };
      try {
        let batchSnapshotId: number | undefined;
        if (batchOptions.commit !== false) {
          batchSnapshotId = await commitSnapshot(batchCommand);
        }
        documentVersion++;
        if (batchSnapshotId !== undefined) {
          for (const result of documentChangedResults) result.snapshotId = batchSnapshotId;
        }
        if (!destroyed) emitDocumentChanged(batchCommand);
      } catch (error) {
        restoreRuntimeState(stores, before);
        lastAnchor = beforeLastAnchor;
        documentVersion = beforeDocumentVersion;
        for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
          if (results[resultIndex].changed) {
            results[resultIndex] = markRolledBack(results[resultIndex]);
            results[resultIndex].warnings = [...(results[resultIndex].warnings || []), createIssue('BatchSnapshotFailed', 'Rolled back because the batch snapshot could not be committed.', undefined, true)];
          }
        }
        results.push(failResult(batchCommand, error));
      }
    }
    for (const result of results) {
      result.documentVersion = documentVersion;
      syncDataDocumentVersion(result.data);
    }
    for (let index = 0; index < results.length; index++) {
      if (!destroyed) emit({
        type: results[index].ok ? 'commandApplied' : 'commandFailed',
        command: commands[index],
        result: results[index]
      });
    }
    return results;
  };
  const canExecute = (command: FikaAgentCommand): FikaAgentCapability => {
    if (destroyed) return {
      ok: false,
      reason: 'Controller has been destroyed'
    };
    const failure = commandTypeFailure(command);
    if (failure) return {
      ok: false,
      reason: failure.errors?.[0]?.message || `Unsupported command: ${command.type}`
    };
    return {
      ok: true
    };
  };
  const command = <TData,>(type: FikaCommandType, payload?: unknown, meta?: FikaCommandMeta) => execute<TData>({
    type,
    payload,
    meta
  });
  const updateElementSubtype = async <TElement extends PPTElement,>(type: TElement['type'], elementId: string, patch: Partial<TElement>, meta?: FikaCommandMeta & {
    slideId?: string;
  }): Promise<FikaCommandResult<TElement>> => {
    const result = await command<PPTElement[]>('elements.update', {
      elementId,
      slideId: meta?.slideId,
      patch: {
        ...clonePatch(patch),
        type
      }
    }, meta);
    return {
      ...result,
      data: result.data?.[0] as TElement | undefined
    };
  };
  const api: FikaAgentApi = {
    getState: () => getState(stores, documentVersion),
    execute,
    executeBatch,
    canExecute,
    subscribe(listener) {
      if (destroyed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    markdownToHtml: markdown => markdownToHtml(markdown),
    docs: () => clonePlain(AGENTIC_DOCS),
    domains: () => listAgenticDomains(registry),
    describe: commandType => describeAgenticCommand(registry, commandType),
    guides: guideId => {
      if (!guideId) return clonePlain(AGENTIC_DOCS.guides);
      return clonePlain(AGENTIC_DOCS.guides.find(guide => guide.id === guideId) ?? null);
    },
    deck: {
      get: () => documentFromStores(stores),
      set: (document, meta) => command('deck.set', document, meta),
      patch: (patch, meta) => command('deck.patch', patch, meta),
      setTitle: (title, meta) => command('deck.setTitle', {
        title
      }, meta),
      getTheme: () => clonePlain(stores.slides.theme),
      setTheme: (theme, meta) => command('deck.setTheme', {
        theme
      }, meta),
      applyTemplate: (templateId, meta) => command('deck.applyTemplate', {
        templateId
      }, meta),
      applyStyle: (styleId, meta) => command('deck.applyStyle', {
        styleId
      }, meta),
      planComposition: (input, meta) => command('deck.planComposition', input, meta),
      setup: (input, meta) => command('deck.setup', input, meta),
      applyTheme: (theme, options, meta) => command('deck.applyTheme', {
        theme,
        options
      }, meta),
      extractTheme: options => extractThemeFromDeck(stores, options),
      setViewport: (viewport, meta) => command('deck.setViewport', viewport, meta),
      setTemplates: (templates, meta) => command('deck.setTemplates', {
        templates
      }, meta)
    },
    slides: {
      list: () => clonePlain(stores.slides.slides),
      get: slideIdOrIndex => {
        const found = readSlide(stores, slideIdOrIndex);
        return found ? clonePlain(found.slide) : null;
      },
      current: () => {
        const found = readSlide(stores);
        return found ? clonePlain(found.slide) : null;
      },
      read: (slideIdOrIndex, meta) => command('slides.read', {
        slideIdOrIndex
      }, meta),
      create: (input, meta) => command('slides.create', input, meta),
      createFromLayout: (input, meta) => command('slides.createFromLayout', input, meta),
      insertFromTemplate: (input, meta) => command('slides.insertFromTemplate', input, meta),
      insert: (input, meta) => command('slides.insert', input, meta),
      update: (slideId, patch, meta) => command('slides.update', {
        slideId,
        patch
      }, meta),
      delete: (slideId, meta) => command('slides.delete', {
        slideId
      }, meta),
      duplicate: (slideIdOrIndex, meta) => command('slides.duplicate', {
        slideIdOrIndex
      }, meta),
      move: (slideIdOrIndex, toIndex, meta) => command('slides.move', {
        slideIdOrIndex,
        toIndex
      }, meta),
      select: (slideIdOrIndex, meta) => command('slides.select', {
        slideIdOrIndex
      }, meta),
      setBackground: (slideId, background, meta) => command('slides.setBackground', {
        slideId,
        background
      }, meta),
      applyBackground: (background, slideIds, meta) => command('slides.applyBackground', {
        background,
        slideIds
      }, meta),
      applyBackgroundToAll: (background, meta) => command('slides.applyBackgroundToAll', {
        background
      }, meta),
      getTransition: slideId => {
        const {
          slide
        } = ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex);
        return {
          slideId: slide.id,
          turningMode: slide.turningMode
        };
      },
      setTransition: (slideId, turningMode, meta) => command('slides.setTransition', {
        slideId,
        turningMode
      }, meta),
      getRemark: slideId => (slideId ? ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex).slide : stores.slides.currentSlide)?.remark || '',
      setRemark: (slideId, remark, meta) => command('slides.setRemark', {
        slideId,
        remark
      }, meta)
    },
    templates: {
      catalog: () => listTemplateCatalog(),
      slidesCatalog: (templateId, meta) => command('templates.slidesCatalog', {
        templateId
      }, meta)
    },
    styles: {
      catalog: () => listStylePresets()
    },
    layouts: {
      catalog: () => listLayouts()
    },
    elements: {
      list: slideId => clonePlain(ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex).slide.elements),
      get: (elementId, slideId) => clonePlain(findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element),
      create: (input, meta) => command('elements.create', input, meta),
      insert: (input, meta) => command('elements.insert', input, meta),
      update: (elementId, patch, meta) => command('elements.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      setTransform: (elementId, transform, meta) => command('elements.setTransform', {
        elementId,
        slideId: meta?.slideId,
        transform
      }, meta),
      move: (elementId, position, meta) => command('elements.move', {
        elementId,
        slideId: meta?.slideId,
        position
      }, meta),
      resize: (elementId, size, meta) => command('elements.resize', {
        elementId,
        slideId: meta?.slideId,
        size
      }, meta),
      rotate: (elementId, rotate, meta) => command('elements.rotate', {
        elementId,
        slideId: meta?.slideId,
        rotate
      }, meta),
      setOpacity: (elementId, opacity, meta) => command('elements.setOpacity', {
        elementId,
        slideId: meta?.slideId,
        opacity
      }, meta),
      setFlip: (elementId, flip, meta) => command('elements.setFlip', {
        elementId,
        slideId: meta?.slideId,
        flip
      }, meta),
      delete: (elementId, meta) => command('elements.delete', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      reorder: (elementId, toIndex, meta) => command('elements.reorder', {
        elementId,
        slideId: meta?.slideId,
        toIndex
      }, meta),
      bringForward: (elementId, meta) => command('elements.bringForward', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      sendBackward: (elementId, meta) => command('elements.sendBackward', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      bringToFront: (elementId, meta) => command('elements.bringToFront', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      sendToBack: (elementId, meta) => command('elements.sendToBack', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      select: (elementId, meta) => command('elements.select', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      selectGroup: (groupIdOrElementId, meta) => command('elements.selectGroup', {
        groupIdOrElementId,
        slideId: meta?.slideId
      }, meta),
      clearSelection: meta => command('elements.clearSelection', undefined, meta),
      setHandle: (elementId, meta) => command('elements.setHandle', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      group: (elementIds, groupId, meta) => command('elements.group', {
        elementIds,
        groupId,
        slideId: meta?.slideId
      }, meta),
      ungroup: (groupIdOrElementId, meta) => command('elements.ungroup', {
        groupIdOrElementId,
        slideId: meta?.slideId
      }, meta),
      lock: (elementId, locked, meta) => command('elements.lock', {
        elementId,
        locked
      }, meta),
      unlock: (elementId, meta) => command('elements.unlock', {
        elementId
      }, meta),
      hide: (elementId, hidden, meta) => command('elements.hide', {
        elementId,
        hidden,
        slideId: meta?.slideId
      }, meta),
      show: (elementId, meta) => command('elements.show', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      setLink: (elementId, link, meta) => command('elements.setLink', {
        elementId,
        slideId: meta?.slideId,
        link
      }, meta),
      setOutline: (elementId, outline, meta) => command('elements.setOutline', {
        elementId,
        slideId: meta?.slideId,
        outline
      }, meta),
      setShadow: (elementId, shadow, meta) => command('elements.setShadow', {
        elementId,
        slideId: meta?.slideId,
        shadow
      }, meta),
      setFill: (elementId, fill, meta) => command('elements.setFill', {
        elementId,
        slideId: meta?.slideId,
        fill
      }, meta),
      setGradient: (elementId, gradient, meta) => command('elements.setGradient', {
        elementId,
        slideId: meta?.slideId,
        gradient
      }, meta),
      setColorMask: (elementId, colorMask, meta) => command('elements.setColorMask', {
        elementId,
        slideId: meta?.slideId,
        colorMask
      }, meta)
    },
    text: {
      list: slideId => {
        const {
          slide
        } = ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex);
        return clonePlain(slide.elements.filter((element): element is PPTTextElement => element.type === 'text'));
      },
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'text' ? clonePlain(element) : null;
      },
      create: (input, meta) => command('text.create', input, meta),
      update: (elementId, patch, meta) => command('text.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      delete: (elementId, meta) => command('text.delete', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      getContent: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'text' ? element.content : null;
      },
      setContent: (elementId, content, meta) => command('text.setContent', {
        elementId,
        slideId: meta?.slideId,
        content
      }, meta),
      setMarkdown: (elementId, markdown, meta) => command('text.setMarkdown', {
        elementId,
        slideId: meta?.slideId,
        markdown
      }, meta),
      updateContent: (elementId, update, meta) => command('text.updateContent', {
        elementId,
        slideId: meta?.slideId,
        ...update
      }, meta),
      clearContent: (elementId, meta) => command('text.clearContent', {
        elementId,
        slideId: meta?.slideId
      }, meta),
      setStyle: (elementId, style, meta) => command('text.setStyle', {
        elementId,
        slideId: meta?.slideId,
        style
      }, meta)
    },
    shapes: {
      presets: categoryKey => listShapePresets(categoryKey),
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'shape' ? clonePlain(element) : null;
      },
      create: (input = {}, meta) => command('shapes.create', input, meta),
      patch: (elementId, patch, meta) => command('shapes.patch', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      update: (elementId, patch, meta) => command('shapes.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      setPath: (elementId, path, options, meta) => command('shapes.setPath', {
        elementId,
        slideId: meta?.slideId,
        path,
        ...(options || {})
      }, meta),
      setFormula: (elementId, pathFormula, keypoints, meta) => command('shapes.setFormula', {
        elementId,
        slideId: meta?.slideId,
        pathFormula,
        keypoints
      }, meta),
      setFill: (elementId, fill, meta) => command('shapes.setFill', {
        elementId,
        slideId: meta?.slideId,
        fill
      }, meta),
      setOutline: (elementId, outline, meta) => command('shapes.setOutline', {
        elementId,
        slideId: meta?.slideId,
        outline
      }, meta),
      setText: (elementId, text, meta) => command('shapes.setText', {
        elementId,
        slideId: meta?.slideId,
        text
      }, meta)
    },
    lines: {
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'line' ? clonePlain(element) : null;
      },
      create: (input, meta) => command('lines.create', input, meta),
      update: (elementId, patch, meta) => command('lines.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      setStyle: (elementId, style, meta) => command('lines.setStyle', {
        elementId,
        slideId: meta?.slideId,
        style
      }, meta),
      setArrowheads: (elementId, points, meta) => command('lines.setArrowheads', {
        elementId,
        slideId: meta?.slideId,
        points
      }, meta),
      setDirection: (elementId, direction, meta) => command('lines.setDirection', {
        elementId,
        slideId: meta?.slideId,
        direction
      }, meta)
    },
    element: {
      text: (elementId, patch, meta) => updateElementSubtype<PPTTextElement>('text', elementId, patch, meta),
      setTextContent: (elementId, content, meta) => command('richText.setContent', {
        elementId,
        slideId: meta?.slideId,
        content
      }, meta),
      setTextStyle: (elementId, style, meta) => command('richText.setStyle', {
        elementId,
        slideId: meta?.slideId,
        style
      }, meta),
      setParagraphAttrs: (elementId, attrs, meta) => command('richText.setParagraphAttrs', {
        elementId,
        slideId: meta?.slideId,
        attrs
      }, meta),
      image: (elementId, patch, meta) => updateElementSubtype<PPTImageElement>('image', elementId, patch, meta),
      shape: (elementId, patch, meta) => command('shapes.patch', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      line: (elementId, patch, meta) => command('lines.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      chart: (elementId, patch, meta) => command('charts.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      table: (elementId, patch, meta) => updateElementSubtype<PPTTableElement>('table', elementId, patch, meta),
      latex: (elementId, patch, meta) => command('latex.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      video: (elementId, patch, meta) => updateElementSubtype<PPTVideoElement>('video', elementId, patch, meta),
      audio: (elementId, patch, meta) => updateElementSubtype<PPTAudioElement>('audio', elementId, patch, meta)
    },
    animations: {
      list: (slideId, elementId) => listAnimations(stores, slideId, elementId),
      catalog: () => animationCatalog(),
      sequence: slideId => sequenceAnimations(stores, slideId),
      create: (slideId, animation, meta) => command('animations.create', {
        slideId,
        animation
      }, meta),
      update: (slideId, animationId, patch, meta) => command('animations.update', {
        slideId,
        animationId,
        patch
      }, meta),
      setTrigger: (slideId, animationId, trigger, meta) => command('animations.setTrigger', {
        slideId,
        animationId,
        trigger
      }, meta),
      setDuration: (slideId, animationId, duration, meta) => command('animations.setDuration', {
        slideId,
        animationId,
        duration
      }, meta),
      delete: (slideId, animationId, meta) => command('animations.delete', {
        slideId,
        animationId
      }, meta),
      reorder: (slideId, animationId, toIndex, meta) => command('animations.reorder', {
        slideId,
        animationId,
        toIndex
      }, meta)
    },
    tables: {
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'table' ? clonePlain(element) : null;
      },
      create: (input, meta) => command('tables.create', input, meta),
      update: (elementId, patch, meta) => command('tables.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      setCell: (elementId, row, col, patch, meta) => command('tables.setCell', {
        elementId,
        row,
        col,
        patch,
        slideId: meta?.slideId
      }, meta),
      setCellStyle: (elementId, row, col, style, meta) => command('tables.setCellStyle', {
        elementId,
        row,
        col,
        style,
        slideId: meta?.slideId
      }, meta),
      insertRow: (elementId, rowIndex, meta) => command('tables.insertRow', {
        elementId,
        rowIndex,
        slideId: meta?.slideId
      }, meta),
      deleteRow: (elementId, rowIndex, meta) => command('tables.deleteRow', {
        elementId,
        rowIndex,
        slideId: meta?.slideId
      }, meta),
      insertColumn: (elementId, colIndex, meta) => command('tables.insertColumn', {
        elementId,
        colIndex,
        slideId: meta?.slideId
      }, meta),
      deleteColumn: (elementId, colIndex, meta) => command('tables.deleteColumn', {
        elementId,
        colIndex,
        slideId: meta?.slideId
      }, meta),
      mergeCells: (elementId, row, col, rowspan, colspan, meta) => command('tables.mergeCells', {
        elementId,
        row,
        col,
        rowspan,
        colspan,
        slideId: meta?.slideId
      }, meta),
      splitCell: (elementId, row, col, meta) => command('tables.splitCell', {
        elementId,
        row,
        col,
        slideId: meta?.slideId
      }, meta)
    },
    charts: {
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'chart' ? clonePlain(element) : null;
      },
      create: (input, meta) => command('charts.create', input, meta),
      update: (elementId, patch, meta) => command('charts.update', {
        elementId,
        patch,
        slideId: meta?.slideId
      }, meta),
      setType: (elementId, chartType, meta) => command('charts.setType', {
        elementId,
        chartType,
        slideId: meta?.slideId
      }, meta),
      setData: (elementId, data, meta) => command('charts.setData', {
        elementId,
        data,
        slideId: meta?.slideId
      }, meta),
      setLabels: (elementId, labels, meta) => command('charts.setLabels', {
        elementId,
        labels,
        slideId: meta?.slideId
      }, meta),
      setLegends: (elementId, legends, meta) => command('charts.setLegends', {
        elementId,
        legends,
        slideId: meta?.slideId
      }, meta),
      setSeries: (elementId, index, series, meta) => command('charts.setSeries', {
        elementId,
        index,
        series,
        slideId: meta?.slideId
      }, meta),
      addSeries: (elementId, series, meta) => command('charts.addSeries', {
        elementId,
        series,
        legend: meta?.legend,
        slideId: meta?.slideId
      }, meta),
      deleteSeries: (elementId, index, meta) => command('charts.deleteSeries', {
        elementId,
        index,
        slideId: meta?.slideId
      }, meta),
      setOptions: (elementId, options, meta) => command('charts.setOptions', {
        elementId,
        options,
        slideId: meta?.slideId
      }, meta)
    },
    images: {
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'image' ? clonePlain(element) : null;
      },
      update: (elementId, patch, meta) => command('images.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      setSource: (elementId, asset, patch, meta) => command('images.setSource', {
        elementId,
        slideId: meta?.slideId,
        asset,
        patch
      }, meta),
      setClip: (elementId, clip, meta) => command('images.setClip', {
        elementId,
        slideId: meta?.slideId,
        clip
      }, meta),
      setCrop: (elementId, range, shape, meta) => command('images.setCrop', {
        elementId,
        slideId: meta?.slideId,
        range,
        shape
      }, meta),
      setMask: (elementId, mask, meta) => command('images.setMask', {
        elementId,
        slideId: meta?.slideId,
        mask
      }, meta),
      setRadius: (elementId, radius, meta) => command('images.setRadius', {
        elementId,
        slideId: meta?.slideId,
        radius
      }, meta),
      setFilters: (elementId, filters, meta) => command('images.setFilters', {
        elementId,
        slideId: meta?.slideId,
        filters
      }, meta),
      setFilter: (elementId, key, value, meta) => command('images.setFilter', {
        elementId,
        slideId: meta?.slideId,
        key,
        value
      }, meta),
      setOpacity: (elementId, opacity, meta) => command('images.setOpacity', {
        elementId,
        slideId: meta?.slideId,
        opacity
      }, meta),
      setFlip: (elementId, flip, meta) => command('images.setFlip', {
        elementId,
        slideId: meta?.slideId,
        flip
      }, meta),
      setShadow: (elementId, shadow, meta) => command('images.setShadow', {
        elementId,
        slideId: meta?.slideId,
        shadow
      }, meta),
      setColorMask: (elementId, colorMask, meta) => command('images.setColorMask', {
        elementId,
        slideId: meta?.slideId,
        colorMask
      }, meta),
      setImageType: (elementId, imageType, meta) => command('images.setImageType', {
        elementId,
        slideId: meta?.slideId,
        imageType
      }, meta),
      setAsBackground: (elementId, options, meta) => command('images.setAsBackground', {
        elementId,
        slideId: meta?.slideId,
        options
      }, meta)
    },
    media: {
      resolveAsset: (asset, kind) => resolveMediaAsset(asset, kind),
      setImageSource: (elementId, asset, patch, meta) => command('media.setImageSource', {
        elementId,
        slideId: meta?.slideId,
        asset,
        patch
      }, meta),
      setVideoSource: (elementId, asset, patch, meta) => command('media.setVideoSource', {
        elementId,
        slideId: meta?.slideId,
        asset,
        patch
      }, meta),
      setAudioSource: (elementId, asset, patch, meta) => command('media.setAudioSource', {
        elementId,
        slideId: meta?.slideId,
        asset,
        patch
      }, meta)
    },
    videos: {
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'video' ? clonePlain(element) : null;
      },
      update: (elementId, patch, meta) => command('videos.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      setSource: (elementId, source, meta) => command('videos.setSource', {
        elementId,
        slideId: meta?.slideId,
        source
      }, meta),
      setPlayback: (elementId, playback, meta) => command('videos.setPlayback', {
        elementId,
        slideId: meta?.slideId,
        playback
      }, meta),
      setAutoplay: (elementId, autoplay, meta) => command('videos.setAutoplay', {
        elementId,
        slideId: meta?.slideId,
        autoplay
      }, meta),
      setPoster: (elementId, poster, meta) => command('videos.setPoster', {
        elementId,
        slideId: meta?.slideId,
        poster
      }, meta),
      setSize: (elementId, size, meta) => command('videos.setSize', {
        elementId,
        slideId: meta?.slideId,
        size
      }, meta),
      setPosition: (elementId, position, meta) => command('videos.setPosition', {
        elementId,
        slideId: meta?.slideId,
        position
      }, meta)
    },
    audio: {
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'audio' ? clonePlain(element) : null;
      },
      create: (input, meta) => command('audio.create', input, meta),
      update: (elementId, patch, meta) => command('audio.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta),
      setSource: (elementId, source, meta) => command('audio.setSource', {
        elementId,
        slideId: meta?.slideId,
        source
      }, meta),
      setPlayback: (elementId, playback, meta) => command('audio.setPlayback', {
        elementId,
        slideId: meta?.slideId,
        playback
      }, meta),
      setIcon: (elementId, icon, meta) => command('audio.setIcon', {
        elementId,
        slideId: meta?.slideId,
        icon
      }, meta),
      transform: (elementId, transform, meta) => command('audio.transform', {
        elementId,
        slideId: meta?.slideId,
        transform
      }, meta)
    },
    latex: {
      get: (elementId, slideId) => {
        const element = findElement(stores.slides.slides, elementId, slideId, stores.slides.slideIndex).element;
        return element.type === 'latex' ? clonePlain(element) : null;
      },
      create: (input, meta) => command('latex.create', input, meta),
      update: (elementId, patch, meta) => command('latex.update', {
        elementId,
        slideId: meta?.slideId,
        patch
      }, meta)
    },
    links: {
      set: (elementId, link, meta) => command('elements.setLink', {
        elementId,
        slideId: meta?.slideId,
        link
      }, meta),
      remove: (elementId, meta) => command('elements.setLink', {
        elementId,
        slideId: meta?.slideId,
        link: undefined
      }, meta)
    },
    notes: {
      list: slideId => clonePlain(ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex).slide.notes || []),
      create: (slideId, note, meta) => command('notes.create', {
        slideId,
        note
      }, meta),
      update: (slideId, noteId, patch, meta) => command('notes.update', {
        slideId,
        noteId,
        patch
      }, meta),
      delete: (slideId, noteId, meta) => command('notes.delete', {
        slideId,
        noteId
      }, meta),
      reply: (slideId, noteId, reply, meta) => command('notes.reply', {
        slideId,
        noteId,
        reply
      }, meta),
      listReplies: (slideId, noteId) => {
        const {
          note
        } = findNote(ensureSlide(stores.slides.slides, slideId, stores.slides.slideIndex).slide.notes || [], noteId);
        return clonePlain(note.replies || []);
      },
      updateReply: (slideId, noteId, replyId, patch, meta) => command('notes.updateReply', {
        slideId,
        noteId,
        replyId,
        patch
      }, meta),
      deleteReply: (slideId, noteId, replyId, meta) => command('notes.deleteReply', {
        slideId,
        noteId,
        replyId
      }, meta)
    },
    sections: {
      set: (slideId, section, meta) => command('sections.set', {
        slideId,
        section
      }, meta),
      clear: (sectionIdOrSlideId, meta) => command('sections.clear', {
        sectionIdOrSlideId
      }, meta),
      rename: (sectionId, title, meta) => command('sections.rename', {
        sectionId,
        title
      }, meta),
      delete: (sectionId, meta) => command('sections.delete', {
        sectionId
      }, meta),
      assignRange: (startIndex, endIndex, section, meta) => command('sections.assignRange', {
        startIndex,
        endIndex,
        section
      }, meta),
      move: (sectionId, toIndex, meta) => command('sections.move', {
        sectionId,
        toIndex
      }, meta),
      list: () => listSectionRanges(stores.slides.slides)
    },
    search: {
      find: (query, options) => command('search.find', {
        query,
        options
      }),
      replace: (query, replacement, options, meta) => command('search.replace', {
        query,
        replacement,
        options
      }, meta)
    },
    history: {
      commit: label => command('history.commit', {
        label
      }, {
        commit: true
      }),
      undo: () => command('history.undo'),
      redo: () => command('history.redo')
    },
    view: {
      getState: () => getState(stores, documentVersion),
      setLocale: locale => command('view.setLocale', {
        locale
      }),
      goToSlide: (slideIdOrIndex, meta) => command('view.goToSlide', {
        slideIdOrIndex
      }, meta),
      nextSlide: meta => command('view.nextSlide', undefined, meta),
      previousSlide: meta => command('view.previousSlide', undefined, meta),
      setZoom: (scale, meta) => command('view.setZoom', {
        scale
      }, meta),
      enterPresentation: () => command('view.enterPresentation'),
      exitPresentation: () => command('view.exitPresentation')
    },
    import: {
      json: (document, meta) => command('import.json', {
        document,
        mode: meta?.mode,
        cover: meta?.cover,
        confirm: meta?.confirm
      }, meta),
      fika: (document, meta) => command('import.fika', {
        document,
        mode: meta?.mode,
        cover: meta?.cover,
        confirm: meta?.confirm
      }, meta),
      pptxSafe: (document, meta) => command('import.pptxSafe', {
        document,
        mode: meta?.mode,
        cover: meta?.cover,
        confirm: meta?.confirm
      }, meta)
    },
    export: {
      json: () => documentFromStores(stores)
    }
  };
  const emitSelectionChanged = () => {
    if (!listeners.size) return;
    emit({
      type: 'selectionChanged',
      data: getState(stores, documentVersion)
    });
  };
  stopHandles.push(useMainStore.subscribe(emitSelectionChanged), useSlidesStore.subscribe(emitSelectionChanged), useScreenStore.subscribe(emitSelectionChanged));
  return {
    api,
    stop() {
      if (destroyed) return;
      destroyed = true;
      for (const stop of stopHandles) stop();
      stopHandles.length = 0;
      try {
        emit({
          type: 'destroyed'
        });
      } finally {
        listeners.clear();
        options.unmount?.();
      }
    }
  };
}
