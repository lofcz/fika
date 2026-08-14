import { nanoid } from 'nanoid';
import { hfmath } from '@/components/LaTeXEditor/hfmath';
import { getChartDefaultData } from '@/configs/chart';
import { DEFAULT_CODE_FONT_SIZE, DEFAULT_CODE_LANGUAGE, DEFAULT_CODE_THEME, measureCodeElementSize, resolveCodeLanguage, resolveCodeTheme } from '@/configs/code';
import { MIME_MAP } from '@/configs/mime';
import { SHAPE_PATH_FORMULAS } from '@/configs/shapes';
import type { Broken2LineDirection, LinePoint, LineStyleType, ChartType, Note, NoteReply, PPTAnimation, PPTAudioElement, PPTChartElement, PPTCodeElement, PPTElement, PPTElementLink, PPTLatexElement, PPTLineElement, PPTShapeElement, PPTTableElement, PPTTextElement, Slide, SlideTheme, TableCell, TableCellStyle } from '@/types/slides';
import type { FikaAudioElementPatch, FikaCommandIssue, FikaCommandType, FikaCreateAudioInput, FikaElementTransformPatch, FikaLatexElementInput, FikaMediaAsset, FikaMediaAssetInput, FikaMediaAssetKind, FikaNoteInput, FikaNotePatch, FikaNoteReplyInput, FikaTableElementPatch } from './types';
import { assertColorFields, assertElementCreateInput, assertElementDimensions, assertElementType, assertId, assertIdList, assertInsertIndex, assertOptionalId, assertPositiveNumber, assertString } from './validators';
import { DEFAULT_THEME_COLORS } from '@/configs/theme';
import { DEFAULT_TABLE_CELL_MIN_HEIGHT, DEFAULT_TABLE_CELL_WIDTH, DEFAULT_TABLE_COL_COUNT, DEFAULT_TABLE_OUTLINE, DEFAULT_TABLE_ROW_COUNT, DEFAULT_TABLE_THEME } from '@/configs/table';
const CANONICAL_COMMAND_TYPE_RE = /^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/;
const DEFAULT_CHART_THEME_COLORS = [...DEFAULT_THEME_COLORS];
const DEFAULT_CHART_TEXT_COLOR = '#333';
const DEFAULT_CHART_LINE_COLOR = '#e8ecf4';
const DEFAULT_LATEX_COLOR = '#000000';
const DEFAULT_LATEX_STROKE_WIDTH = 2;
const IMAGE_MIME_MAP: Record<string, string> = {
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/x-icon': 'ico'
};
const MEDIA_MIME_TO_EXT: Record<string, string> = {
  ...MIME_MAP,
  ...IMAGE_MIME_MAP
};
const MEDIA_EXT_TO_MIME: Record<string, string> = {};
for (const [mimeType, ext] of Object.entries(MEDIA_MIME_TO_EXT)) {
  MEDIA_EXT_TO_MIME[ext] = mimeType;
}
MEDIA_EXT_TO_MIME.aiff = 'audio/x-aiff';
MEDIA_EXT_TO_MIME.jpeg = 'image/jpeg';
MEDIA_EXT_TO_MIME.m4a = 'audio/mp4';
MEDIA_EXT_TO_MIME.m4v = 'video/mp4';
MEDIA_EXT_TO_MIME.midi = 'audio/midi';
MEDIA_EXT_TO_MIME.mp3 = 'audio/mpeg';
MEDIA_EXT_TO_MIME.ogg = 'audio/ogg';
MEDIA_EXT_TO_MIME.svg = 'image/svg+xml';
export function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function clonePatch<T extends object>(patch: T): T {
  const source = patch as Record<string, unknown>;
  const cloned: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const value = source[key];
    cloned[key] = value === undefined ? undefined : clonePlain(value);
  }
  return cloned as T;
}
export function createId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}
export function createIssue(code: string, message: string, path?: string, recoverable = false): FikaCommandIssue {
  return {
    code,
    message,
    path,
    recoverable
  };
}
export function normalizeMediaExt(ext?: string): string | undefined {
  const normalized = ext?.trim().replace(/^\./, '').toLowerCase();
  return normalized || undefined;
}
export function inferMediaExtFromMime(mimeType?: string): string | undefined {
  const normalized = mimeType?.trim().toLowerCase();
  return normalized ? MEDIA_MIME_TO_EXT[normalized] : undefined;
}
export function inferMediaMimeFromExt(ext?: string): string | undefined {
  const normalized = normalizeMediaExt(ext);
  return normalized ? MEDIA_EXT_TO_MIME[normalized] : undefined;
}
function inferDataUrlMime(src: string): string | undefined {
  const match = /^data:([^;,]+)/i.exec(src.trim());
  return match?.[1]?.toLowerCase();
}
function mediaPathFromSrc(src: string): string {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('data:')) return '';
  try {
    return new URL(trimmed, 'http://fika.local').pathname;
  } catch {
    return trimmed.split(/[?#]/)[0];
  }
}
export function inferMediaExtFromSrc(src: string, mimeType?: string): string | undefined {
  const extFromMime = inferMediaExtFromMime(mimeType || inferDataUrlMime(src));
  if (extFromMime) return extFromMime;
  const path = mediaPathFromSrc(src).replace(/\\/g, '/');
  const filename = path.split('/').pop() || '';
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return normalizeMediaExt(match?.[1]);
}
export function inferMediaMimeFromSrc(src: string, ext?: string): string | undefined {
  return inferDataUrlMime(src) || inferMediaMimeFromExt(ext || inferMediaExtFromSrc(src));
}
export function resolveMediaAsset(asset: FikaMediaAssetInput, kind?: FikaMediaAssetKind): FikaMediaAsset {
  const source = typeof asset === 'string' ? asset : asset.src;
  if (typeof source !== 'string' || !source.trim()) throw new Error('Media asset src is required');
  const sourceAsset: Partial<FikaMediaAsset> = typeof asset === 'string' ? {} : clonePlain(asset);
  const src = source.trim();
  const explicitExt = normalizeMediaExt(sourceAsset.ext);
  const ext = explicitExt || inferMediaExtFromSrc(src, sourceAsset.mimeType) || (sourceAsset.filename ? inferMediaExtFromSrc(sourceAsset.filename, sourceAsset.mimeType) : undefined);
  const mimeType = sourceAsset.mimeType?.trim().toLowerCase() || inferMediaMimeFromSrc(src, ext) || (sourceAsset.filename ? inferMediaMimeFromSrc(sourceAsset.filename, ext) : undefined);
  return clonePlain({
    ...sourceAsset,
    src,
    ...(kind || sourceAsset.kind ? {
      kind: kind || sourceAsset.kind
    } : {}),
    ...(ext ? {
      ext
    } : {}),
    ...(mimeType ? {
      mimeType
    } : {})
  } as FikaMediaAsset);
}
export function isCanonicalCommandType(type: string): type is FikaCommandType {
  return CANONICAL_COMMAND_TYPE_RE.test(type);
}
export type IdMap = Record<string, string>;
export interface ElementCloneOptions {
  animationIdMap?: IdMap;
  elementIdMap?: IdMap;
  groupIdMap?: IdMap;
  offset?: number | {
    left?: number;
    top?: number;
  };
  preserveExternalSlideLinks?: boolean;
  slideIdMap?: IdMap;
}
export interface ClonedElements {
  elements: PPTElement[];
  animations: PPTAnimation[];
  elementIdMap: IdMap;
  groupIdMap: IdMap;
  animationIdMap: IdMap;
}
export interface ClonedSlides extends ClonedElements {
  slides: Slide[];
  slideIdMap: IdMap;
}
export function toIdList(id: string | string[]): string[] {
  return assertIdList(id);
}
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  if (length <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), length - 1));
}
export function insertIndex(index: number | undefined, length: number): number {
  return assertInsertIndex(index, length);
}
export function ensureSlide(slides: Slide[], slideId?: string, fallbackIndex = 0): {
  slide: Slide;
  index: number;
} {
  const requiredSlideId = assertOptionalId(slideId, 'slideId');
  if (requiredSlideId) {
    const index = slides.findIndex(slide => slide.id === requiredSlideId);
    if (index === -1) throw new Error(`Slide not found: ${requiredSlideId}`);
    return {
      slide: slides[index],
      index
    };
  }
  const index = clampIndex(fallbackIndex, slides.length);
  const slide = slides[index];
  if (!slide) throw new Error('No slide is available');
  return {
    slide,
    index
  };
}
export function findElement(slides: Slide[], elementId: string, slideId?: string, fallbackIndex = 0) {
  const requiredElementId = assertId(elementId, 'elementId');
  const requiredSlideId = assertOptionalId(slideId, 'slideId');
  if (requiredSlideId) {
    const {
      slide,
      index
    } = ensureSlide(slides, requiredSlideId, fallbackIndex);
    const elementIndex = slide.elements.findIndex(element => element.id === requiredElementId);
    if (elementIndex === -1) throw new Error(`Element not found: ${requiredElementId}`);
    return {
      slide,
      slideIndex: index,
      element: slide.elements[elementIndex],
      elementIndex
    };
  }
  for (let slideIndex = 0; slideIndex < slides.length; slideIndex++) {
    const slide = slides[slideIndex];
    const elementIndex = slide.elements.findIndex(element => element.id === requiredElementId);
    if (elementIndex !== -1) return {
      slide,
      slideIndex,
      element: slide.elements[elementIndex],
      elementIndex
    };
  }
  throw new Error(`Element not found: ${requiredElementId}`);
}
export function ensureElementOnSlide(slide: Slide, elementId: string): void {
  const requiredElementId = assertId(elementId, 'elementId');
  if (!slide.elements.some(element => element.id === requiredElementId)) {
    throw new Error(`Element not found on slide ${slide.id}: ${requiredElementId}`);
  }
}
export function createSlideIdMap(slides: Slide[]): IdMap {
  return slides.reduce<IdMap>((map, slide) => {
    map[slide.id] = createId('slide');
    return map;
  }, {});
}
export function createElementIdMap(elements: PPTElement[]): {
  elementIdMap: IdMap;
  groupIdMap: IdMap;
} {
  return elements.reduce<{
    elementIdMap: IdMap;
    groupIdMap: IdMap;
  }>((maps, element) => {
    maps.elementIdMap[element.id] = createId('el');
    if (element.groupId && !maps.groupIdMap[element.groupId]) {
      maps.groupIdMap[element.groupId] = createId('group');
    }
    return maps;
  }, {
    elementIdMap: {},
    groupIdMap: {}
  });
}
function cloneLink(link: PPTElementLink | undefined, slideIdMap: IdMap, preserveExternalSlideLinks: boolean): PPTElementLink | undefined {
  if (!link) return undefined;
  if (link.type !== 'slide') return clonePlain(link);
  const target = slideIdMap[link.target];
  if (target) return {
    ...clonePlain(link),
    target
  };
  return preserveExternalSlideLinks ? clonePlain(link) : undefined;
}
export function normalizeElementLink(link: PPTElementLink | undefined, slides: Slide[]): PPTElementLink | undefined {
  if (!link) return undefined;
  const target = assertString(link.target, 'link.target').trim();
  if (!target) throw new Error('Link target is required');
  if (link.type === 'web') {
    try {
      const url = new URL(target);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('Invalid URL');
    } catch {
      throw new Error(`Invalid web link URL: ${target}`);
    }
    return {
      type: 'web',
      target
    };
  }
  if (link.type === 'slide') {
    if (!slides.some(slide => slide.id === target)) throw new Error(`Slide link target not found: ${target}`);
    return {
      type: 'slide',
      target
    };
  }
  throw new Error(`Unsupported link type: ${(link as PPTElementLink).type}`);
}
export interface SlideLinkReference {
  slideId: string;
  elementId: string;
  target: string;
}
export function findSlideLinkReferences(slides: Slide[], targetIds?: Set<string>): SlideLinkReference[] {
  const references: SlideLinkReference[] = [];
  for (const slide of slides) {
    for (const element of slide.elements) {
      if (element.link?.type !== 'slide') continue;
      if (targetIds && !targetIds.has(element.link.target)) continue;
      references.push({
        slideId: slide.id,
        elementId: element.id,
        target: element.link.target
      });
    }
  }
  return references;
}
export function remapElementSlideLinks(elements: PPTElement[], slideIdMap: Map<string, string> | IdMap): number {
  let remapped = 0;
  for (const element of elements) {
    if (element.link?.type !== 'slide') continue;
    const target = slideIdMap instanceof Map ? slideIdMap.get(element.link.target) : slideIdMap[element.link.target];
    if (!target) continue;
    element.link = {
      ...element.link,
      target
    };
    remapped++;
  }
  return remapped;
}
function offsetFor(options: ElementCloneOptions): {
  left: number;
  top: number;
} {
  if (typeof options.offset === 'number') return {
    left: options.offset,
    top: options.offset
  };
  return {
    left: options.offset?.left ?? 0,
    top: options.offset?.top ?? 0
  };
}
export function cloneElementsWithRemappedIds(elements: PPTElement[], animations: PPTAnimation[] = [], options: ElementCloneOptions = {}): ClonedElements {
  const baseMaps = createElementIdMap(elements);
  const elementIdMap = {
    ...baseMaps.elementIdMap,
    ...options.elementIdMap
  };
  const groupIdMap = {
    ...baseMaps.groupIdMap,
    ...options.groupIdMap
  };
  const animationIdMap = {
    ...(options.animationIdMap || {})
  };
  const slideIdMap = options.slideIdMap || {};
  const preserveExternalSlideLinks = options.preserveExternalSlideLinks ?? true;
  const offset = offsetFor(options);
  const clonedElements = elements.map(source => {
    const element = clonePlain(source);
    element.id = elementIdMap[source.id] || createId('el');
    element.left += offset.left;
    element.top += offset.top;
    if (element.groupId) element.groupId = groupIdMap[element.groupId] || createId('group');
    const link = cloneLink(element.link, slideIdMap, preserveExternalSlideLinks);
    if (link) element.link = link;else delete element.link;
    return element;
  });
  const clonedAnimations = animations.flatMap(source => {
    const elId = elementIdMap[source.elId];
    if (!elId) return [];
    const animation = clonePlain(source);
    animation.id = animationIdMap[source.id] || createId('anim');
    animation.elId = elId;
    animationIdMap[source.id] = animation.id;
    return [animation];
  });
  return {
    elements: clonedElements,
    animations: clonedAnimations,
    elementIdMap,
    groupIdMap,
    animationIdMap
  };
}
export function cloneSlidesWithRemappedIds(slides: Slide[], options: {
  preserveExternalSlideLinks?: boolean;
  slideIdMap?: IdMap;
} = {}): ClonedSlides {
  const slideIdMap = {
    ...createSlideIdMap(slides),
    ...options.slideIdMap
  };
  const elementIdMap: IdMap = {};
  const groupIdMap: IdMap = {};
  const animationIdMap: IdMap = {};
  const clonedSlides = slides.map(source => {
    const cloned = clonePlain(source);
    const clonedElements = cloneElementsWithRemappedIds(cloned.elements, cloned.animations || [], {
      animationIdMap,
      elementIdMap,
      groupIdMap,
      preserveExternalSlideLinks: options.preserveExternalSlideLinks ?? false,
      slideIdMap
    });
    Object.assign(elementIdMap, clonedElements.elementIdMap);
    Object.assign(groupIdMap, clonedElements.groupIdMap);
    Object.assign(animationIdMap, clonedElements.animationIdMap);
    const notes = cloned.notes?.map(note => {
      const nextNote = {
        ...clonePlain(note),
        id: createId('note')
      };
      if (nextNote.elId) {
        if (clonedElements.elementIdMap[nextNote.elId]) nextNote.elId = clonedElements.elementIdMap[nextNote.elId];else delete nextNote.elId;
      }
      if (nextNote.replies) {
        nextNote.replies = nextNote.replies.map(reply => ({
          ...clonePlain(reply),
          id: createId('reply')
        }));
      }
      return nextNote;
    });
    return normalizeSlide({
      ...cloned,
      id: slideIdMap[source.id],
      elements: clonedElements.elements,
      animations: clonedElements.animations,
      ...(notes ? {
        notes
      } : {})
    });
  });
  return {
    slides: clonedSlides,
    slideIdMap,
    elementIdMap,
    groupIdMap,
    animationIdMap,
    elements: clonedSlides.flatMap(slide => slide.elements),
    animations: clonedSlides.flatMap(slide => slide.animations || [])
  };
}
export function normalizeSlide(slide: Partial<Slide> = {}): Slide {
  if (slide.id !== undefined) assertId(slide.id, 'slide.id');
  assertColorFields(slide, 'slide');
  return {
    id: slide.id || createId('slide'),
    elements: clonePlain(slide.elements || []),
    ...(slide.notes ? {
      notes: clonePlain(slide.notes)
    } : {}),
    ...(slide.remark !== undefined ? {
      remark: slide.remark
    } : {}),
    ...(slide.background ? {
      background: clonePlain(slide.background)
    } : {}),
    ...(slide.animations ? {
      animations: clonePlain(slide.animations)
    } : {}),
    ...(slide.turningMode ? {
      turningMode: slide.turningMode
    } : {}),
    ...(slide.sectionTag ? {
      sectionTag: clonePlain(slide.sectionTag)
    } : {}),
    ...(slide.type ? {
      type: slide.type
    } : {})
  };
}
function normalizeChartElement(element: Partial<PPTChartElement> & {
  type: 'chart';
}, theme?: SlideTheme): PPTChartElement {
  const chartType: ChartType = element.chartType || 'bar';
  const outline = element.outline ? {
    ...(theme?.outline || {}),
    ...element.outline
  } : undefined;
  const chartDefaults = getChartDefaultData();
  return clonePlain({
    id: element.id || createId('el'),
    left: element.left ?? 300,
    top: element.top ?? 81.25,
    width: element.width ?? 400,
    height: element.height ?? 400,
    rotate: element.rotate ?? 0,
    ...element,
    type: 'chart',
    chartType,
    data: element.data ? clonePlain(element.data) : clonePlain(chartDefaults[chartType] || chartDefaults.bar),
    options: {
      stack: false,
      lineSmooth: false,
      ...(element.options || {})
    },
    ...(element.fill !== undefined ? {
      fill: element.fill
    } : {}),
    ...(outline ? {
      outline
    } : {}),
    themeColors: clonePlain(element.themeColors || theme?.themeColors || DEFAULT_CHART_THEME_COLORS),
    textColor: element.textColor ?? theme?.fontColor ?? DEFAULT_CHART_TEXT_COLOR,
    lineColor: element.lineColor ?? DEFAULT_CHART_LINE_COLOR
  } as PPTChartElement);
}
export function normalizeElement(element: Partial<PPTElement> & {
  type: PPTElement['type'];
}, theme?: SlideTheme): PPTElement {
  assertElementType(element.type);
  assertElementDimensions(element);
  assertColorFields(element, 'element');
  if (element.type === 'line') {
    const normalized = normalizeLineElement(element as Partial<PPTLineElement> & {
      type: 'line';
    });
    assertElementCreateInput(normalized);
    return normalized;
  }
  if (element.type === 'table') {
    const normalized = normalizeTableElement(element as Partial<PPTTableElement>, theme);
    assertElementCreateInput(normalized);
    return normalized;
  }
  if (element.type === 'latex') {
    const normalized = normalizeLatexElement(element as FikaLatexElementInput);
    assertElementCreateInput(normalized);
    return normalized;
  }
  if (element.type === 'code') {
    const normalized = normalizeCodeElement(element as Partial<PPTCodeElement> & {
      type: 'code';
    });
    assertElementCreateInput(normalized);
    return normalized;
  }
  if (element.type === 'chart') {
    const normalized = normalizeChartElement(element as Partial<PPTChartElement> & {
      type: 'chart';
    }, theme);
    assertElementCreateInput(normalized);
    return normalized;
  }
  const sizedElement = element as Partial<{
    height: number;
    rotate: number;
  }>;
  const textElement = element as Partial<PPTTextElement>;
  const elementWithDefaults = element.type === 'text' ? {
    ...element,
    content: textElement.content ?? '',
    defaultFontName: textElement.defaultFontName ?? theme?.fontName ?? '',
    defaultColor: textElement.defaultColor ?? theme?.fontColor ?? '#000000'
  } : element;
  const base = {
    id: element.id || createId('el'),
    left: element.left ?? 0,
    top: element.top ?? 0,
    width: element.width ?? 200,
    height: sizedElement.height ?? 100,
    rotate: sizedElement.rotate ?? 0
  };
  const normalized = clonePlain({
    ...base,
    ...elementWithDefaults,
    id: element.id || base.id
  } as PPTElement);
  assertElementCreateInput(normalized);
  return normalized;
}
export function flattenElementTransform<T extends object>(input: T & {
  transform?: FikaElementTransformPatch;
}): Omit<T, 'transform'> & FikaElementTransformPatch {
  const {
    transform,
    ...rest
  } = input;
  return clonePatch({
    ...rest,
    ...(transform || {})
  } as Omit<T, 'transform'> & FikaElementTransformPatch);
}
export function normalizeAudioElement(input: FikaCreateAudioInput, defaultColor: string): PPTAudioElement {
  const source = input.source ? resolveMediaAsset(input.source, 'audio') : undefined;
  const flattened = flattenElementTransform({
    ...input,
    src: source?.src ?? input.src,
    ext: source?.ext ?? input.ext
  });
  const {
    source: _source,
    slideId: _slideId,
    index: _index,
    select: _select,
    ...element
  } = flattened;
  if (!element.src) throw new Error('Audio source is required');
  return normalizeElement({
    ...element,
    type: 'audio',
    width: element.width ?? 400,
    height: element.height ?? 88,
    loop: element.loop ?? false,
    autoplay: element.autoplay ?? false,
    fixedRatio: element.fixedRatio ?? false,
    color: element.color ?? defaultColor
  }) as PPTAudioElement;
}
export function normalizeAudioPatch(patch: FikaAudioElementPatch): Partial<PPTAudioElement> {
  return flattenElementTransform(patch) as Partial<PPTAudioElement>;
}
const DEFAULT_SHAPE_VIEWBOX: [number, number] = [200, 200];
const DEFAULT_SHAPE_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
export function resolveShapeFormula(element: PPTShapeElement): PPTShapeElement {
  if (!element.pathFormula) return clonePlain(element);
  const shapeFormula = SHAPE_PATH_FORMULAS[element.pathFormula];
  if (!shapeFormula) throw new Error(`Shape path formula not found: ${element.pathFormula}`);
  const keypoints = element.keypoints ?? shapeFormula.defaultValue;
  if (shapeFormula.editable && !keypoints) {
    throw new Error(`Shape path formula requires keypoints: ${element.pathFormula}`);
  }
  const nextElement: PPTShapeElement = {
    ...element,
    viewBox: [element.width, element.height],
    path: shapeFormula.formula(element.width, element.height, keypoints)
  };
  if (keypoints) nextElement.keypoints = clonePlain(keypoints);
  return clonePlain(nextElement);
}
export function normalizeShapeElement(element: Partial<PPTShapeElement> = {}): PPTShapeElement {
  const shape = normalizeElement({
    type: 'shape',
    viewBox: DEFAULT_SHAPE_VIEWBOX,
    path: DEFAULT_SHAPE_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    ...element
  }) as PPTShapeElement;
  return resolveShapeFormula(shape);
}
export function mergeShapeElement(base: PPTShapeElement, patch: Partial<PPTShapeElement>): PPTShapeElement {
  const nextElement: PPTShapeElement = {
    ...base,
    ...clonePatch(patch),
    type: 'shape'
  };
  if ('outline' in patch) {
    nextElement.outline = patch.outline ? {
      ...(base.outline || {}),
      ...clonePlain(patch.outline)
    } : undefined;
  }
  if ('text' in patch) {
    nextElement.text = patch.text ? {
      ...(base.text || {}),
      ...clonePlain(patch.text)
    } as PPTShapeElement['text'] : undefined;
  }
  if ('gradient' in patch) {
    nextElement.gradient = patch.gradient ? clonePlain(patch.gradient) : undefined;
  }
  if ('pattern' in patch) {
    nextElement.pattern = patch.pattern;
  }
  if ('path' in patch && !('pathFormula' in patch)) {
    nextElement.pathFormula = undefined;
    nextElement.keypoints = undefined;
  }
  if (nextElement.pathFormula && ('pathFormula' in patch || 'keypoints' in patch || 'width' in patch || 'height' in patch)) {
    return resolveShapeFormula(nextElement);
  }
  return clonePlain(nextElement);
}

