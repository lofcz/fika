import { FONTS } from '@/configs/font';
import { normalizePptxUsedFonts, registerEmbeddedFonts, type PptxUsedFont } from '@/utils/pptxImportFonts';
export { normalizePptxUsedFonts, pptxUsedFontName, registerEmbeddedFonts, splitImportedFontFace } from '@/utils/pptxImportFonts';
export type { NormalizedPptxFont, PptxUsedFont, PptxUsedFontObject } from '@/utils/pptxImportFonts';
export const isSystemFont = (font: string) => {
  if (typeof font !== 'string') return false;
  const arial = 'Arial';
  if (font.toLowerCase() === arial.toLowerCase()) return true;
  const a = 'a';
  const size = 100;
  const width = 100;
  const height = 100;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  canvas.width = width;
  canvas.height = height;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'middle';
  const getDotArray = (_font: string) => {
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${size}px ${_font}, ${arial}`;
    ctx.fillText(a, width / 2, height / 2);
    const imageData = ctx.getImageData(0, 0, width, height).data;
    return [].slice.call(imageData).filter(item => item !== 0);
  };
  return getDotArray(arial).join('') !== getDotArray(font).join('');
};
const requestedCustomFonts = new Set<string>();

/**
 * Local / symbol / emoji faces that are not on Google Fonts. Fetching them
 * hits a Google error page with no CORS header (console noise on github.io).
 */
const NON_WEBFONT_FAMILY = /emoji|wingding|webding|twemoji|marlett|mt extra|symbol$/i;
const NON_WEBFONT_FAMILIES = new Set([
  'twemoji mozilla',
  'segoe ui emoji',
  'segoe ui symbol',
  'apple color emoji',
  'noto color emoji',
  'noto emoji',
  'android emoji',
  'emojione',
  'emojione mozilla',
  'twitter color emoji',
  'joypixels',
  'wingdings',
  'wingdings 2',
  'wingdings 3',
  'webdings',
  'symbol',
  'marlett',
  'mt extra',
]);

const isNonWebFontFamily = (font: string) => {
  const key = font.toLowerCase().trim();
  return NON_WEBFONT_FAMILIES.has(key) || NON_WEBFONT_FAMILY.test(key);
};

/**
 * Proprietary faces (Office defaults, mostly) that are not on Google Fonts.
 * Each maps to a freely available lookalike / metric-compatible family that IS
 * on Google Fonts. The substitute is registered under the ORIGINAL family
 * name, so rendering works everywhere while the document (and any export)
 * keeps the original font so PowerPoint round-trips untouched.
 */
const GOOGLE_FONT_SUBSTITUTES: Record<string, string> = {
  'aptos': 'Inter',
  'aptos display': 'Inter',
  'aptos narrow': 'Inter',
  'aptos serif': 'Source Serif 4',
  'aptos mono': 'JetBrains Mono',
  'calibri': 'Carlito',
  'calibri light': 'Carlito',
  'cambria': 'Caladea',
  'cambria math': 'Caladea',
  'segoe ui': 'Open Sans',
  'segoe ui light': 'Open Sans',
  'segoe ui semibold': 'Open Sans',
  'candara': 'Open Sans',
  'corbel': 'Lato'
};
const FONT_FAMILY_STYLE_REGEX = /font-family:\s*['"]?([^;'"<>]+)/g;

/**
 * Collect every font family a deck references: inline `font-family` styles in
 * text/table HTML content plus explicit font props (`defaultFontName`, table
 * `fontname`, theme `fontName`). Feed the result to {@link loadGoogleFonts}
 * whenever a whole document is applied — importing a .pptx is not the only
 * entry point (hosts set persisted documents directly), and a persisted deck
 * re-opened later must load its webfonts again.
 */
export const collectSlidesFonts = (slides: unknown): string[] => {
  const found = new Set<string>();
  const addFamily = (raw: string) => {
    const family = raw.split(',')[0].replace(/['"]/g, '').trim();
    if (family) found.add(family);
  };
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      if (!value.includes('font-family')) return;
      for (const match of value.matchAll(FONT_FAMILY_STYLE_REGEX)) addFamily(match[1]);
    } else if (Array.isArray(value)) value.forEach(walk);else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if ((key === 'defaultFontName' || key === 'fontname' || key === 'fontName') && typeof child === 'string') addFamily(child);else walk(child);
      }
    }
  };
  walk(slides);
  return Array.from(found);
};
export const loadGoogleFonts = (usedFonts: readonly unknown[] | PptxUsedFont[] = []) => {
  const fonts = normalizePptxUsedFonts(usedFonts);
  registerEmbeddedFonts(fonts);
  if (typeof document === 'undefined') return;
  const GOOGLE_FONTS_API = 'https://fonts.googleapis.com/css2';
  const fontWeightMap: Record<string, number> = {
    thin: 100,
    extralight: 200,
    ultralight: 200,
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    demibold: 600,
    bold: 700,
    extrabold: 800,
    ultrabold: 800,
    black: 900,
    heavy: 900
  };
  const presetFontNames = new Set<string>();
  FONTS.forEach(font => {
    if (font.label) presetFontNames.add(font.label.toLowerCase());
    if (font.value) presetFontNames.add(font.value.toLowerCase());
  });
  const embeddedNames = new Set(fonts.filter(font => font.blob).map(font => font.name.toLowerCase()));
  const fontNames = Array.from(new Set(fonts.map(font => font.name).filter(font => font && !embeddedNames.has(font.toLowerCase()) && !presetFontNames.has(font.toLowerCase()) && !isNonWebFontFamily(font) && !isSystemFont(font))));
  fontNames.forEach(async fontName => {
    const fontKey = fontName.toLowerCase();
    if (requestedCustomFonts.has(fontKey)) return;
    requestedCustomFonts.add(fontKey);
    try {
      const getFontFaceBlocks = async (family: string, weight?: number, italic = false) => {
        const fontFamily = encodeURIComponent(family).replace(/%20/g, '+');
        let fontStyle = '';
        if (italic && weight) fontStyle = `:ital,wght@1,${weight}`;else if (italic) fontStyle = ':ital@1';else if (weight) fontStyle = `:wght@${weight}`;
        let response: Response;
        try {
          response = await fetch(`${GOOGLE_FONTS_API}?family=${fontFamily}${fontStyle}`);
        } catch {
          return [];
        }
        if (!response.ok) return [];
        const cssText = await response.text();
        return Array.from(cssText.matchAll(/@font-face\s*{([^}]+)}/g)).map(match => match[1]);
      };
      const loadFontFaceBlocks = async (fontFaceBlocks: string[]) => {
        if (!fontFaceBlocks.length) return false;
        let loaded = false;
        await Promise.all(fontFaceBlocks.map(async fontFaceBlock => {
          const urlMatch = fontFaceBlock.match(/src:\s*url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^'")]+)\1\)/);
          if (!urlMatch) return;
          const descriptors: FontFaceDescriptors = {};
          const styleMatch = fontFaceBlock.match(/font-style:\s*([^;]+);/);
          const weightMatch = fontFaceBlock.match(/font-weight:\s*([^;]+);/);
          const unicodeRangeMatch = fontFaceBlock.match(/unicode-range:\s*([^;]+);/);
          if (styleMatch) descriptors.style = styleMatch[1].trim();
          if (weightMatch) descriptors.weight = weightMatch[1].trim();
          if (unicodeRangeMatch) descriptors.unicodeRange = unicodeRangeMatch[1].trim();
          try {
            const fontFace = await new FontFace(fontName, `url("${urlMatch[2]}")`, descriptors).load();
            document.fonts.add(fontFace);
            loaded = true;
          } catch {}
        }));
        return loaded;
      };

      const substitute = GOOGLE_FONT_SUBSTITUTES[fontKey];
      if (substitute) {
        const substituteBlocks = [...(await getFontFaceBlocks(substitute, 400)), ...(await getFontFaceBlocks(substitute, 700))];
        await loadFontFaceBlocks(substituteBlocks);
        return;
      }
      const fontNameParts = fontName.split(/\s+/);
      const suffix = fontNameParts[fontNameParts.length - 1]?.toLowerCase();
      const italic = suffix === 'italic' || suffix === 'oblique';
      if (italic) fontNameParts.pop();
      const weightSuffix = fontNameParts[fontNameParts.length - 1]?.toLowerCase();
      const weight = fontWeightMap[weightSuffix];
      if (weight) fontNameParts.pop();
      const parsedFamily = fontNameParts.join(' ');
      if (parsedFamily && (italic || weight) && parsedFamily !== fontName) {
        const loaded = await loadFontFaceBlocks(await getFontFaceBlocks(parsedFamily, weight, italic));
        if (loaded) return;
      }
      await loadFontFaceBlocks(await getFontFaceBlocks(fontName));
    } catch {}
  });
};
