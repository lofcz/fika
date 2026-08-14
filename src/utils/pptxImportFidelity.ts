import JSZip from 'jszip';
import { parse as parseXml } from 'txml';
import { nanoid } from 'nanoid';
import type { ElementSource, Note, PPTAnimation, PPTElementEffects, PPTLatexElement, TurningMode } from '@/types/slides';
import { hfmath } from '@/components/LaTeXEditor/hfmath';
export type { ElementSource };
export interface SlideObjectIdentity {
  order: number;
  objectId: string;
  name?: string;
  partPath: string;
  /** Position/size in points (pptxtojson units, pre-viewport scale) */
  left: number;
  top: number;
  width: number;
  height: number;
  effects?: PPTElementEffects;
}
const EMU_TO_POINTS = 72 / 914400;
export interface PptxSlideTransition {
  type: string;
  duration?: number;
  direction?: string | null;
}
export interface PptxMathElement {
  type: 'math';
  left: number;
  top: number;
  width: number;
  height: number;
  latex?: string;
  picBase64?: string;
  order?: number;
}
type XmlNode = {
  tagName?: string;
  attributes?: Record<string, string>;
  children?: Array<XmlNode | string>;
};
const TRANSITION_IMPORT_MAP: Record<string, TurningMode> = {
  none: 'no',
  fade: 'fade',
  fadeThroughBlack: 'fade',
  push: 'slideX',
  wipe: 'slideX',
  cover: 'slideX',
  uncover: 'slideX',
  pull: 'slideX',
  split: 'slideY',
  blinds: 'slideY',
  checker: 'slideX',
  comb: 'slideX',
  random: 'random',
  randomBar: 'random',
  cut: 'no',
  dissolve: 'fade',
  wheel: 'rotate',
  wedge: 'rotate',
  circle: 'scale',
  diamond: 'scale',
  plus: 'scale',
  newsflash: 'rotate',
  zoom: 'scale',
  warp: 'scale',
  flip: 'slideX3D',
  gallery: 'slideX',
  conveyor: 'slideX',
  doors: 'slideX',
  window: 'slideX',
  ferris: 'rotate',
  flythrough: 'scale',
  crush: 'scaleReverse',
  peelOff: 'slideX',
  pageCurl: 'slideX',
  airplane: 'slideX',
  origami: 'rotate',
  morph: 'fade',
  prism: 'slideX3D',
  pan: 'slideX',
  glitter: 'fade',
  honeycomb: 'fade',
  flash: 'fade',
  shred: 'fade',
  switch: 'slideX',
  flipover: 'slideX3D'
};

/**
 * Map pptxtojson / OOXML transition type (+ optional direction) → Fika turningMode.
 */
export function mapPptxTransitionToTurningMode(transition?: PptxSlideTransition | null): TurningMode | undefined {
  if (!transition?.type || transition.type === 'none') return undefined;
  const type = transition.type.replace(/^p\d{0,2}:/, '');
  const dir = (transition.direction || '').toLowerCase();
  if (type === 'push' || type === 'wipe' || type === 'cover' || type === 'uncover' || type === 'pull') {
    if (dir === 'u' || dir === 'd') return 'slideY';
    return 'slideX';
  }
  if (type === 'split' || type === 'blinds') {
    if (dir === 'vert' || dir === 'l' || dir === 'r') return 'slideX';
    return 'slideY';
  }
  if (type === 'zoom') {
    if (dir === 'out') return 'scaleReverse';
    return 'scale';
  }
  if (type === 'warp') {
    return dir === 'out' ? 'scaleReverse' : 'scale';
  }
  if (type === 'flip') {
    if (dir === 'u' || dir === 'd') return 'slideY3D';
    return 'slideX3D';
  }
  return TRANSITION_IMPORT_MAP[type];
}

/**
 * Normalize OMML→LaTeX quirks from real PowerPoint / pptxtojson output:
 * - NBSP → space
 * - Mathematical Alphanumeric Symbols (italic/bold/…) → ASCII
 */
