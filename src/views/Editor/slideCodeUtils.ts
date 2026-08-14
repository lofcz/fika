export interface ElementCodeRange {
  start: number;
  end: number;
}
export type JSONFormatResult = {
  success: true;
  value: unknown;
  formatted: string;
} | {
  success: false;
  message: string;
};
export const parseAndFormatJSON = (source: string): JSONFormatResult => {
  try {
    const value: unknown = JSON.parse(source);
    return {
      success: true,
      value,
      formatted: JSON.stringify(value, null, 2)
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to parse JSON'
    };
  }
};
export const findElementRange = (source: string, elementId: string): ElementCodeRange | null => {
  const elementsKeyIndex = source.indexOf('"elements"');
  if (elementsKeyIndex < 0) return null;
  const arrayStart = source.indexOf('[', elementsKeyIndex);
  if (arrayStart < 0) return null;
  let arrayDepth = 1;
  let objectDepth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = arrayStart + 1; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;else if (char === '\\') escaped = true;else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '[') arrayDepth++;else if (char === ']') {
      arrayDepth--;
      if (arrayDepth === 0) break;
    } else if (char === '{') {
      if (arrayDepth === 1 && objectDepth === 0) objectStart = i;
      objectDepth++;
    } else if (char === '}') {
      objectDepth--;
      if (objectDepth === 0 && objectStart >= 0) {
        const objectEnd = i + 1;
        try {
          const element = JSON.parse(source.slice(objectStart, objectEnd)) as {
            id?: unknown;
          };
          if (element.id === elementId) return {
            start: objectStart,
            end: objectEnd
          };
        } catch {
        }
        objectStart = -1;
      }
    }
  }
  return null;
};
