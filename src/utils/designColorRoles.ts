import tinycolor from 'tinycolor2';
import type { PresetTheme } from '@/configs/theme';
import type { PPTElement, Slide } from '@/types/slides';

/** Keep neutral surfaces, pale panels and saturated accents in distinct roles. */
export function designColorRoles(theme: PresetTheme, sourceAccents: readonly string[]) {
  const accentIndex = (color: string) => {
    const value = tinycolor(color), h = value.toHsl().h;
    const exact = sourceAccents.findIndex(c => tinycolor.equals(c, color));
    if (exact >= 0) return exact % theme.colors.length;
    let best = 0, distance = Infinity;
    sourceAccents.forEach((c, i) => {
      const delta = Math.abs(tinycolor(c).toHsl().h - h);
      const d = Math.min(delta, 360 - delta);
      if (d < distance) { distance = d; best = i; }
    });
    return best % theme.colors.length;
  };
  const fill = (color: string) => {
    const value = tinycolor(color);
    if (!value.isValid() || value.getAlpha() === 0) return color;
    const { s, l } = value.toHsl();
    let next: string;
    const neutral = tinycolor.mix(theme.background, theme.fontColor, 6).toHexString();
    if (tinycolor.equals(color, neutral)) next = neutral;
    else if (sourceAccents.some(c => tinycolor.equals(c, color))) next = theme.colors[accentIndex(color)];
    else if (l > 0.98) next = '#ffffff'; // image mats / white cards
    else if (l < 0.27 || s < 0.12) next = tinycolor.mix(theme.background, theme.fontColor, 6).toHexString();
    else if (l > 0.78) next = tinycolor.mix(theme.background, theme.colors[accentIndex(color)], 13).toHexString();
    else next = theme.colors[accentIndex(color)];
    return tinycolor(next).setAlpha(value.getAlpha()).toRgbString();
  };
  const ink = (surface: string, original?: string) => {
    const exact = original ? sourceAccents.findIndex(c => tinycolor.equals(c, original)) : -1;
    const requested = exact >= 0 ? theme.colors[exact % theme.colors.length] : theme.fontColor;
    if (tinycolor.readability(surface, requested) >= 4.5) return requested;
    return tinycolor.mostReadable(surface, [theme.fontColor, '#ffffff', '#111111'])!.toHexString();
  };
  return { fill, ink };
}

/** Find the painted panel below a text object; preserve white lettering on badges. */
export function textSurface(slide: Slide, el: PPTElement, fallback: string) {
  if ('fill' in el && el.fill && tinycolor(el.fill).getAlpha() > 0.9) return el.fill;
  if (el.type === 'line') return fallback;
  const cx = el.left + el.width / 2, cy = el.top + el.height / 2;
  const before = slide.elements.slice(0, slide.elements.indexOf(el));
  for (const panel of before.reverse()) {
    if (panel.type !== 'shape' || !panel.fill || tinycolor(panel.fill).getAlpha() < 0.9 || (panel.opacity ?? 1) < 0.9) continue;
    if (cx >= panel.left && cx <= panel.left + panel.width && cy >= panel.top && cy <= panel.top + panel.height) return panel.fill;
  }
  return fallback;
}

export function retintInlineText(html: string, surface: string, ink: (surface: string, original?: string) => string) {
  return html.replace(/style=(['"])(.*?)\1/gi, (_, quote: string, css: string) =>
    `style=${quote}${css.replace(/(^|;)\s*color\s*:\s*([^;]+)/gi, (_m, prefix: string, color: string) => `${prefix}color:${ink(surface, color.trim())}`)}${quote}`);
}
