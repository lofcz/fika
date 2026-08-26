/**
 * Shared MathLive typesetting helpers.
 *
 * LaTeX is the single source of truth for in-text math. It is carried on a
 * canonical wrapper element:
 *
 *   <span class="fika-math" data-latex="\frac{1}{2}" data-display="false">…markup…</span>
 *
 * The inner markup is MathLive's `convertLatexToMarkup` output, preserved in the
 * stored HTML so the static render paths (`v-html`) and ProseMirror round-trips
 * never need to re-typeset existing content. MathLive (JS + `static.css` +
 * `fonts.css`) is lazy-loaded the first time math actually appears or an editor
 * opens, so decks without math never pull it into the bundle.
 */

import { decodeXML } from 'entities';
import { getFikaPortalTarget } from '@/utils/portal';

export const MATH_CLASS = 'fika-math';
type ConvertLatexToMarkup = (latex: string, options?: {
  defaultMode?: 'inline-math' | 'math' | 'text';
}) => string;
type ConvertLatexToMathMl = (latex: string, options?: {
  generateID?: boolean;
}) => string;
interface MathliveModule {
  convertLatexToMarkup: ConvertLatexToMarkup;
  convertLatexToMathMl: ConvertLatexToMathMl;
  initVirtualKeyboardInCurrentBrowsingContext?: () => void;
  MathfieldElement: {
    fontsDirectory: string | null;
    soundsDirectory: string | null;
  };
}
let mathlive: MathliveModule | null = null;
let mathlivePromise: Promise<MathliveModule> | null = null;
const MATH_KEYBOARD_HOST_ID = 'fika-math-keyboard-host';
type MathVirtualKeyboard = {
  container: HTMLElement | null;
};

/**
 * MathLive's default keyboard container is `document.body`. When shown it
 * writes `padding-bottom` onto the body so page content scrolls above the
 * keys. Fika's canvas is `height: 100%` of that body, so the padding
 * shrinks the slide and the viewport observer refits it smaller.
 *
 * Dock the keyboard in a fixed overlay instead — MathLive skips the padding
 * whenever `container !== document.body`.
 */
export function dockMathVirtualKeyboard() {
  const vk = (window as unknown as {
    mathVirtualKeyboard?: MathVirtualKeyboard;
  }).mathVirtualKeyboard;
  if (!vk) return;
  let host = document.getElementById(MATH_KEYBOARD_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = MATH_KEYBOARD_HOST_ID;
    getFikaPortalTarget().appendChild(host);
  }
  if (vk.container !== host) vk.container = host;
  document.body.style.removeProperty('padding-bottom');
}

/**
 * Reactive flag flipped to `true` once MathLive has loaded. Reading it inside a
 * render (e.g. table `formatText`) registers a dependency so the math re-renders
 * the moment the engine becomes available.
 */
export const mathReady = { value: false };

/** Lazily import MathLive and configure it for a bundled (offline) font setup. */
export function ensureMathliveReady(): Promise<MathliveModule> {
  if (mathlivePromise) return mathlivePromise;
  mathlivePromise = import('mathlive').then((mod) => {
    const resolved = mod as unknown as MathliveModule;
    try {
      resolved.MathfieldElement.fontsDirectory = null;
      resolved.MathfieldElement.soundsDirectory = null;
    } catch {}
    try {
      resolved.initVirtualKeyboardInCurrentBrowsingContext?.();
    } catch {}
    mathlive = resolved;
    mathReady.value = true;
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--keyboard-zindex', '5100');
      dockMathVirtualKeyboard();
    }
    return resolved;
  }).catch(err => {
    mathlivePromise = null;
    throw err;
  });
  return mathlivePromise;
}

/**
 * Recover LaTeX that passed through XML/HTML entity encoding.
 * `entities.decodeXML` turns `&lt;` into `<`. A leftover `\<` is the
 * `&lt;` → `\&lt;` → HTML-decode artifact, not a TeX control sequence.
 */
export function normalizeImportedLatex(latex: string): string {
  if (!latex) return latex;
  return decodeXML(latex).replace(/\\([<>])/g, '$1');
}

