import type { Slide, SlideTheme, SlideThemeFile } from '@/types/slides';
export type ThemeFileValidationResult = {
  ok: true;
  data: SlideThemeFile;
} | {
  ok: false;
  message: string;
};
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Validate a parsed theme-file payload.
 * English messages are intentional — unit tests assert them; UI maps separately.
 */
export function validateThemeFile(data: unknown): ThemeFileValidationResult {
  if (!isObject(data)) {
    return {
      ok: false,
      message: 'Theme file must be a JSON object'
    };
  }
  if (typeof data.title !== 'string' || !data.title.trim()) {
    return {
      ok: false,
      message: 'Theme requires a string title'
    };
  }
  if (!Array.isArray(data.slides) || data.slides.length === 0) {
    return {
      ok: false,
      message: 'Theme requires a non-empty slides array'
    };
  }
  for (let i = 0; i < data.slides.length; i++) {
    const slide = data.slides[i];
    if (!isObject(slide)) {
      return {
        ok: false,
        message: `Theme slide at index ${i} must be an object`
      };
    }
    if (typeof slide.id !== 'string' || !slide.id.trim()) {
      return {
        ok: false,
        message: `Theme slide at index ${i} requires a string id`
      };
    }
    if (!Array.isArray(slide.elements)) {
      return {
        ok: false,
        message: `Theme slide at index ${i} requires an elements array`
      };
    }
  }
  if (!isObject(data.theme)) {
    return {
      ok: false,
      message: 'Theme requires a theme object'
    };
  }
  if (typeof data.width !== 'number' || !Number.isFinite(data.width)) {
    return {
      ok: false,
      message: 'Theme requires a numeric width'
    };
  }
  if (typeof data.height !== 'number' || !Number.isFinite(data.height)) {
    return {
      ok: false,
      message: 'Theme requires a numeric height'
    };
  }
  return {
    ok: true,
    data: {
      title: data.title.trim(),
      slides: data.slides as Slide[],
      theme: data.theme as Partial<SlideTheme>,
      width: data.width,
      height: data.height
    }
  };
}

/**
 * Parse (and optionally decrypt) theme file text into a validated SlideThemeFile.
 */
export function parseThemeFileContent(fileContent: string, opts: {
  encrypted: boolean;
  decrypt: (s: string) => string;
}): SlideThemeFile {
  let text = fileContent;
  if (opts.encrypted) {
    try {
      text = opts.decrypt(fileContent);
    } catch {
      throw new Error('Failed to decrypt theme file');
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Failed to parse theme file');
  }
  const validation = validateThemeFile(parsed);
  if (validation.ok === false) throw new Error(validation.message);
  return validation.data;
}