/** Extra padding hfmath's natural box gets in the interactive editor. */
const LATEX_BOX_PADDING = 32;
export interface LatexGeometry {
  path: string;
  viewBox: [number, number];
  width: number;
  height: number;
}

/**
 * Render a LaTeX formula to its SVG path + intrinsic box via hfmath — the EXACT
 * pipeline the interactive LaTeXEditor uses (`new hfmath(latex).pathd()/box()`).
 *
 * The agent supplies only the `latex` string; it cannot pre-compute the SVG
 * `path`. Without a path the `<svg>` renders nothing, so a "latex" element from
 * the agent shows up blank. Deriving the path here makes agent-authored formulas
 * render identically to ones drawn through the editor UI.
 */
export function deriveLatexGeometry(latex: string): LatexGeometry {
  const eq = new hfmath(latex);
  const path = eq.pathd({});
  const box = eq.box({});
  const width = box.w + LATEX_BOX_PADDING;
  const height = box.h + LATEX_BOX_PADDING;
  return {
    path,
    viewBox: [width, height],
    width,
    height
  };
}
export function normalizeLatexElement(element: FikaLatexElementInput): PPTLatexElement {
  if (element.id !== undefined) assertId(element.id, 'element.id');
  assertElementDimensions(element, 'element');
  assertColorFields(element, 'element');
  const latex = typeof element.latex === 'string' ? element.latex.trim() : '';
  const providedPath = typeof element.path === 'string' ? element.path.trim() : '';

  let geometry: LatexGeometry | null = null;
  if (latex && !providedPath) {
    if (typeof window === 'undefined') {
      throw new Error('LaTeX rendering is only available in the browser runtime.');
    }
    try {
      geometry = deriveLatexGeometry(latex);
    } catch (error) {
      throw new Error(`Failed to render LaTeX "${latex}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const width = element.width ?? geometry?.width ?? 200;
  const height = element.height ?? geometry?.height ?? 100;
  const path = providedPath || geometry?.path || '';
  const viewBox = element.viewBox || geometry?.viewBox || [width, height];
  const normalized = clonePlain({
    ...element,
    type: 'latex',
    id: element.id || createId('el'),
    left: element.left ?? 0,
    top: element.top ?? 0,
    width,
    height,
    rotate: element.rotate ?? 0,
    latex,
    path,
    color: element.color ?? DEFAULT_LATEX_COLOR,
    strokeWidth: element.strokeWidth ?? DEFAULT_LATEX_STROKE_WIDTH,
    viewBox: clonePlain(viewBox),
    fixedRatio: element.fixedRatio ?? true
  } as PPTLatexElement);
  assertElementCreateInput(normalized);
  return normalized;
}
function normalizeCodeElement(element: Partial<PPTCodeElement> & {
  type: 'code';
}): PPTCodeElement {
  const code = element.code ?? '';
  const fontSize = element.fontSize ?? DEFAULT_CODE_FONT_SIZE;
  const showLineNumbers = element.showLineNumbers ?? true;
  const measured = measureCodeElementSize({
    code,
    fontSize,
    showLineNumbers
  });
  const normalized = clonePlain({
    ...element,
    type: 'code',
    id: element.id || createId('el'),
    left: element.left ?? 0,
    top: element.top ?? 0,
    width: element.width ?? measured.width,
    height: element.height ?? measured.height,
    rotate: element.rotate ?? 0,
    code,
    language: resolveCodeLanguage(element.language || DEFAULT_CODE_LANGUAGE),
    theme: resolveCodeTheme(element.theme || DEFAULT_CODE_THEME),
    fontSize,
    showLineNumbers
  } as PPTCodeElement);
  assertElementCreateInput(normalized);
  return normalized;
}
type LineCoordinate = [number, number];
type LineCubicCoordinate = [LineCoordinate, LineCoordinate];
type LinePatchKey = keyof PPTLineElement;
const optionalLineKeys = new Set<LinePatchKey>(['lock', 'groupId', 'link', 'name', 'shadow', 'broken', 'broken2', 'broken2Direction', 'curve', 'cubic']);
function cloneLineCoordinate(value: LineCoordinate | undefined, fallback: LineCoordinate): LineCoordinate {
  return value ? [value[0], value[1]] : [...fallback];
}
function cloneLineCubic(value: LineCubicCoordinate | undefined): LineCubicCoordinate | undefined {
  if (!value) return undefined;
  return [cloneLineCoordinate(value[0], [0, 0]), cloneLineCoordinate(value[1], [0, 0])];
}
function cloneLinePoints(points: [LinePoint, LinePoint] | undefined): [LinePoint, LinePoint] {
  return points ? [points[0], points[1]] : ['', ''];
}
export function normalizeLineElement(element: Partial<PPTLineElement> & {
  type?: 'line';
}): PPTLineElement {
  if (element.id !== undefined) assertId(element.id, 'element.id');
  assertElementDimensions(element, 'element');
  assertColorFields(element, 'element');
  const line: PPTLineElement = {
    id: element.id || createId('el'),
    type: 'line',
    left: element.left ?? 0,
    top: element.top ?? 0,
    width: element.width ?? 2,
    start: cloneLineCoordinate(element.start, [0, 0]),
    end: cloneLineCoordinate(element.end, [200, 0]),
    style: (element.style ?? 'solid') as LineStyleType,
    color: element.color ?? '#000000',
    points: cloneLinePoints(element.points)
  };
  if (element.lock !== undefined) line.lock = element.lock;
  if (element.groupId !== undefined) line.groupId = element.groupId;
  if (element.link !== undefined) line.link = clonePlain(element.link);
  if (element.name !== undefined) line.name = element.name;
  if (element.shadow !== undefined) line.shadow = clonePlain(element.shadow);
  if (element.broken !== undefined) line.broken = cloneLineCoordinate(element.broken, [0, 0]);
  if (element.broken2 !== undefined) line.broken2 = cloneLineCoordinate(element.broken2, [0, 0]);
  if (element.broken2Direction !== undefined) line.broken2Direction = element.broken2Direction as Broken2LineDirection;
  if (element.curve !== undefined) line.curve = cloneLineCoordinate(element.curve, [0, 0]);
  if (element.cubic !== undefined) line.cubic = cloneLineCubic(element.cubic);
  assertElementCreateInput(line);
  return line;
}
export function updateLineElement(element: PPTLineElement, patch: Partial<PPTLineElement>): PPTLineElement {
  assertElementDimensions(patch, 'patch');
  assertColorFields(patch, 'patch');
  const next = clonePlain(element) as PPTLineElement;
  for (const key of Object.keys(patch) as LinePatchKey[]) {
    if (key === 'id' || key === 'type') continue;
    const value = patch[key];
    if (value === undefined) {
      if (optionalLineKeys.has(key)) delete next[key];
      continue;
    }
    Object.assign(next, {
      [key]: clonePlain(value)
    });
  }
  return normalizeLineElement(next);
}
export function remapElementGroupIds(elements: PPTElement[]): PPTElement[] {
  const groupIdMap = new Map<string, string>();
  return elements.map(element => {
    const nextElement = clonePlain(element);
    if (!nextElement.groupId) return nextElement;
    let nextGroupId = groupIdMap.get(nextElement.groupId);
    if (!nextGroupId) {
      nextGroupId = createId('group');
      groupIdMap.set(nextElement.groupId, nextGroupId);
    }
    return {
      ...nextElement,
      groupId: nextGroupId
    };
  });
}
const ANIMATION_TYPES: PPTAnimation['type'][] = ['in', 'out', 'attention'];
const ANIMATION_TRIGGERS: PPTAnimation['trigger'][] = ['click', 'meantime', 'auto'];
export function normalizeAnimation(animation: Partial<PPTAnimation> & {
  elId: string;
  effect: string;
  type: PPTAnimation['type'];
}): PPTAnimation {
  if (animation.id !== undefined) assertId(animation.id, 'animation.id');
  assertId(animation.elId, 'animation.elId');
  assertString(animation.effect, 'animation.effect');
  if (!ANIMATION_TYPES.includes(animation.type)) throw new Error(`Invalid animation type: ${String(animation.type)}`);
  const trigger = animation.trigger ?? 'click';
  if (!ANIMATION_TRIGGERS.includes(trigger)) throw new Error(`Invalid animation trigger: ${String(trigger)}`);
  return {
    id: animation.id || createId('anim'),
    elId: animation.elId,
    effect: animation.effect,
    type: animation.type,
    duration: animation.duration ?? 1000,
    trigger
  };
}
export function normalizeNote(note: FikaNoteInput): Note {
  if (note.id !== undefined) assertId(note.id, 'note.id');
  assertString(note.content, 'note.content');
  assertString(note.user, 'note.user');
  return {
    id: note.id || createId('note'),
    content: note.content,
    user: note.user,
    time: note.time ?? Date.now(),
    ...(note.elId ? {
      elId: note.elId
    } : {}),
    ...(note.replies ? {
      replies: note.replies.map(reply => normalizeReply(reply))
    } : {})
  };
}
export function normalizeNotePatch(patch: FikaNotePatch): Partial<Note> {
  const next = clonePlain(patch) as Partial<Note>;
  if (patch.replies) next.replies = patch.replies.map(reply => normalizeReply(reply));
  return next;
}
export function normalizeReply(reply: FikaNoteReplyInput): NoteReply {
  if (reply.id !== undefined) assertId(reply.id, 'reply.id');
  assertString(reply.content, 'reply.content');
  assertString(reply.user, 'reply.user');
  return {
    id: reply.id || createId('reply'),
    content: reply.content,
    user: reply.user,
    time: reply.time ?? Date.now()
  };
}
export function createTableCell(text = '', style?: TableCellStyle): TableCell {
  assertString(text, 'cell.text', true);
  if (style) assertColorFields(style, 'cell.style');
  return {
    id: createId('cell'),
    colspan: 1,
    rowspan: 1,
    text,
    ...(style ? {
      style: clonePlain(style)
    } : {})
  };
}
function normalizeTableCell(cell?: Partial<TableCell>, defaultStyle?: TableCellStyle): TableCell {
  if (cell?.id !== undefined) assertId(cell.id, 'cell.id');
  if (cell?.colspan !== undefined) assertPositiveNumber(cell.colspan, 'cell.colspan');
  if (cell?.rowspan !== undefined) assertPositiveNumber(cell.rowspan, 'cell.rowspan');
  if (cell?.style) assertColorFields(cell.style, 'cell.style');else if (defaultStyle) assertColorFields(defaultStyle, 'cell.defaultStyle');
  return {
    id: cell?.id || createId('cell'),
    colspan: cell?.colspan ?? 1,
    rowspan: cell?.rowspan ?? 1,
    text: cell?.text ?? '',
    ...(cell?.style ? {
      style: clonePlain(cell.style)
    } : defaultStyle ? {
      style: clonePlain(defaultStyle)
    } : {})
  };
}
export function normalizeTableColWidths(colWidths: number[] | undefined, colCount: number): number[] {
  assertPositiveNumber(colCount, 'colCount');
  colWidths?.forEach((width, index) => assertPositiveNumber(width, `colWidths[${index}]`));
  const count = Math.max(1, Math.trunc(colCount));
  if (!colWidths?.length) return new Array(count).fill(1 / count);
  const widths = colWidths.slice(0, count).map(width => Number.isFinite(width) && width > 0 ? width : 0);
  while (widths.length < count) widths.push(1);
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return new Array(count).fill(1 / count);
  return widths.map(width => width / total);
}
function normalizeTableData(data: PPTTableElement['data'] | undefined, rowCount: number, colCount: number, defaultStyle?: TableCellStyle): TableCell[][] {
  const rows = Math.max(1, Math.trunc(rowCount));
  const cols = Math.max(1, Math.trunc(colCount));
  return Array.from({
    length: rows
  }, (_, rowIndex) => {
    return Array.from({
      length: cols
    }, (_, colIndex) => normalizeTableCell(data?.[rowIndex]?.[colIndex], defaultStyle));
  });
}
export function normalizeTableElement(element: Partial<PPTTableElement> = {}, theme?: SlideTheme): PPTTableElement {
  if (element.id !== undefined) assertId(element.id, 'element.id');
  assertElementDimensions(element, 'element');
  assertColorFields(element, 'element');
  if (element.cellMinHeight !== undefined) assertPositiveNumber(element.cellMinHeight, 'element.cellMinHeight');
  const providedColCount = element.colWidths?.length || 0;
  const providedDataColCount = Math.max(...(element.data?.map(row => row.length) || [0]));
  const rowCount = Math.max(element.data?.length || DEFAULT_TABLE_ROW_COUNT, 1);
  const colCount = Math.max(providedColCount, providedDataColCount, DEFAULT_TABLE_COL_COUNT, 1);
  const cellMinHeight = element.cellMinHeight ?? DEFAULT_TABLE_CELL_MIN_HEIGHT;
  const width = element.width ?? colCount * DEFAULT_TABLE_CELL_WIDTH;
  const defaultCellStyle: TableCellStyle = {
    fontname: theme?.fontName ?? '',
    color: theme?.fontColor ?? '#333'
  };
  const normalized = clonePlain({
    id: element.id || createId('el'),
    type: 'table',
    left: element.left ?? 0,
    top: element.top ?? 0,
    width,
    height: element.height ?? rowCount * cellMinHeight,
    rotate: element.rotate ?? 0,
    lock: element.lock,
    groupId: element.groupId,
    name: element.name,
    link: element.link ? clonePlain(element.link) : undefined,
    outline: {
      ...DEFAULT_TABLE_OUTLINE,
      ...(element.outline || {})
    },
    theme: {
      ...DEFAULT_TABLE_THEME,
      ...(element.theme || {})
    },
    colWidths: normalizeTableColWidths(element.colWidths, colCount),
    cellMinHeight,
    data: normalizeTableData(element.data, rowCount, colCount, defaultCellStyle)
  } as PPTTableElement);
  assertElementCreateInput(normalized);
  return normalized;
}
export function normalizeTableElementPatch(table: PPTTableElement, patch: FikaTableElementPatch): Partial<PPTTableElement> {
  const next = clonePlain(patch) as Partial<PPTTableElement>;
  if (patch.outline) next.outline = {
    ...table.outline,
    ...patch.outline
  };
  if (patch.theme) next.theme = {
    ...(table.theme || DEFAULT_TABLE_THEME),
    ...patch.theme
  };
  const patchData = patch.data;
  if (patchData) {
    const rowCount = Math.max(patchData.length, 1);
    const colCount = Math.max(...patchData.map(row => row.length), next.colWidths?.length || table.colWidths.length, 1);
    next.data = normalizeTableData(patchData, rowCount, colCount);
    if (!next.colWidths && colCount !== table.colWidths.length) {
      next.colWidths = normalizeTableColWidths(table.colWidths, colCount);
    }
  }
  if (patch.colWidths) {
    const colCount = Math.max(patch.colWidths.length, next.data?.[0]?.length || table.data[0]?.length || 1);
    next.colWidths = normalizeTableColWidths(patch.colWidths, colCount);
  }
  return next;
}
export function mergeTheme(theme: SlideTheme, patch: Partial<SlideTheme>): SlideTheme {
  assertColorFields(patch, 'theme');
  if (patch.shadow?.blur !== undefined) assertPositiveNumber(patch.shadow.blur, 'theme.shadow.blur');
  return clonePlain({
    ...theme,
    ...patch,
    outline: patch.outline ? {
      ...theme.outline,
      ...patch.outline
    } : theme.outline,
    shadow: patch.shadow ? {
      ...theme.shadow,
      ...patch.shadow
    } : theme.shadow
  });
}
