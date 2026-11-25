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
import { APP_SHELL_ID, EMBED_ROOT_CLASS, getFikaPortalTarget, MATH_PROBE_ATTR, resolveOffscreenHost } from '@/utils/portal';
import { MATH_FONT_CHANGE_TOKEN, notifyInlineMathReady, registerInlineMathMeasurer, subscribeTextFontChanges } from '@/utils/textFit';

export { MATH_CLASS, estimateInlineMathBox, htmlHasFikaMath, isPlausibleInlineMathBox } from './inlineMathBox';
import { estimateInlineMathBox, isPlausibleInlineMathBox, MATH_CLASS } from './inlineMathBox';
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
    stylesheetScope: string | null;
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
 * Dock the keyboard in a host that spans the portal (the Fika root) instead —
 * MathLive skips the padding whenever `container !== document.body`, and its
 * custom-container rules stack the keys at the host's bottom edge.
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
let mathReadyVersion = 0;
const mathReadyListeners = new Set<() => void>();

export const getMathReadyVersion = () => mathReadyVersion;

export const subscribeMathReady = (listener: () => void) => {
  mathReadyListeners.add(listener);
  return () => { mathReadyListeners.delete(listener); };
};

export function renderMathInnerMarkup(latex: string, display = false): string | null {
  if (!mathlive) return null;
  return mathlive.convertLatexToMarkup(normalizeImportedLatex(latex), {
    defaultMode: display ? 'math' : 'inline-math',
  });
}

