/**
 * Font embedding for PPTX export.
 *
 * Collects the non-system font families actually used in the deck, fetches their
 * woff2 bytes (bundled via `new URL(...)` so Vite emits them), decompresses
 * woff2 → TTF (via woff-lib, pure TS), and returns `AddFontOptions[]` for
 * `pptx.addFont()`. PPTX embeds fonts as EOT-wrapped data and pptxgenjs handles
 * TTF/OTF directly, so the only required step is woff2 → TTF decompression.
 *
 * woff-lib replaced wawoff2 here: wawoff2 is a Node-targeted Emscripten binary
 * whose `onRuntimeInitialized` promise never resolves when the runtime fails to
 * boot inside a bundled web build, hanging exports forever with no error.
 */
import type pptxgen from 'pptxgenjs-plus';
import { createExportWorker } from './exportWorker';
import type { PptxExportCommand } from './pptxExportCommands';
type AddFontOptions = Parameters<pptxgen['addFont']>[0];

const FONT_FILES: Record<string, string> = {
  inter: new URL('../assets/fonts/Inter.woff2', import.meta.url).href,
  jetbrainsmono: new URL('../assets/fonts/JetBrainsMono.woff2', import.meta.url).href,
  lato: new URL('../assets/fonts/Lato.woff2', import.meta.url).href,
  literata: new URL('../assets/fonts/Literata.woff2', import.meta.url).href,
  merriweather: new URL('../assets/fonts/Merriweather.woff2', import.meta.url).href,
  montserrat: new URL('../assets/fonts/Montserrat.woff2', import.meta.url).href,
  opensans: new URL('../assets/fonts/OpenSans.woff2', import.meta.url).href,
  roboto: new URL('../assets/fonts/Roboto.woff2', import.meta.url).href,
  sourcesanspro: new URL('../assets/fonts/SourceSansPro.woff2', import.meta.url).href,
  sourceserif4: new URL('../assets/fonts/SourceSerif4.woff2', import.meta.url).href
};

const FONT_FACE_NAMES: Record<string, string> = {
  inter: 'Inter',
  jetbrainsmono: 'JetBrainsMono',
  lato: 'Lato',
  literata: 'Literata',
  merriweather: 'Merriweather',
  montserrat: 'Montserrat',
  opensans: 'OpenSans',
  roboto: 'Roboto',
  sourcesanspro: 'SourceSansPro',
  sourceserif4: 'SourceSerif4'
};
/** A single font decompression must never block the export pipeline. */
const FONT_DECODE_TIMEOUT_MS = 15000;

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
};

/** Normalize a CSS font-family token to a comparable lowercase key. */
const normalizeFamily = (family: string) => family.trim().replace(/^['"]+|['"]+$/g, '').trim().toLowerCase();

/** Collect candidate font families from a CSS font-family string. */
export const parseFontFamilyList = (value?: string): string[] => {
  if (!value) return [];
  return value.split(',').map(normalizeFamily).filter(Boolean);
};

/** Bundled fonts travel with the deck, even when installed on this computer. */
export const isEmbeddableFont = (family: string): boolean => {
  return !!FONT_FILES[normalizeFamily(family).replace(/\s+/g, '')];
};

/**
 * Embed fonts used in the deck into the PPTX.
 * `usedFamilies` should be the raw font-family strings gathered from elements/theme.
 * Unbundled families remain available for the viewer to resolve. A bundled font
 * failing to load rejects export instead of silently losing portability.
 */
export const collectEmbeddedFonts = async (usedFamilies: string[]): Promise<AddFontOptions[]> => {
  const out: AddFontOptions[] = [];
  const seen = new Set<string>();
  for (const raw of usedFamilies) {
    for (const family of parseFontFamilyList(raw)) {
      if (seen.has(family)) continue;
      seen.add(family);
      if (!isEmbeddableFont(family)) continue;

      const fileUrl = FONT_FILES[family] ?? FONT_FILES[family.replace(/\s+/g, '')];
      if (!fileUrl) continue;
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
        const woff2 = new Uint8Array(await res.arrayBuffer());
        const worker = createExportWorker();
        let fontFile: ArrayBuffer;
        try { fontFile = await withTimeout(worker.request<ArrayBuffer>('font', woff2.buffer, [woff2.buffer]), FONT_DECODE_TIMEOUT_MS, `woff2 decode ${family}`); }
        finally { worker.close(); }
        out.push({
          fontFace: FONT_FACE_NAMES[family] ?? FONT_FACE_NAMES[family.replace(/\s+/g, '')] ?? family,
          fontFile,
          fontType: 'ttf'
        });
      } catch (error) {
        throw new Error(`Could not embed presentation font ${family}`, { cause: error });
      }
    }
  }
  return out;
};

/**
 * Inspect the final generator commands, including rich text runs, shape text,
 * tables, charts and theme defaults. CSS fallback lists are not OOXML typefaces;
 * use their first family and the same canonical name as our embedded font.
 */
export const preparePptxFontFamilies = (commands: PptxExportCommand[]): string[] => {
  const families = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['fontFace', 'headFontFace', 'bodyFontFace'].includes(key) && typeof child === 'string') {
        const first = child.split(',')[0].trim().replace(/^['"]+|['"]+$/g, '').trim();
        const family = FONT_FACE_NAMES[normalizeFamily(first).replace(/\s+/g, '')] ?? first;
        (value as Record<string, unknown>)[key] = family;
        if (family) families.add(family);
      } else visit(child);
    }
  };
  visit(commands);
  return [...families];
};