export function normalizeImportedLatex(latex: string): string {
  return latex.replace(/\u00a0/g, ' ').replace(/[\u{1D400}-\u{1D7FF}]/gu, char => {
    const code = char.codePointAt(0)!;
    if (code >= 0x1D400 && code <= 0x1D419) return String.fromCharCode(65 + (code - 0x1D400));
    if (code >= 0x1D41A && code <= 0x1D433) return String.fromCharCode(97 + (code - 0x1D41A));
    if (code >= 0x1D434 && code <= 0x1D44D) return String.fromCharCode(65 + (code - 0x1D434));
    if (code >= 0x1D44E && code <= 0x1D467) return String.fromCharCode(97 + (code - 0x1D44E));
    if (code >= 0x1D468 && code <= 0x1D481) return String.fromCharCode(65 + (code - 0x1D468));
    if (code >= 0x1D482 && code <= 0x1D49B) return String.fromCharCode(97 + (code - 0x1D482));
    if (code >= 0x1D7CE && code <= 0x1D7D7) return String.fromCharCode(48 + (code - 0x1D7CE));
    if (code >= 0x1D7D8 && code <= 0x1D7E1) return String.fromCharCode(48 + (code - 0x1D7D8));
    if (code >= 0x1D7E2 && code <= 0x1D7EB) return String.fromCharCode(48 + (code - 0x1D7E2));
    if (code >= 0x1D7EC && code <= 0x1D7F5) return String.fromCharCode(48 + (code - 0x1D7EC));
    if (code >= 0x1D7F6 && code <= 0x1D7FF) return String.fromCharCode(48 + (code - 0x1D7F6));
    return char;
  }).trim();
}

/**
 * Build an editable LaTeX element from a pptxtojson math node.
 * Falls back to null when latex is missing (caller may keep the PNG).
 */
export function buildLatexElementFromMath(el: PptxMathElement, options: {
  color?: string;
  id?: string;
} = {}): PPTLatexElement | null {
  const latex = normalizeImportedLatex(el.latex || '');
  if (!latex) return null;
  let path = '';
  try {
    path = new hfmath(latex).pathd({});
  } catch {
    path = '';
  }
  const width = Math.max(1, el.width || 1);
  const height = Math.max(1, el.height || 1);
  return {
    type: 'latex',
    id: options.id || nanoid(10),
    left: el.left,
    top: el.top,
    width,
    height,
    rotate: 0,
    latex,
    path,
    color: options.color || '#333333',
    strokeWidth: 2,
    viewBox: [width, height],
    fixedRatio: true
  };
}
function walkXml(nodes: Array<XmlNode | string> | undefined, visit: (node: XmlNode) => void) {
  if (!nodes) return;
  for (const node of nodes) {
    if (typeof node === 'string' || !node?.tagName) continue;
    visit(node);
    walkXml(node.children, visit);
  }
}
function localName(tag?: string) {
  if (!tag) return '';
  const i = tag.indexOf(':');
  return i >= 0 ? tag.slice(i + 1) : tag;
}
function textContent(node?: XmlNode | string | null): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (!node.children?.length) return '';
  return node.children.map(child => textContent(child)).join('');
}
function findChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node?.children) return undefined;
  for (const child of node.children) {
    if (typeof child === 'string') continue;
    if (localName(child.tagName) === name) return child;
  }
  return undefined;
}
function findChildren(node: XmlNode | undefined, name: string): XmlNode[] {
  if (!node?.children) return [];
  return node.children.filter((child): child is XmlNode => typeof child !== 'string' && localName(child.tagName) === name);
}

/**
 * Parse author lists from either:
 * - legacy `ppt/commentAuthors.xml` (`p:cmAuthor`)
 * - modern `ppt/authors.xml` (`p188:author`)
 */
