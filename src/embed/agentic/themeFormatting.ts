/** Remove only explicitly replaced theme properties from HTML style attributes.
 * Matching whole declarations avoids corrupting background-color / border-color
 * or literal lesson text that happens to contain CSS examples.
 */
export function stripThemeInlineStyles(content: string, patch: { fontColor?: string; fontName?: string }): string {
  const properties = new Set<string>();
  if (patch.fontColor !== undefined) properties.add('color');
  if (patch.fontName !== undefined) properties.add('font-family');
  return content.replace(/\bstyle\s*=\s*(["'])(.*?)\1/gi, (_match, quote: string, css: string) => {
    const declarations = css.split(';').filter(part => !properties.has(part.split(':', 1)[0].trim().toLowerCase()));
    return `style=${quote}${declarations.join(';')}${quote}`;
  });
}
