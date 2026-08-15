/**
 * Font embedding for PPTX export.
 *
 * Collects the non-system font families actually used in the deck, fetches their
 * woff2 bytes (bundled via `new URL(...)` so Vite emits them), decompresses
 * woff2 → TTF (via wawoff2), and returns `AddFontOptions[]` for `pptx.addFont()`.
 * PPTX embeds fonts as EOT-wrapped data and pptxgenjs handles TTF/OTF directly,
 * so the only required step is woff2 → TTF decompression.
 */
import type pptxgen from 'pptxgenjs-plus';
import { isSystemFont } from '@/utils/font';
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
interface Woff2Tool {
  compress: (buf: Uint8Array) => Promise<Uint8Array>;
  decompress: (buf: Uint8Array) => Promise<Uint8Array>;
}
let woff2Module: Woff2Tool | null = null;
const loadWoff2 = async (): Promise<Woff2Tool> => {
  if (woff2Module) return woff2Module;
  const mod = (await import('wawoff2')) as unknown as Woff2Tool & {
    default?: Woff2Tool;
  };
  woff2Module = mod.default ?? mod;
  return woff2Module;
};

/** Normalize a CSS font-family token to a comparable lowercase key. */
const normalizeFamily = (family: string) => family.replace(/^['"]+|['"]+$/g, '').trim().toLowerCase();

/** Collect candidate font families from a CSS font-family string. */
export const parseFontFamilyList = (value?: string): string[] => {
  if (!value) return [];
  return value.split(',').map(normalizeFamily).filter(Boolean);
};

/** Decide whether a family should be embedded (custom, not a system font). */
export const isEmbeddableFont = (family: string): boolean => {
  if (!family) return false;
  return !isSystemFont(family);
};

/**
 * Embed fonts used in the deck into the PPTX.
 * `usedFamilies` should be the raw font-family strings gathered from elements/theme.
 * Silently skips families that are system fonts, have no bundled file, or fail to load.
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
        if (!res.ok) continue;
        const woff2 = new Uint8Array(await res.arrayBuffer());
        const woff2Tool = await loadWoff2();
        const ttf = await woff2Tool.decompress(woff2);
        const fontFile = new Uint8Array(ttf).buffer;
        out.push({
          fontFace: FONT_FACE_NAMES[family] ?? FONT_FACE_NAMES[family.replace(/\s+/g, '')] ?? family,
          fontFile,
          fontType: 'ttf'
        });
      } catch {
      }
    }
  }
  return out;
};
