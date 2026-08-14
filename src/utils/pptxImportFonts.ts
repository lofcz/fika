/**
 * pptxtojson 2.2+ emits embedded fonts as `{ name, fontFamily, blob }`,
 * not `string[]`. String APIs (`replace`, Google Fonts) must go through
 * {@link normalizePptxUsedFonts}; blob URLs must be registered as FontFace
 * so import does not crash and the packaged face actually paints.
 */

export type PptxUsedFontObject = {
  name?: string;
  fontFamily?: string;
  blob?: string;
};
export type PptxUsedFont = string | PptxUsedFontObject;
export type NormalizedPptxFont = {
  name: string;
  blob?: string;
};
const FONT_WEIGHT_SUFFIX: Record<string, number> = {
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
const registeredBlobFaces = new Set<string>();
function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]+|['"]+$/g, '').trim();
}

/** Pull a CSS family name out of a pptxtojson usedFonts entry (string or object). */
export function pptxUsedFontName(font: unknown): string {
  if (typeof font === 'string') return stripQuotes(font);
  if (!font || typeof font !== 'object') return '';
  const item = font as PptxUsedFontObject;
  if (typeof item.name === 'string' && item.name.trim()) return stripQuotes(item.name);
  if (typeof item.fontFamily === 'string' && item.fontFamily.trim()) {
    return stripQuotes(item.fontFamily.split(',')[0] || '');
  }
  return '';
}
export function normalizePptxUsedFonts(usedFonts: readonly unknown[] | null | undefined): NormalizedPptxFont[] {
  if (!usedFonts?.length) return [];
  const seen = new Set<string>();
  const out: NormalizedPptxFont[] = [];
  for (const font of usedFonts) {
    const name = pptxUsedFontName(font);
    if (!name) continue;
    const blob = font && typeof font === 'object' && typeof (font as PptxUsedFontObject).blob === 'string' && (font as PptxUsedFontObject).blob ? (font as PptxUsedFontObject).blob : undefined;
    const key = `${name.toLowerCase()}|${blob || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(blob ? {
      name,
      blob
    } : {
      name
    });
  }
  return out;
}

/**
 * Split "Brygada 1918 Bold Italic" → family + FontFace descriptors so both
 * `font-family: "Brygada 1918 Bold"` and `font-family: "Brygada 1918"; font-weight: 700`
 * resolve to the embedded face.
 */
export function splitImportedFontFace(name: string): {
  family: string;
  weight?: string;
  style?: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  let italic = false;
  const last = parts[parts.length - 1]?.toLowerCase();
  if (last === 'italic' || last === 'oblique') {
    italic = true;
    parts.pop();
  }
  const weightSuffix = parts[parts.length - 1]?.toLowerCase();
  const weight = weightSuffix ? FONT_WEIGHT_SUFFIX[weightSuffix] : undefined;
  if (weight) parts.pop();
  const family = parts.join(' ') || name;
  return {
    family,
    weight: weight ? String(weight) : undefined,
    style: italic ? 'italic' : undefined
  };
}
function blobFaceKey(family: string, blob: string, weight?: string, style?: string): string {
  return `${family.toLowerCase()}|${weight || '400'}|${style || 'normal'}|${blob}`;
}

/**
 * Register pptxtojson embedded-font blob URLs as FontFace. Safe in Node
 * (no `document` / `FontFace`) and idempotent.
 */
export function registerEmbeddedFonts(usedFonts: readonly unknown[] | null | undefined): string[] {
  const fonts = normalizePptxUsedFonts(usedFonts);
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return fonts.filter(font => font.blob).map(font => font.name);
  }
  const registered: string[] = [];
  for (const font of fonts) {
    if (!font.blob) continue;
    const descriptors: FontFaceDescriptors = {};
    const split = splitImportedFontFace(font.name);
    if (split.weight) descriptors.weight = split.weight;
    if (split.style) descriptors.style = split.style;
    const families = split.family.toLowerCase() === font.name.toLowerCase() ? [font.name] : [font.name, split.family];
    for (const family of families) {
      const key = blobFaceKey(family, font.blob, split.weight, split.style);
      if (registeredBlobFaces.has(key)) continue;
      registeredBlobFaces.add(key);
      try {
        const fontFace = new FontFace(family, `url("${font.blob}")`, descriptors);
        document.fonts.add(fontFace);
        void fontFace.load().catch(() => {});
      } catch {}
    }
    registered.push(font.name);
  }
  return registered;
}