export function parseCommentAuthorsXml(xml: string): Map<string, string> {
  const authors = new Map<string, string>();
  if (!xml) return authors;
  const roots = parseXml(xml) as XmlNode[];
  walkXml(roots, node => {
    const tag = localName(node.tagName);
    if (tag !== 'cmAuthor' && tag !== 'author') return;
    const id = node.attributes?.id;
    const name = node.attributes?.name || node.attributes?.initials || 'Author';
    if (id != null) authors.set(String(id), name);
  });
  return authors;
}

/** Collect visible text from a DrawingML txBody (`a:t` runs). */
function extractTxBodyText(node: XmlNode | undefined): string {
  const txBody = findChild(node, 'txBody');
  if (!txBody) return '';
  const parts: string[] = [];
  walkXml(txBody.children, child => {
    if (localName(child.tagName) !== 't') return;
    const value = textContent(child).trim();
    if (value) parts.push(value);
  });
  return parts.join(' ');
}
function parseCommentTimestamp(...candidates: Array<string | undefined>): number {
  for (const value of candidates) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

/**
 * Parse a slide comments part into Fika Note[].
 * Supports legacy `p:cmLst/p:cm/p:text` and modern threaded
 * `p188:cmLst/p188:cm` (+ `replyLst`) used by PowerPoint / pptxgenjs 4.x.
 */
export function parseCommentsXml(xml: string, authors: Map<string, string> = new Map()): Note[] {
  if (!xml) return [];
  const roots = parseXml(xml) as XmlNode[];
  const notes: Note[] = [];
  walkXml(roots, node => {
    if (localName(node.tagName) !== 'cm') return;
    const authorId = node.attributes?.authorId ?? '';
    const legacyText = findChild(node, 'text');
    const content = (legacyText ? textContent(legacyText) : extractTxBodyText(node)).trim();
    if (!content) return;
    const replies = findChildren(findChild(node, 'replyLst'), 'reply').map(reply => {
      const replyText = extractTxBodyText(reply).trim();
      const replyAuthorId = reply.attributes?.authorId ?? '';
      return {
        id: nanoid(10),
        content: replyText,
        time: parseCommentTimestamp(reply.attributes?.created, reply.attributes?.dt),
        user: authors.get(String(replyAuthorId)) || 'Author'
      };
    }).filter(reply => !!reply.content);
    notes.push({
      id: nanoid(10),
      content,
      time: parseCommentTimestamp(node.attributes?.startDate, node.attributes?.dt),
      user: authors.get(String(authorId)) || 'Author',
      ...(replies.length ? {
        replies
      } : {})
    });
  });
  return notes;
}

/** @deprecated Use parseCommentsXml — kept for call-site compatibility. */
export function parseLegacyCommentsXml(xml: string, authors: Map<string, string> = new Map()): Note[] {
  return parseCommentsXml(xml, authors);
}
function emuToPoints(value: string | undefined): number {
  return Number(value || 0) * EMU_TO_POINTS;
}
function readEffectColor(node: XmlNode | undefined): {
  color: string;
  opacity: number;
} {
  let color = '000000';
  let opacity = 1;
  walkXml(node?.children, child => {
    const tag = localName(child.tagName);
    if (tag === 'srgbClr' && child.attributes?.val) color = child.attributes.val.replace(/^#/, '');
    if (tag === 'schemeClr' && child.attributes?.val) color = child.attributes.val;
    if (tag === 'alpha' && child.attributes?.val) {
      const raw = Number(child.attributes.val);
      if (Number.isFinite(raw)) opacity = raw > 1 ? raw / 100000 : raw;
    }
  });
  return {
    color: color.startsWith('#') ? color : `#${color}`,
    opacity
  };
}

/** Parse a:effectLst into Mona-compatible PPTElementEffects (points). */
export function parseEffectLst(effectLst: XmlNode | undefined): PPTElementEffects | undefined {
  if (!effectLst) return undefined;
  const effects: PPTElementEffects = {};
  for (const child of effectLst.children || []) {
    if (typeof child === 'string') continue;
    const tag = localName(child.tagName);
    const attrs = child.attributes || {};
    if (tag === 'glow') {
      const {
        color,
        opacity
      } = readEffectColor(child);
      effects.glow = {
        color,
        opacity,
        radius: emuToPoints(attrs.rad)
      };
    } else if (tag === 'innerShdw') {
      const {
        color,
        opacity
      } = readEffectColor(child);
      const dist = emuToPoints(attrs.dist);
      const dirDeg = Number(attrs.dir || 0) / 60000;
      const rad = dirDeg * Math.PI / 180;
      effects.innerShadow = {
        color,
        opacity,
        blur: emuToPoints(attrs.blurRad),
        h: dist * Math.cos(rad),
        v: dist * Math.sin(rad)
      };
    } else if (tag === 'softEdge') {
      effects.softEdge = {
        radius: emuToPoints(attrs.rad)
      };
    } else if (tag === 'reflection') {
      effects.reflection = {
        blur: emuToPoints(attrs.blurRad),
        direction: Number(attrs.dir || 0) / 60000,
        distance: emuToPoints(attrs.dist),
        opacity: attrs.stA != null ? Number(attrs.stA) / 100000 : 0.5,
        scaleY: attrs.sy != null ? Number(attrs.sy) / 100000 : -1
      };
    }
  }
  return Object.keys(effects).length ? effects : undefined;
}
function readXfrmBox(node: XmlNode): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  let xfrm: XmlNode | undefined;
  for (const pr of ['spPr', 'picPr', 'grpSpPr', 'xfrm']) {
    if (localName(node.tagName) === 'xfrm') {
      xfrm = node;
      break;
    }
    const container = findChild(node, pr);
    xfrm = findChild(container, 'xfrm') || (localName(container?.tagName) === 'xfrm' ? container : undefined);
    if (xfrm) break;
  }
  if (!xfrm) xfrm = findChild(node, 'xfrm');
  const off = findChild(xfrm, 'off');
  const ext = findChild(xfrm, 'ext');
  const left = Number(off?.attributes?.x || 0) * EMU_TO_POINTS;
  const top = Number(off?.attributes?.y || 0) * EMU_TO_POINTS;
  const width = Number(ext?.attributes?.cx || 0) * EMU_TO_POINTS;
  const height = Number(ext?.attributes?.cy || 0) * EMU_TO_POINTS;
  return {
    left,
    top,
    width,
    height
  };
}

/**
 * Collect cNvPr identities from a slide XML part (document order).
 * Geometry is in points so it can match pptxtojson element boxes.
 */
export function extractCNvPrIdentitiesFromSlideXml(xml: string, partPath: string): SlideObjectIdentity[] {
  if (!xml) return [];
  const roots = parseXml(xml) as XmlNode[];
  const identities: SlideObjectIdentity[] = [];
  let syntheticOrder = 0;
  const visitShapeLike = (node: XmlNode) => {
    const tag = localName(node.tagName);
    if (!['sp', 'pic', 'cxnSp', 'graphicFrame', 'grpSp'].includes(tag)) return;
    let cNvPr: XmlNode | undefined;
    for (const wrapper of ['nvSpPr', 'nvPicPr', 'nvCxnSpPr', 'nvGraphicFramePr', 'nvGrpSpPr']) {
      const wrap = findChild(node, wrapper);
      cNvPr = findChild(wrap, 'cNvPr');
      if (cNvPr) break;
    }
    const objectId = cNvPr?.attributes?.id;
    if (objectId == null || objectId === '') return;
    const box = readXfrmBox(node);
    const spPr = findChild(node, 'spPr') || findChild(node, 'grpSpPr');
    const effectLst = findChild(spPr, 'effectLst');
    const effects = parseEffectLst(effectLst);
    identities.push({
      order: syntheticOrder++,
      objectId: String(objectId),
      name: cNvPr?.attributes?.name,
      partPath,
      ...box,
      ...(effects ? {
        effects
      } : {})
    });
  };
  walkXml(roots, visitShapeLike);
  return identities;
}
function normalizePartTarget(basePart: string, target: string): string {
  if (!target) return '';
  if (target.startsWith('/')) return target.replace(/^\//, '');
  if (target.startsWith('ppt/')) return target;

  const baseDir = basePart.split('/').slice(0, -1);
  const parts = [...baseDir];
  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();else parts.push(segment);
  }
  return parts.join('/');
}
async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path) || zip.file(path.replace(/^\//, ''));
  if (!file) return null;
  return file.async('text');
}
export async function hashPackageId(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  const view = new Uint8Array(bytes);
  let h = 2166136261;
  for (let i = 0; i < view.length; i += Math.max(1, Math.floor(view.length / 4096))) {
    h ^= view[i];
    h = Math.imul(h, 16777619);
  }
  return `pkg_${(h >>> 0).toString(16)}_${view.length.toString(16)}`;
}
export interface PptxImportExtras {
  packageId: string;
  /** Comments keyed by 0-based slide index */
  commentsBySlide: Map<number, Note[]>;
  /** cNvPr identities keyed by 0-based slide index (slide-local parts only) */
  identitiesBySlide: Map<number, SlideObjectIdentity[]>;
  /** Click/build animations keyed by 0-based slide index (from `p:timing`) */
  animationsBySlide: Map<number, ImportedSlideAnimation[]>;
}
export interface ImportedSlideAnimation {
  objectId: string;
  trigger: PPTAnimation['trigger'];
  type: PPTAnimation['type'];
  effect: string;
  duration: number;
}

/** pptxtojson `slide.animations` item (OOXML timing, presenter order). */
export interface PptxtojsonSlideAnimation {
  spid: string;
  trigger: string;
  class: string;
  presetId: number;
  presetSubtype?: number;
  duration: number;
  delay?: number;
  filter?: string;
}
const NODE_TYPE_TO_TRIGGER: Record<string, PPTAnimation['trigger']> = {
  clickEffect: 'click',
  withEffect: 'meantime',
  afterEffect: 'auto',
  clickPar: 'click',
  withGroup: 'meantime',
  afterGroup: 'auto',
  interactiveSeq: 'click'
};
const JSON_TRIGGER_TO_FIKA: Record<string, PPTAnimation['trigger']> = {
  onClick: 'click',
  withPrevious: 'meantime',
  afterPrevious: 'auto',
  click: 'click',
  meantime: 'meantime',
  auto: 'auto'
};
const PRESET_CLASS_TO_TYPE: Record<string, PPTAnimation['type']> = {
  entr: 'in',
  exit: 'out',
  emph: 'attention',
  path: 'attention'
};
const SKIP_PRESET_CLASSES = new Set(['verb', 'mediacall']);

/** Fly/wipe subtype bits: 1=top, 2=right, 4=bottom, 8=left (and corners). */
const FLY_IN_SUBTYPE: Record<number, string> = {
  1: 'fadeInDown',
  2: 'fadeInRight',
  4: 'fadeInUp',
  8: 'fadeInLeft',
  9: 'fadeInTopLeft',
  3: 'fadeInTopRight',
  12: 'fadeInBottomLeft',
  6: 'fadeInBottomRight'
};
const FLY_OUT_SUBTYPE: Record<number, string> = {
  1: 'fadeOutUp',
  2: 'fadeOutRight',
  4: 'fadeOutDown',
  8: 'fadeOutLeft',
  9: 'fadeOutTopLeft',
  3: 'fadeOutTopRight',
  12: 'fadeOutBottomLeft',
  6: 'fadeOutBottomRight'
};
const ENTR_PRESET_TO_EFFECT: Record<number, string> = {
  1: 'appear',
  2: 'fadeInLeft',
  3: 'zoomIn',
  4: 'zoomIn',
  5: 'fadeIn',
  6: 'zoomIn',
  7: 'zoomIn',
  8: 'fadeIn',
  9: 'flash',
  10: 'fadeIn',
  12: 'zoomIn',
  13: 'zoomIn',
  14: 'fadeIn',
  15: 'fadeIn',
  16: 'fadeIn',
  19: 'fadeInLeft',
  20: 'zoomIn',
  21: 'fadeIn',
  22: 'fadeInLeft',
  23: 'bounceIn',
  26: 'bounceIn',
  27: 'backInUp',
  29: 'fadeInUp',
  31: 'flipInX',
  41: 'fadeIn',
  42: 'backInUp',
  45: 'rotateIn',
  52: 'appear',
  53: 'zoomIn'
};
const EXIT_PRESET_TO_EFFECT: Record<number, string> = {
  1: 'fadeOut',
  2: 'fadeOutLeft',
  4: 'zoomOut',
  6: 'zoomOut',
  8: 'fadeOut',
  10: 'fadeOut',
  14: 'fadeOut',
  16: 'fadeOut',
  21: 'fadeOut',
  22: 'fadeOutLeft',
  26: 'bounceOut',
  31: 'flipOutX',
  42: 'backOutDown',
  45: 'rotateOut',
  53: 'zoomOut'
};
const EMPH_PRESET_TO_EFFECT: Record<number, string> = {
  1: 'pulse',
  6: 'rubberBand',
  7: 'pulse',
  8: 'tada',
  9: 'pulse',
  19: 'pulse',
  21: 'pulse',
  24: 'pulse',
  25: 'pulse',
  26: 'pulse',
  27: 'pulse',
  30: 'pulse',
  32: 'shakeX'
};
function directionalEffect(table: Record<number, string>, subtype: number, fallback: string): string {
  return table[subtype] || fallback;
}
export function mapPresetToEffect(presetClass: string, presetId: number, filter = '', presetSubtype = 0): string {
  const f = filter.toLowerCase();
  if (presetClass === 'entr') {
    if (presetId === 2 || presetId === 22 || presetId === 19 || f.includes('wipe')) {
      return directionalEffect(FLY_IN_SUBTYPE, presetSubtype, ENTR_PRESET_TO_EFFECT[presetId] || 'fadeInLeft');
    }
    if (f.includes('fade') || presetId === 10) return 'fadeIn';
    return ENTR_PRESET_TO_EFFECT[presetId] || 'fadeIn';
  }
  if (presetClass === 'exit') {
    if (presetId === 2 || presetId === 22 || presetId === 19 || f.includes('wipe')) {
      return directionalEffect(FLY_OUT_SUBTYPE, presetSubtype, EXIT_PRESET_TO_EFFECT[presetId] || 'fadeOutLeft');
    }
    if (f.includes('fade') || presetId === 10) return 'fadeOut';
    return EXIT_PRESET_TO_EFFECT[presetId] || 'fadeOut';
  }
  if (presetClass === 'emph') return EMPH_PRESET_TO_EFFECT[presetId] || 'pulse';
  return 'pulse';
}
function parseXmlDuration(value: string | undefined, fallback = 1000): number {
  if (!value || value === 'indefinite') return fallback;
  const ms = Number(value);
  return Number.isFinite(ms) && ms >= 0 ? ms : fallback;
}
function collectXmlAnimations(nodes: Array<XmlNode | string> | undefined, inheritedTrigger?: PPTAnimation['trigger']): ImportedSlideAnimation[] {
  const animations: ImportedSlideAnimation[] = [];
  if (!nodes) return animations;
  for (const node of nodes) {
    if (typeof node === 'string' || !node.tagName) continue;
    const tag = localName(node.tagName);
    const attrs = node.attributes || {};
    if (tag === 'cTn') {
      const presetClass = attrs.presetClass;
      const nodeType = attrs.nodeType;
      const trigger = nodeType && NODE_TYPE_TO_TRIGGER[nodeType] || inheritedTrigger;
      const type = presetClass ? PRESET_CLASS_TO_TYPE[presetClass] : undefined;
      if (presetClass && !SKIP_PRESET_CLASSES.has(presetClass) && type) {
        const resolvedTrigger = trigger || 'click';
        let objectId = '';
        let filter = '';
        let duration = parseXmlDuration(attrs.dur, 1000);
        walkXml(node.children, child => {
          if (localName(child.tagName) === 'spTgt' && !objectId) {
            objectId = child.attributes?.spid || '';
          }
          if (localName(child.tagName) === 'animEffect') {
            filter = child.attributes?.filter || filter;
          }
          if (localName(child.tagName) === 'cTn') {
            const inner = parseXmlDuration(child.attributes?.dur, -1);
            if (inner >= 0 && child.attributes?.dur && child.attributes.dur !== 'indefinite') {
              duration = inner;
            }
          }
        });
        if (objectId) {
          animations.push({
            objectId,
            trigger: resolvedTrigger,
            type,
            effect: mapPresetToEffect(presetClass, Number(attrs.presetID || 0), filter, Number(attrs.presetSubtype || 0)),
            duration
          });
        }
        continue;
      }
      animations.push(...collectXmlAnimations(node.children, trigger));
      continue;
    }
    animations.push(...collectXmlAnimations(node.children, inheritedTrigger));
  }
  return animations;
}

/**
 * Parse `p:timing` click/build animations from a slide XML part.
 * Effect nodes are `p:cTn` with `presetClass`; `nodeType` may live on an ancestor
 * grouping wrapper. Document order is the presenter sequence.
 */
export function extractSlideAnimationsFromXml(xml: string): ImportedSlideAnimation[] {
  if (!xml || !xml.includes('<p:timing')) return [];
  return collectXmlAnimations(parseXml(xml) as XmlNode[]);
}
export function mapPptxtojsonAnimation(anim: PptxtojsonSlideAnimation): ImportedSlideAnimation | null {
  if (!anim?.spid || SKIP_PRESET_CLASSES.has(anim.class)) return null;
  const type = PRESET_CLASS_TO_TYPE[anim.class];
  const trigger = JSON_TRIGGER_TO_FIKA[anim.trigger] || NODE_TYPE_TO_TRIGGER[anim.trigger];
  if (!type || !trigger) return null;
  return {
    objectId: String(anim.spid),
    trigger,
    type,
    effect: mapPresetToEffect(anim.class, anim.presetId, anim.filter || '', anim.presetSubtype || 0),
    duration: anim.duration > 0 ? anim.duration : 1000
  };
}

/** Map OOXML shape ids onto imported editor elements via `source.objectId` or a spid map. */
export function bindImportedAnimations(imported: ImportedSlideAnimation[], elements: Array<{
  id: string;
  source?: {
    objectId?: string;
  };
}>, spidToElId?: Map<string, string>): PPTAnimation[] {
  const elByObjectId = new Map<string, string>();
  for (const el of elements) {
    const oid = el.source?.objectId;
    if (oid && !elByObjectId.has(oid)) elByObjectId.set(oid, el.id);
  }
  if (spidToElId) {
    for (const [spid, elId] of spidToElId) {
      if (!elByObjectId.has(spid)) elByObjectId.set(spid, elId);
    }
  }
  const animations: PPTAnimation[] = [];
  for (const item of imported) {
    const elId = elByObjectId.get(item.objectId);
    if (!elId) continue;
    animations.push({
      id: nanoid(10),
      elId,
      effect: item.effect,
      type: item.type,
      duration: item.duration,
      trigger: item.trigger
    });
  }
  return animations;
}

/**
 * Extract comments + cNvPr provenance from the retained OOXML package.
 */
export async function extractPptxImportExtras(bytes: ArrayBuffer): Promise<PptxImportExtras> {
  const packageId = await hashPackageId(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const authorsXml = (await readZipText(zip, 'ppt/authors.xml')) || (await readZipText(zip, 'ppt/commentAuthors.xml'));
  const authors = authorsXml ? parseCommentAuthorsXml(authorsXml) : new Map<string, string>();
  const commentsBySlide = new Map<number, Note[]>();
  const identitiesBySlide = new Map<number, SlideObjectIdentity[]>();
  const animationsBySlide = new Map<number, ImportedSlideAnimation[]>();
  const slidePaths = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name) && !zip.files[name].dir).sort((a, b) => {
    const na = Number(a.match(/slide(\d+)/i)?.[1] || 0);
    const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0);
    return na - nb;
  });
  for (const slidePath of slidePaths) {
    const slideNum = Number(slidePath.match(/slide(\d+)/i)?.[1] || 0);
    const slideIndex = Math.max(0, slideNum - 1);
    const slideXml = await readZipText(zip, slidePath);
    if (slideXml) {
      identitiesBySlide.set(slideIndex, extractCNvPrIdentitiesFromSlideXml(slideXml, slidePath));
      const anims = extractSlideAnimationsFromXml(slideXml);
      if (anims.length) animationsBySlide.set(slideIndex, anims);
    }
    const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const relsXml = await readZipText(zip, relsPath);
    if (!relsXml) continue;
    const relRoots = parseXml(relsXml) as XmlNode[];
    const commentTargets: string[] = [];
    walkXml(relRoots, node => {
      if (localName(node.tagName) !== 'Relationship') return;
      const type = node.attributes?.Type || '';
      if (!/\/comments/i.test(type) && !/relationships\/comments/i.test(type)) return;
      const target = node.attributes?.Target;
      if (target) commentTargets.push(normalizePartTarget(slidePath, target));
    });
    const notes: Note[] = [];
    for (const target of commentTargets) {
      const xml = await readZipText(zip, target);
      if (!xml) continue;
      notes.push(...parseCommentsXml(xml, authors));
    }
    if (notes.length) commentsBySlide.set(slideIndex, notes);
  }
  return {
    packageId,
    commentsBySlide,
    identitiesBySlide,
    animationsBySlide
  };
}
export function attachElementSource(element: {
  source?: ElementSource;
  effects?: PPTElementEffects;
}, packageId: string, identity?: SlideObjectIdentity) {
  if (!identity) return;
  element.source = {
    packageId,
    partPath: identity.partPath,
    objectId: identity.objectId,
    order: identity.order,
    name: identity.name
  };
  if (identity.effects && !element.effects) element.effects = identity.effects;
}

