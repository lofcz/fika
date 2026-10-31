/** Rendered spans carry `calc(var(--text-fit-scale,1) * Npx)`; parse/store paths want plain px. */
const FITTED_FONT_RE = /calc\(var\(--text-fit-scale,\s*1\)\s*\*\s*([0-9.]+)px\)/g;
export const normalizeFittedFontSizes = (html: string) => (
  html && html.includes('--text-fit-scale') ? html.replace(FITTED_FONT_RE, '$1px') : html
);
