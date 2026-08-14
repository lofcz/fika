export const enum ShapePathFormulasKeys {
  ROUND_RECT = 'roundRect',
  ROUND_RECT_DIAGONAL = 'roundRectDiagonal',
  ROUND_RECT_SINGLE = 'roundRectSingle',
  ROUND_RECT_SAMESIDE = 'roundRectSameSide',
  CUT_RECT_DIAGONAL = 'cutRectDiagonal',
  CUT_RECT_SINGLE = 'cutRectSingle',
  CUT_RECT_SAMESIDE = 'cutRectSameSide',
  CUT_ROUND_RECT = 'cutRoundRect',
  MESSAGE = 'message',
  ROUND_MESSAGE = 'roundMessage',
  L = 'L',
  RING_RECT = 'ringRect',
  PLUS = 'plus',
  TRIANGLE = 'triangle',
  PARALLELOGRAM_LEFT = 'parallelogramLeft',
  PARALLELOGRAM_RIGHT = 'parallelogramRight',
  TRAPEZOID = 'trapezoid',
  BULLET = 'bullet',
  INDICATOR = 'indicator',
  DONUT = 'donut',
  DIAGSTRIPE = 'diagStripe',
}
export const enum ElementTypes {
  TEXT = 'text',
  IMAGE = 'image',
  SHAPE = 'shape',
  LINE = 'line',
  CHART = 'chart',
  TABLE = 'table',
  LATEX = 'latex',
  MERMAID = 'mermaid',
  CODE = 'code',
  VIDEO = 'video',
  AUDIO = 'audio',
}

/**
 * Gradient fill.
 *
 * type: radial or linear
 * colors: stops (`pos` percent, `color`)
 * rotate: angle for linear gradients
 */
export type GradientType = 'linear' | 'radial';
export type GradientColor = {
  pos: number;
  color: string;
};
export interface Gradient {
  type: GradientType;
  colors: GradientColor[];
  rotate: number;
}
export type LineStyleType = 'solid' | 'dashed' | 'dotted';

/**
 * Element shadow.
 *
 * h / v: offset
 * blur: blur radius
 * color: shadow color
 */
export interface PPTElementShadow {
  h: number;
  v: number;
  blur: number;
  color: string;
}

/**
 * DrawingML effectLst extras beyond outer shadow (Mona-compatible subset).
 */
export interface PPTElementEffects {
  glow?: {
    color: string;
    opacity: number;
    radius: number;
  };
  innerShadow?: PPTElementShadow & {
    opacity?: number;
  };
  reflection?: {
    blur: number;
    direction: number;
    distance: number;
    opacity: number;
    scaleY: number;
  };
  softEdge?: {
    radius: number;
  };
}

/** Lightweight structured text foundation (schemaVersion 1). */
export interface StructuredTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  fontColor?: string;
  fontName?: string;
}
export interface StructuredTextParagraph {
  align?: TextAlign;
  runs: StructuredTextRun[];
}
export interface StructuredTextBody {
  schemaVersion: 1;
  paragraphs: StructuredTextParagraph[];
}

/**
 * Element outline.
 *
 * style?: solid or dashed
 * width?: stroke width
 * color?: stroke color
 * radius?: corner radius in px
 */
export interface PPTElementOutline {
  style?: LineStyleType;
  width?: number;
  color?: string;
  radius?: number;
}
export type ElementLinkType = 'web' | 'slide';

/**
 * Element hyperlink.
 *
 * type: web URL or slide
 * target: URL or slide id
 */
export interface PPTElementLink {
  type: ElementLinkType;
  target: string;
}
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type TextAlignVertical = 'top' | 'middle' | 'bottom';

/**
 * Provenance for an element imported from a retained PowerPoint package.
 * Enables future source-preserving OOXML writeback (identity-stable patch).
 */
export interface ElementSource {
  packageId: string;
  partPath: string;
  objectId: string;
  order?: number;
  name?: string;
}

/**
 * Shared element fields.
 *
 * id, left, top, width, height, rotate
 * lock?: prevent edits
 * groupId?: members that share this id are grouped
 * link?: hyperlink
 * name?: display name
 * source?: OOXML provenance when imported from a retained PPTX package
 */