/**
 * Match a pptxtojson element box (points, pre-scale) to a slide-local cNvPr identity.
 * Consumes the identity so one OOXML object maps to one editor element.
 */
export function takeIdentityForGeometry(pool: SlideObjectIdentity[] | undefined, box: {
  left: number;
  top: number;
  width: number;
  height: number;
}, epsilon = 0.75): SlideObjectIdentity | undefined {
  if (!pool?.length) return undefined;
  const index = pool.findIndex(item => Math.abs(item.left - box.left) <= epsilon && Math.abs(item.top - box.top) <= epsilon && Math.abs(item.width - box.width) <= epsilon && Math.abs(item.height - box.height) <= epsilon);
  if (index < 0) return undefined;
  const [identity] = pool.splice(index, 1);
  return identity;
}

/** Match a pptxtojson `el.id` (cNvPr id) when geometry matching misses. */
export function takeIdentityForObjectId(pool: SlideObjectIdentity[] | undefined, objectId: string | undefined): SlideObjectIdentity | undefined {
  if (!pool?.length || objectId == null || objectId === '') return undefined;
  const index = pool.findIndex(item => item.objectId === String(objectId));
  if (index < 0) return undefined;
  const [identity] = pool.splice(index, 1);
  return identity;
}

/** @deprecated Prefer takeIdentityForGeometry — pptxtojson order is parser-private. */
export function takeIdentityForOrder(pool: SlideObjectIdentity[] | undefined, order: number | undefined): SlideObjectIdentity | undefined {
  if (!pool?.length || order == null || !Number.isFinite(order)) return undefined;
  const index = pool.findIndex(item => item.order === order);
  if (index < 0) return undefined;
  const [identity] = pool.splice(index, 1);
  return identity;
}
