import type { Slide } from '@/types/slides';
const ELEMENT_TYPES = new Set(['text', 'image', 'shape', 'line', 'chart', 'table', 'latex', 'mermaid', 'code', 'video', 'audio']);
export type SlideValidationResult = {
  ok: true;
  slide: Slide;
} | {
  ok: false;
  message: string;
};

/**
 * Lightweight slide JSON guard used by SlideCodePanel (no AI stack dependency).
 */
export const validateSlide = (value: unknown): SlideValidationResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      message: 'Slide must be a JSON object'
    };
  }
  const slide = value as Record<string, unknown>;
  if (typeof slide.id !== 'string' || !slide.id.trim()) {
    return {
      ok: false,
      message: 'Slide requires a non-empty string id'
    };
  }
  if (!Array.isArray(slide.elements)) {
    return {
      ok: false,
      message: 'Slide requires an elements array'
    };
  }
  for (let i = 0; i < slide.elements.length; i++) {
    const el = slide.elements[i];
    if (!el || typeof el !== 'object' || Array.isArray(el)) {
      return {
        ok: false,
        message: `Element at index ${i} must be an object`
      };
    }
    const element = el as Record<string, unknown>;
    if (typeof element.id !== 'string' || !element.id.trim()) {
      return {
        ok: false,
        message: `Element at index ${i} requires a non-empty string id`
      };
    }
    if (typeof element.type !== 'string' || !ELEMENT_TYPES.has(element.type)) {
      return {
        ok: false,
        message: `Element at index ${i} has an unsupported type`
      };
    }
    for (const key of ['left', 'top', 'width', 'height', 'rotate'] as const) {
      if (typeof element[key] !== 'number' || !Number.isFinite(element[key] as number)) {
        return {
          ok: false,
          message: `Element at index ${i} requires a numeric ${key}`
        };
      }
    }
  }
  return {
    ok: true,
    slide: value as Slide
  };
};