interface PPTBaseElement {
  id: string;
  left: number;
  top: number;
  lock?: boolean;
  groupId?: string;
  width: number;
  height: number;
  rotate: number;
  link?: PPTElementLink;
  name?: string;
  source?: ElementSource;
  effects?: PPTElementEffects;
}
export type TextType = 'title' | 'subtitle' | 'content' | 'item' | 'itemTitle' | 'notes' | 'header' | 'footer' | 'partNumber' | 'itemNumber';
export type TextInset = [number, number, number, number];

/**
 * Text element.
 *
 * content: HTML string
 * defaultFontName / defaultColor: defaults overridden by inline HTML styles
 * lineHeight?: multiplier, default 1.5
 * wordSpace?: letter spacing, default 0
 * paragraphSpace?: paragraph gap, default 5px
 * vertical?: vertical text
 * inset?: padding [top, right, bottom, left], default [10, 10, 10, 10]
 * fixedHeight?: lock the auto-fit axis (height for horizontal text, width for vertical)
 * vAlign?: vertical align inside the box when `fixedHeight` is set, default top
 */
export interface PPTTextElement extends PPTBaseElement {
  type: 'text';
  content: string;
  defaultFontName: string;
  defaultColor: string;
  placeholder?: string;
  placeholderFontSize?: number;
  placeholderColor?: string;
  placeholderAlign?: TextAlign;
  placeholderBold?: boolean;
  placeholderItalic?: boolean;
  /** Empty-state layout height; frozen at creation, not updated when content grows. */
  placeholderLayoutHeight?: number;
  outline?: PPTElementOutline;
  fill?: string;
  lineHeight?: number;
  wordSpace?: number;
  opacity?: number;
  shadow?: PPTElementShadow;
  paragraphSpace?: number;
  vertical?: boolean;
  textType?: TextType;
  inset?: TextInset;
  fixedHeight?: boolean;
  vAlign?: TextAlignVertical;
  /** Optional structured runs retained from import (HTML remains source of truth for editing). */
  structuredText?: StructuredTextBody;
}

/**
 * Image or shape flip.
 */
export interface ImageOrShapeFlip {
  flipH?: boolean;
  flipV?: boolean;
}

/**
 * Image filters.
 *
 * https://developer.mozilla.org/en-US/docs/Web/CSS/filter
 */
export type ImageElementFilterKeys = 'blur' | 'brightness' | 'contrast' | 'grayscale' | 'saturate' | 'hue-rotate' | 'opacity' | 'sepia' | 'invert';
export interface ImageElementFilters {
  'blur'?: string;
  'brightness'?: string;
  'contrast'?: string;
  'grayscale'?: string;
  'saturate'?: string;
  'hue-rotate'?: string;
  'sepia'?: string;
  'invert'?: string;
  'opacity'?: string;
}
export type ImageClipDataRange = [[number, number], [number, number]];

/**
 * Image crop.
 *
 * range: e.g. [[10, 10], [90, 90]] crops 10%,10% to 90%,90% from the top-left
 * shape: clip path id from configs/imageClip.ts CLIPPATHS
 */
export interface ImageElementClip {
  range: ImageClipDataRange;
  shape: string;
}
export type ImageType = 'pageFigure' | 'itemFigure' | 'background';

/**
 * Image element.
 */
export interface PPTImageElement extends PPTBaseElement {
  type: 'image';
  fixedRatio: boolean;
  src: string;
  outline?: PPTElementOutline;
  filters?: ImageElementFilters;
  clip?: ImageElementClip;
  flipH?: boolean;
  flipV?: boolean;
  shadow?: PPTElementShadow;
  radius?: number;
  colorMask?: string;
  imageType?: ImageType;
}

/**
 * Text inside a shape.
 *
 * content: HTML string
 * align: vertical alignment
 * inset?: padding [top, right, bottom, left], default [10, 10, 10, 10]
 */
export interface ShapeText {
  content: string;
  defaultFontName: string;
  defaultColor: string;
  align: TextAlignVertical;
  lineHeight?: number;
  wordSpace?: number;
  paragraphSpace?: number;
  inset?: TextInset;
  type?: TextType;
}