/** Lazily import MathLive and configure it for a bundled (offline) font setup. */
export function ensureMathliveReady(): Promise<MathliveModule> {
  if (mathlivePromise) return mathlivePromise;
  // `import('mathlive')` is the JS engine only. convertLatexToMarkup emits
  // ML__* spans; the radical bar, fraction rule, KaTeX metrics and nowrap
  // live in static.css. Without it the markup paints as a flat system-font
  // run (√788 + sin(x) wrapping, \\frac{2}{3} reading as "32").
  mathlivePromise = Promise.all([
    import('mathlive'),
    import('mathlive/static.css'),
    import('mathlive/fonts.css'),
  ]).then(([mod]) => {
    const resolved = mod as unknown as MathliveModule;
    try {
      resolved.MathfieldElement.fontsDirectory = null;
      resolved.MathfieldElement.soundsDirectory = null;
      // Document-level MathLive sheets (keyboard, popovers) only apply inside
      // Fika — the embed root or the standalone shell.
      resolved.MathfieldElement.stylesheetScope = `:is(.${EMBED_ROOT_CLASS}, #${APP_SHELL_ID})`;
    } catch {}
    try {
      resolved.initVirtualKeyboardInCurrentBrowsingContext?.();
    } catch {}
    mathlive = resolved;
    mathReady.value = true;
    mathReadyVersion++;
    clearInlineMathBoxCaches();
    notifyInlineMathReady();
    for (const listener of Array.from(mathReadyListeners)) listener();
    if (typeof document !== 'undefined') {
      dockMathVirtualKeyboard();
      // Kick off loading every declared KaTeX face once so later formulas
      // (\sqrt, \sum, \int) never trigger mid-scroll font-load cache wipes.
      if (document.fonts) {
        try {
          for (const face of document.fonts as unknown as Iterable<FontFace>) {
            if (face.status === 'unloaded' && /KaTeX/i.test(face.family)) {
              void face.load().catch(() => {});
            }
          }
        } catch {}
      }
      if (document.fonts?.status === 'loading') {
        document.fonts.ready.then(() => {
          clearInlineMathBoxCaches();
          notifyInlineMathReady();
        }).catch(() => {});
      }
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

const inlineMathBoxCache = new Map<string, { width: number; height: number }>()
const failedMathBoxCache = new Set<string>()
let reusableMathProbe: HTMLDivElement | null = null

const clearInlineMathBoxCaches = () => {
  inlineMathBoxCache.clear()
  failedMathBoxCache.clear()
}

/** @internal Exposed for unit tests to reset cached probe/boxes between runs. */
export const resetInlineMathProbeForTest = () => {
  clearInlineMathBoxCaches()
  reusableMathProbe = null
}

subscribeTextFontChanges(families => {
  if (!families || families.has(MATH_FONT_CHANGE_TOKEN)) {
    clearInlineMathBoxCaches()
    return
  }
  for (const family of families) {
    if (family.includes('katex')) {
      clearInlineMathBoxCaches()
      return
    }
  }
})

const inlineMathBoxKey = (latex: string, fontSize: number, display: boolean) => (
  `${latex}\0${Math.round(fontSize * 100)}\0${display ? 1 : 0}`
)

const ensureReusableMathProbe = (): HTMLDivElement => {
  const host = resolveOffscreenHost()
  if (!reusableMathProbe) {
    const probe = document.createElement('div')
    probe.className = EMBED_ROOT_CLASS
    probe.setAttribute('aria-hidden', 'true')
    probe.setAttribute(MATH_PROBE_ATTR, 'true')
    probe.style.cssText = [
      'position:absolute',
      'left:-99999px',
      'top:0',
      'line-height:normal',
      'width:max-content',
      'white-space:nowrap',
      'pointer-events:none',
      'contain:layout style',
    ].join(';')
    reusableMathProbe = probe
  }
  if (reusableMathProbe.parentNode !== host && !reusableMathProbe.contains(host)) {
    host.appendChild(reusableMathProbe)
  }
  return reusableMathProbe
}

const measureMathAtFontSize = (
  latex: string,
  fontSize: number,
  display: boolean,
  renderHtml: (latex: string, display: boolean) => string = renderMathToHtml,
): {
  width: number
  height: number
} | null => {
  const probe = ensureReusableMathProbe()
  probe.style.fontSize = `${Math.max(1, fontSize)}px`
  probe.innerHTML = renderHtml(latex, display)
  const rect = probe.getBoundingClientRect()
  probe.innerHTML = ''
  if (!(rect.width > 0) || !(rect.height > 0)) return null
  return {
    width: rect.width,
    height: Math.max(rect.height, fontSize),
  }
}

/** @internal Shared probe + cache pipeline (testable without loading MathLive). */
export function measureInlineMathBoxWithRenderer(
  latex: string,
  fontSize: number,
  display: boolean,
  renderHtml: (latex: string, display: boolean) => string,
): {
  width: number
  height: number
} | null {
  if (typeof document === 'undefined') return null
  const key = inlineMathBoxKey(latex, fontSize, display)
  const cached = inlineMathBoxCache.get(key)
  if (cached) return cached
  if (failedMathBoxCache.has(key)) return null

  const exact = measureMathAtFontSize(latex, fontSize, display, renderHtml)
  if (!exact) return null
  if (!isPlausibleInlineMathBox(exact, fontSize, estimateInlineMathBox(latex, fontSize, display))) {
    failedMathBoxCache.add(key)
    return null
  }
  inlineMathBoxCache.set(key, exact)
  return exact
}

/**
 * Sync natural box of inline/display math at exact `fontSize` using a single
 * reused, layout-contained offscreen probe (`contain: layout style`), with
 * cached results and per-revision failure memoization. Exact-size probing
 * avoids >0.5px font-hinting width drift seen with linear 24px scaling.
 * Zero-size measurements (e.g. inside a temporarily hidden `display:none`
 * embed) are never cached as failures so visibility recovery re-measures.
 */
export function measureInlineMathBox(latex: string, fontSize: number, display = false): {
  width: number
  height: number
} | null {
  if (!mathlive || typeof document === 'undefined') return null
  return measureInlineMathBoxWithRenderer(latex, fontSize, display, renderMathToHtml)
}
registerInlineMathMeasurer(measureInlineMathBox)

/** Measured box when MathLive is ready, otherwise a conservative estimate. */
export function inlineMathBox(latex: string, fontSize: number, display = false): {
  width: number
  height: number
} {
  return measureInlineMathBox(latex, fontSize, display) ?? estimateInlineMathBox(latex, fontSize, display)
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
  probe.className = EMBED_ROOT_CLASS;
  probe.style.cssText = ['position:absolute', 'left:-99999px', 'top:0', `font-size:${LATEX_ELEMENT_FONT_SIZE}px`, 'line-height:normal', 'width:max-content', 'pointer-events:none'].join(';');
  probe.innerHTML = renderLatexElementHtml(latex);
  const host = resolveOffscreenHost();
  host.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  const MAX = 2000;
  const width = Math.min(MAX, Math.max(48, Math.ceil(rect.width) + LATEX_ELEMENT_PAD));
  const height = Math.min(MAX, Math.max(36, Math.ceil(rect.height) + LATEX_ELEMENT_PAD));
  host.removeChild(probe);
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
