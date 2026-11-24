/**
 * The nearest unescaped dollar on the same line must be a closer. Never
 * search past a price or the start of a second formula for a later closer.
 * Digits can start a formula ($2+2$), but cannot follow its closing delimiter.
 */
export function inlineDollarEnd(source: string, start: number): number {
  const first = source[start + 1];
  if (!first || first === '$' || /\s/.test(first)) return -1;
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (char === '\n' || char === '\r') return -1;
    if (char === '\\' && (source[i + 1] === '$' || source[i + 1] === '\\')) {
      i++;
      continue;
    }
    if (char !== '$') continue;
    const before = source[i - 1];
    const after = source[i + 1] || '';
    if (/\s/.test(before) || after === '$' || /\d/.test(after)) return -1;
    if (after === '.' && /\d/.test(source[i + 2] || '')) return -1;
    // An opening parenthesis, backtick, etc. before $x makes it a new opener.
    if (/[\p{P}\p{S}]/u.test(before) && /\p{L}/u.test(after)) return -1;
    return i + 1;
  }
  return -1;
}