/**
 * Shape element.
 *
 * viewBox: SVG viewBox, e.g. [1000, 1000] means `0 0 1000 1000`
 * path: SVG path `d`
 * fill: used when there is no gradient
 * gradient? / pattern?: take priority over `fill` when set
 * special?: hard-to-parse path (commands other than L/Q/C/A); exported as an image
 * pathFormula?: recalculate `viewBox` and `path` on resize so keypoints stay exact
 * keypoints?: keypoint positions as percentages
 */
export interface PPTShapeElement extends PPTBaseElement {
  type: 'shape';
  viewBox: [number, number];
  path: string;
  fixedRatio: boolean;
  fill: string;
  gradient?: Gradient;
  pattern?: string;
  outline?: PPTElementOutline;
  opacity?: number;
  flipH?: boolean;
  flipV?: boolean;
  shadow?: PPTElementShadow;
  special?: boolean;
  text?: ShapeText;
  pathFormula?: ShapePathFormulasKeys;
  keypoints?: number[];
}
export type LinePoint = '' | 'arrow' | 'dot';
export type Broken2LineDirection = 'horizontal' | 'vertical';

/**
 * Line element.
 *
 * start / end: [x, y]
 * style: solid, dashed, or dotted
 * points: [start cap, end cap] — none, arrow, or dot
 * broken?: polyline control point
 * broken2?: double-bend control point
 * curve?: quadratic control point
 * cubic?: cubic control points
 */
export interface PPTLineElement extends Omit<PPTBaseElement, 'height' | 'rotate'> {
  type: 'line';
  start: [number, number];
  end: [number, number];
  style: LineStyleType;
  color: string;
  points: [LinePoint, LinePoint];
  shadow?: PPTElementShadow;
  broken?: [number, number];
  broken2?: [number, number];
  broken2Direction?: Broken2LineDirection;
  curve?: [number, number];
  cubic?: [[number, number], [number, number]];
}
export type ChartType = 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area' | 'radar' | 'scatter';
export interface ChartOptions {
  lineSmooth?: boolean;
  stack?: boolean;
}
export interface ChartData {
  labels: string[];
  legends: string[];
  series: number[][];
}

/**
 * Chart element.
 *
 * chartType: bar / line / pie family
 * textColor?: axis and label color (ink, resolved against slide/chart fill)
 * lineColor?: grid color
 */
export interface PPTChartElement extends PPTBaseElement {
  type: 'chart';
  fill?: string;
  chartType: ChartType;
  data: ChartData;
  options?: ChartOptions;
  outline?: PPTElementOutline;
  themeColors: string[];
  textColor?: string;
  lineColor?: string;
}

/**
 * Table cell style.
 */
export interface TableCellStyle {
  bold?: boolean;
  em?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  backcolor?: string;
  fontsize?: string;
  fontname?: string;
  align?: TextAlign;
  vAlign?: TextAlignVertical;
}

/**
 * Table cell.
 */
export interface TableCell {
  id: string;
  colspan: number;
  rowspan: number;
  text: string;
  style?: TableCellStyle;
}

/**
 * Table theme (header/total row and first/last column).
 */
export interface TableTheme {
  color: string;
  rowHeader: boolean;
  rowFooter: boolean;
  colHeader: boolean;
  colFooter: boolean;
}

/**
 * Table element.
 *
 * colWidths: fractions of total width, e.g. [0.3, 0.5, 0.2]
 */
export interface PPTTableElement extends PPTBaseElement {
  type: 'table';
  outline: PPTElementOutline;
  theme?: TableTheme;
  colWidths: number[];
  cellMinHeight: number;
  data: TableCell[][];
}

/**
 * LaTeX formula element.
 */
export interface PPTLatexElement extends PPTBaseElement {
  type: 'latex';
  latex: string;
  path: string;
  color: string;
  strokeWidth: number;
  viewBox: [number, number];
  fixedRatio: boolean;
}

/**
 * Mermaid diagram element
 *
 * code: Mermaid source; SVG is generated at runtime
 */
export interface PPTMermaidElement extends PPTBaseElement {
  type: 'mermaid';
  code: string;
}

/**
 * Syntax-highlighted code example (Shiki).
 *
 * code: source
 * language: Shiki language id
 * theme: Shiki theme id
 * fontSize: editor/slide font size in px
 * showLineNumbers: gutter
 */
