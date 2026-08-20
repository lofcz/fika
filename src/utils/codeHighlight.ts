import { CODE_LANGUAGE_ALIASES, type CodeLanguageId, type CodeThemeId, resolveCodeLanguage, resolveCodeTheme } from '@/configs/code';
type HighlighterCore = {
  loadLanguage: (...langs: unknown[]) => Promise<void>;
  loadTheme: (...themes: unknown[]) => Promise<void>;
  getLoadedLanguages: () => string[];
  getLoadedThemes: () => string[];
  getLanguage: (...args: unknown[]) => unknown;
  setTheme: (...args: unknown[]) => unknown;
  codeToHtml: (code: string, options: {
    lang: string;
    theme: string;
    structure?: 'classic' | 'inline';
  }) => string;
  codeToTokens: (code: string, options: {
    lang: string;
    theme: string;
  }) => {
    tokens: Array<Array<{
      content: string;
      offset: number;
      color?: string;
      bgColor?: string;
      fontStyle?: number;
    }>>;
    fg?: string;
    bg?: string;
  };
  getTheme: (theme: string) => {
    bg: string;
    fg: string;
  };
};
let highlighterPromise: Promise<HighlighterCore> | null = null;
let highlighter: HighlighterCore | null = null;
const LANG_LOADERS: Record<Exclude<CodeLanguageId, 'plaintext'>, () => Promise<unknown>> = {
  typescript: () => import('@shikijs/langs/typescript'),
  javascript: () => import('@shikijs/langs/javascript'),
  python: () => import('@shikijs/langs/python'),
  json: () => import('@shikijs/langs/json'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  vue: () => import('@shikijs/langs/vue'),
  rust: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go'),
  java: () => import('@shikijs/langs/java'),
  csharp: () => import('@shikijs/langs/csharp'),
  cpp: () => import('@shikijs/langs/cpp'),
  sql: () => import('@shikijs/langs/sql'),
  bash: () => import('@shikijs/langs/bash'),
  markdown: () => import('@shikijs/langs/markdown'),
  yaml: () => import('@shikijs/langs/yaml'),
  xml: () => import('@shikijs/langs/xml'),
  php: () => import('@shikijs/langs/php'),
  ruby: () => import('@shikijs/langs/ruby'),
  swift: () => import('@shikijs/langs/swift'),
  kotlin: () => import('@shikijs/langs/kotlin')
};
const THEME_LOADERS: Record<CodeThemeId, () => Promise<unknown>> = {
  'github-dark': () => import('@shikijs/themes/github-dark'),
  'github-light': () => import('@shikijs/themes/github-light'),
  'synthwave-84': () => import('@shikijs/themes/synthwave-84'),
  laserwave: () => import('@shikijs/themes/laserwave'),
  'aurora-x': () => import('@shikijs/themes/aurora-x'),
  andromeeda: () => import('@shikijs/themes/andromeeda'),
  houston: () => import('@shikijs/themes/houston'),
  dracula: () => import('@shikijs/themes/dracula'),
  'tokyo-night': () => import('@shikijs/themes/tokyo-night'),
  'night-owl': () => import('@shikijs/themes/night-owl'),
  horizon: () => import('@shikijs/themes/horizon'),
  monokai: () => import('@shikijs/themes/monokai'),
  plastic: () => import('@shikijs/themes/plastic'),
  poimandres: () => import('@shikijs/themes/poimandres'),
  'ayu-dark': () => import('@shikijs/themes/ayu-dark'),
  'ayu-mirage': () => import('@shikijs/themes/ayu-mirage'),
  vesper: () => import('@shikijs/themes/vesper'),
  'rose-pine': () => import('@shikijs/themes/rose-pine'),
  'rose-pine-moon': () => import('@shikijs/themes/rose-pine-moon'),
  'material-theme-palenight': () => import('@shikijs/themes/material-theme-palenight'),
  'material-theme-ocean': () => import('@shikijs/themes/material-theme-ocean'),
  'kanagawa-wave': () => import('@shikijs/themes/kanagawa-wave'),
  'one-dark-pro': () => import('@shikijs/themes/one-dark-pro'),
  'one-light': () => import('@shikijs/themes/one-light'),
  'catppuccin-mocha': () => import('@shikijs/themes/catppuccin-mocha'),
  'catppuccin-macchiato': () => import('@shikijs/themes/catppuccin-macchiato'),
  'catppuccin-frappe': () => import('@shikijs/themes/catppuccin-frappe'),
  'catppuccin-latte': () => import('@shikijs/themes/catppuccin-latte'),
  'vitesse-dark': () => import('@shikijs/themes/vitesse-dark'),
  'vitesse-light': () => import('@shikijs/themes/vitesse-light'),
  nord: () => import('@shikijs/themes/nord'),
  'min-dark': () => import('@shikijs/themes/min-dark'),
  'min-light': () => import('@shikijs/themes/min-light')
};
function isPlainLanguage(lang: string) {
  return lang === 'plaintext' || lang === 'text' || lang === 'txt' || lang === 'ansi';
}

/** Lazily create a core highlighter. No langs/themes until first highlight. */
function ensureHighlighter(): Promise<HighlighterCore> {
  if (highlighterPromise) return highlighterPromise;
  highlighterPromise = Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(([{
    createHighlighterCore
  }, {
    createJavaScriptRegexEngine
  }]) => {
    return createHighlighterCore({
      engine: createJavaScriptRegexEngine({
        forgiving: true
      })
    }) as Promise<HighlighterCore>;
  }).then(core => {
    highlighter = core;
    return core;
  });
  return highlighterPromise;
}
async function ensureLangAndTheme(highlighter: HighlighterCore, language: CodeLanguageId, theme: CodeThemeId) {
  const loadedLangs = new Set(highlighter.getLoadedLanguages());
  if (isPlainLanguage(language)) {
    if (!loadedLangs.has('text') && !loadedLangs.has('plaintext')) {
      await highlighter.loadLanguage({
        name: 'text',
        scopeName: 'text.plain',
        patterns: []
      });
    }
  } else if (!loadedLangs.has(language)) {
    const aliases = Object.entries(CODE_LANGUAGE_ALIASES).filter(([, id]) => id === language).map(([alias]) => alias);
    if (!aliases.some(alias => loadedLangs.has(alias))) {
      const loader = LANG_LOADERS[language as Exclude<CodeLanguageId, 'plaintext'>];
      if (loader) {
        const loaded = await loader();
        await highlighter.loadLanguage(loaded);
      }
    }
  }
  if (!highlighter.getLoadedThemes().includes(theme)) {
    await highlighter.loadTheme(await THEME_LOADERS[theme]());
  }
}
export interface HighlightedCode {
  html: string;
  bg: string;
  fg: string;
  language: CodeLanguageId;
  theme: CodeThemeId;
}
function innerCodeHtml(html: string) {
  const match = html.match(/<code[^>]*>([\s\S]*)<\/code>/i);
  return match ? match[1] : html;
}
export async function getHighlighter() {
  return ensureHighlighter();
}

/** Inner Shiki HTML with token spans + `\n` text nodes, no `.line` / `<br>`. */
export function toEditorHighlightHtml(shikiHtml: string, code: string): string {
  let html = innerCodeHtml(shikiHtml).replace(/<br\s*\/?>/gi, '\n');
  if (!code.endsWith('\n')) html = html.replace(/\n$/, '');
  return html;
}
export type HighlightedToken = {
  content: string;
  color?: string;
};
export type HighlightedTokens = {
  lines: HighlightedToken[][];
  bg: string;
  fg: string;
  language: CodeLanguageId;
  theme: CodeThemeId;
};
export async function highlightCodeTokens(code: string, language: string, theme: string): Promise<HighlightedTokens> {
  const prepared = await prepareHighlighter(language, theme);
  const result = highlighter!.codeToTokens(code, {
    lang: prepared.language,
    theme: prepared.theme
  });
  return {
    lines: result.tokens.map(line => line.map(token => ({
      content: token.content,
      color: token.color
    }))),
    bg: result.bg || prepared.bg,
    fg: result.fg || prepared.fg,
    language: prepared.language,
    theme: prepared.theme
  };
}
export async function highlightCodeBlock(code: string, language: string, theme: string): Promise<HighlightedCode> {
  const prepared = await prepareHighlighter(language, theme);
  const html = highlighter!.codeToHtml(code, {
    lang: prepared.language,
    theme: prepared.theme,
    structure: 'classic'
  });
  return {
    html,
    bg: prepared.bg,
    fg: prepared.fg,
    language: prepared.language,
    theme: prepared.theme
  };
}

/** Warm Shiki + html-to-image so the first on-slide raster is not a cold start. */
export function prefetchCodeRaster(language = 'typescript', theme = 'github-dark') {
  void prepareHighlighter(language, theme);
  void import('html-to-image');
}

/** Load core + lang + theme. Safe to call before CodeMirror/Shiki highlighting. */
export async function prepareHighlighter(language: string, theme: string) {
  const lang = resolveCodeLanguage(language);
  const resolvedTheme = resolveCodeTheme(theme);
  const core = await ensureHighlighter();
  await ensureLangAndTheme(core, lang, resolvedTheme);
  const {
    bg,
    fg
  } = core.getTheme(resolvedTheme);
  return {
    bg,
    fg,
    language: lang,
    theme: resolvedTheme
  };
}

/**
 * Sync inner HTML for tests / non-editor consumers. Call `prepareHighlighter`
 * first. Uses `structure: 'inline'` so the result round-trips through text.
 */
export function highlightEditorHtml(code: string, language: string, theme: string): string {
  if (!highlighter) return '';
  const lang = resolveCodeLanguage(language);
  const resolvedTheme = resolveCodeTheme(theme);
  const html = highlighter.codeToHtml(code, {
    lang,
    theme: resolvedTheme,
    structure: 'inline'
  });
  return toEditorHighlightHtml(html, code);
}
const CODE_BOOTH_FONT = "ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const LINE_STYLE = 'display:block;white-space:pre;min-height:1.5em;line-height:1.5';
const GUTTER_STYLE = 'display:inline-block;width:2.4em;margin-right:1em;text-align:right;opacity:0.4;user-select:none;color:inherit';
export type CodeRasterInput = {
  code: string;
  language: string;
  theme: string;
  fontSize: number;
  showLineNumbers: boolean;
};

/** Real gutter spans so SnapDOM / html-to-image do not depend on CSS counters. */
export function injectBoothLineNumbers(shikiHtml: string, showLineNumbers: boolean): string {
  let n = 0;
  return innerCodeHtml(shikiHtml).replace(/<span class="line"([^>]*)>/g, (_, attrs: string) => {
    n += 1;
    const gutter = showLineNumbers ? `<span class="gutter" style="${GUTTER_STYLE}">${n}</span>` : '';
    if (/\bstyle\s*=/.test(attrs)) {
      return `<span class="line"${attrs.replace(/style=(['"])(.*?)\1/, (_m: string, q: string, s: string) => `style=${q}${s};${LINE_STYLE}${q}`)}>${gutter}`;
    }
    return `<span class="line"${attrs} style="${LINE_STYLE}">${gutter}`;
  });
}
export async function codeElementToBoothHtml(el: CodeRasterInput): Promise<string> {
  const {
    html,
    bg,
    fg
  } = await highlightCodeBlock(el.code, el.language, el.theme);
  const lines = injectBoothLineNumbers(html, el.showLineNumbers);
  const fontSize = Math.max(8, el.fontSize || 13);
  return `<div class="code-booth" style="width:100%;height:100%;overflow:hidden;border-radius:10px;box-sizing:border-box;background:${bg};color:${fg};font-size:${fontSize}px;font-family:${CODE_BOOTH_FONT};line-height:1.5"><pre style="margin:0;padding:12px 16px;min-height:100%;background:transparent;white-space:normal;tab-size:2;box-sizing:border-box;font:inherit;color:inherit;font-family:${CODE_BOOTH_FONT}"><code style="font:inherit;background:none">${lines}</code></pre></div>`;
}
export async function renderCodeElementPng(el: CodeRasterInput & {
  width: number;
  height: number;
}): Promise<string> {
  const html = await codeElementToBoothHtml(el);
  const {
    toPng
  } = await import('html-to-image');
  const host = document.createElement('div');
  host.style.cssText = ['position:fixed', 'left:-99999px', 'top:0', `width:${el.width}px`, `height:${el.height}px`].join(';');
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    return await toPng(host, {
      width: el.width,
      height: el.height,
      pixelRatio: 2,
      cacheBust: true,
      // The clone inherits the host's computed offscreen position, which
      // would shift the capture out of view — pin it back for the snapshot.
      style: {
        position: 'static',
        left: '0',
        top: '0'
      }
    });
  } finally {
    host.remove();
  }
}