/** Escape a string for safe inclusion in a double-quoted HTML attribute. */
export function escapeLatexAttr(latex: string): string {
  return latex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escape plain text for safe inclusion in HTML element content. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render `latex` to the canonical `span.fika-math` wrapper HTML string. Must
 * only be called once {@link ensureMathliveReady} has resolved (the markdown
 * pipeline and editor await it; tables fall back to literal source until ready).
 */
export function renderMathToHtml(latex: string, display = false): string {
  latex = normalizeImportedLatex(latex);
  const attrs = `class="${MATH_CLASS}" data-latex="${escapeLatexAttr(latex)}"${display ? ' data-display="true"' : ''}`;
  if (!mathlive) {
    return `<span ${attrs} data-pending="true">${escapeHtml(latex)}</span>`;
  }
  const markup = mathlive.convertLatexToMarkup(latex, {
    defaultMode: display ? 'math' : 'inline-math'
  });
  return `<span ${attrs}>${markup}</span>`;
}

/**
 * Build a real `span.fika-math` DOM node for the given latex/markup. Used by
 * the ProseMirror schema `toDOM` so the editor DOM (and the innerHTML persisted
 * on edit) is the same canonical wrapper the parser reads back.
 */
export function buildMathElement(latex: string, html: string, display = false): HTMLSpanElement {
  latex = normalizeImportedLatex(latex);
  const span = document.createElement('span');
  span.className = MATH_CLASS;
  span.setAttribute('data-latex', latex);
  if (display) span.setAttribute('data-display', 'true');
  span.setAttribute('contenteditable', 'false');
  if (mathlive) {
    span.innerHTML = mathlive.convertLatexToMarkup(latex, {
      defaultMode: display ? 'math' : 'inline-math'
    });
  } else {
    span.innerHTML = html || escapeHtml(latex);
  }
  return span;
}

/** Engine adapter that lets `markdown-it-texmath` typeset via MathLive. */
export const texmathEngine = {
  renderToString(latex: string, options?: {
    displayMode?: boolean;
  }): string {
    return renderMathToHtml(latex, !!options?.displayMode);
  }
};

/**
 * Sync MathML conversion — only valid after {@link ensureMathliveReady} has resolved.
 * Throws if MathLive is not loaded yet.
 */
export function convertLatexToMathMlSync(latex: string): string {
  if (!mathlive) throw new Error('MathLive not ready — await ensureMathliveReady() first');
  return mathlive.convertLatexToMathMl(latex);
}

/** Unscaled font-size used when measuring and painting standalone formula elements. */
export const LATEX_ELEMENT_FONT_SIZE = 36;
const LATEX_ELEMENT_PAD = 12;

/**
 * Typeset a standalone formula element. Same MathLive/KaTeX-font pipeline as
 * inline math — not the old hfmath stroke paths.
 */
export function renderLatexElementHtml(latex: string): string {
  const attrs = `class="${MATH_CLASS} latex-el" data-latex="${escapeLatexAttr(latex)}"`;
  if (!mathlive) {
    return `<span ${attrs} data-pending="true">${escapeHtml(latex)}</span>`;
  }
  const markup = mathlive.convertLatexToMarkup(latex, {
    defaultMode: 'math'
  });
  return `<span ${attrs}>${markup}</span>`;
}

/** Natural box of a formula at {@link LATEX_ELEMENT_FONT_SIZE}, plus padding. */
export async function measureLatexElement(latex: string): Promise<{
  width: number;
  height: number;
}> {
  await ensureMathliveReady();
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>(resolve => { setTimeout(resolve, 80) }),
    ])
  } catch {}
  const probe = document.createElement('div');
  probe.style.cssText = ['position:absolute', 'left:-99999px', 'top:0', `font-size:${LATEX_ELEMENT_FONT_SIZE}px`, 'line-height:normal', 'width:max-content', 'pointer-events:none'].join(';');
  probe.innerHTML = renderLatexElementHtml(latex);
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  const width = Math.max(48, Math.ceil(rect.width) + LATEX_ELEMENT_PAD);
  const height = Math.max(36, Math.ceil(rect.height) + LATEX_ELEMENT_PAD);
  document.body.removeChild(probe);
  return {
    width,
    height
  };
}
const MATH_HTML_RE = /class=["']?fika-math|data-latex=|<eq[\s>]|<eqn[\s>]/i;
const TEX_CONTROL_RE = /\\[a-zA-Z]/;

/** True when an HTML string already contains rendered/wrapped math. */
export function htmlContainsMath(html: string): boolean {
  return !!html && (MATH_HTML_RE.test(html) || TEX_CONTROL_RE.test(html));
}

/** True when a stored deck needs MathLive CSS to paint stacked fractions. */
export function deckHasMath(slides: ReadonlyArray<{ elements?: ReadonlyArray<unknown> }>): boolean {
  for (const slide of slides ?? []) {
    for (const raw of slide.elements ?? []) {
      const el = raw as Record<string, unknown>;
      if (el.type === 'latex') return true;
      if (typeof el.content === 'string' && htmlContainsMath(el.content)) return true;
      const text = el.text as { content?: string } | undefined;
      if (typeof text?.content === 'string' && htmlContainsMath(text.content)) return true;
      if (el.type === 'table' && Array.isArray(el.data)) {
        for (const row of el.data as Array<Array<{ text?: string }>>) {
          for (const cell of row ?? []) {
            if (cell?.text && htmlContainsMath(cell.text)) return true;
          }
        }
      }
    }
  }
  return false;
}

/** Load MathLive CSS/fonts when the deck already has typeset math. */
export function ensureMathStylesForSlides(slides: ReadonlyArray<{ elements?: ReadonlyArray<unknown> }>) {
  if (!deckHasMath(slides)) return;
  void ensureMathliveReady().catch(() => {});
}