export interface PPTCodeElement extends PPTBaseElement {
  type: 'code';
  code: string;
  language: string;
  theme: string;
  fontSize: number;
  showLineNumbers: boolean;
}

/**
 * Video element.
 *
 * ext: file extension when the URL has none
 */
export interface PPTVideoElement extends PPTBaseElement {
  type: 'video';
  src: string;
  autoplay: boolean;
  poster?: string;
  ext?: string;
}

/**
 * Audio element.
 *
 * poster: album art or synthesized waveform
 * ext: file extension when the URL has none
 */
export interface PPTAudioElement extends PPTBaseElement {
  type: 'audio';
  fixedRatio: boolean;
  color: string;
  loop: boolean;
  autoplay: boolean;
  src: string;
  poster?: string;
  ext?: string;
}
export type PPTElement = PPTTextElement | PPTImageElement | PPTShapeElement | PPTLineElement | PPTChartElement | PPTTableElement | PPTLatexElement | PPTMermaidElement | PPTCodeElement | PPTVideoElement | PPTAudioElement;
export type AnimationType = 'in' | 'out' | 'attention';
export type AnimationTrigger = 'click' | 'meantime' | 'auto';

/**
 * Element animation.
 *
 * type: entrance, exit, or emphasis
 * trigger: click, with previous (`meantime`), or after previous (`auto`)
 */
export interface PPTAnimation {
  id: string;
  elId: string;
  effect: string;
  type: AnimationType;
  duration: number;
  trigger: AnimationTrigger;
}
export type SlideBackgroundType = 'solid' | 'image' | 'gradient';
export type SlideBackgroundImageSize = 'cover' | 'contain' | 'repeat';
export interface SlideBackgroundImage {
  src: string;
  size: SlideBackgroundImageSize;
}

/**
 * Slide background: solid, image, or gradient.
 */
export interface SlideBackground {
  type: SlideBackgroundType;
  color?: string;
  image?: SlideBackgroundImage;
  gradient?: Gradient;
}
export type TurningMode = 'no' | 'fade' | 'slideX' | 'slideY' | 'random' | 'slideX3D' | 'slideY3D' | 'rotate' | 'scaleY' | 'scaleX' | 'scale' | 'scaleReverse';
export interface NoteReply {
  id: string;
  content: string;
  time: number;
  user: string;
}
export interface Note {
  id: string;
  content: string;
  time: number;
  user: string;
  elId?: string;
  replies?: NoteReply[];
}
export interface SectionTag {
  id: string;
  title?: string;
}
export type SlideType = 'cover' | 'contents' | 'transition' | 'content' | 'end';

/**
 * Slide page.
 *
 * notes?: comments
 * remark?: speaker notes
 * turningMode?: transition
 * sourcePackageId?: retained PPTX package id (when imported from Office)
 */
export interface Slide {
  id: string;
  elements: PPTElement[];
  notes?: Note[];
  remark?: string;
  background?: SlideBackground;
  animations?: PPTAnimation[];
  turningMode?: TurningMode;
  sectionTag?: SectionTag;
  type?: SlideType;
  sourcePackageId?: string;
}

/**
 * Slide theme (background, accent colors, default font).
 */
export interface SlideTheme {
  backgroundColor: string;
  themeColors: string[];
  fontColor: string;
  fontName: string;
  outline: PPTElementOutline;
  shadow: PPTElementShadow;
  /**
   * Id of the agentic style preset last applied via `deck.applyStyle`. Additive
   * and optional: it lets `slides.createFromLayout` inherit the active preset's
   * role tokens (colors, fonts, type scale) without re-specifying them. It is a
   * plain string so it survives theme merges and document (de)serialization.
   */
  styleId?: string;
}
export interface SlideTemplate {
  name: string;
  id: string;
  cover: string;
  origin?: string;
}

/** Theme pack imported from a local .json / .fika file */
export interface ImportedSlideTemplate {
  name: string;
  id: string;
  slides: Slide[];
  theme: Partial<SlideTheme>;
  width: number;
  height: number;
}

/** Theme import/export file payload */
export interface SlideThemeFile {
  title: string;
  slides: Slide[];
  theme: Partial<SlideTheme>;
  width: number;
  height: number;
}
