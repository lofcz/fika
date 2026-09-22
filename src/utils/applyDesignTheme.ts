import { designColorRoles, textSurface, retintInlineText } from '@/utils/designColorRoles';
import tinycolor from 'tinycolor2';
import type { Slide, SlideTheme } from '@/types/slides';
import { inferThemeSlideType, resolvePresetBackground, themeChartColors, type PresetTheme } from '@/configs/theme';
import { preferredInk, resolveChartSeriesColors, resolveSlideSurfaceColors } from '@/utils/textContrast';
import { getLineElementLength } from '@/utils/element';
import { stripThemeInlineStyles } from '@/embed/agentic/themeFormatting';

  const getSlideAllColors = (slide: Slide) => {
    const colorMap: Record<string, number> = {};
    const record = (color: string, area: number) => {
      const _color = tinycolor(color).setAlpha(1).toRgbString();
      if (!colorMap[_color]) colorMap[_color] = area;else colorMap[_color] = colorMap[_color] + area;
    };
    for (const el of slide.elements) {
      const width = el.width;
      const height = el.type === 'line' ? getLineElementLength(el) : el.height;
      const area = width * height;
      if (el.type === 'shape' && tinycolor(el.fill).getAlpha() !== 0) {
        record(el.fill, area);
      }
      if (el.type === 'text' && el.fill && tinycolor(el.fill).getAlpha() !== 0) {
        record(el.fill, area);
      }
      if (el.type === 'image' && el.colorMask && tinycolor(el.colorMask).getAlpha() !== 0) {
        record(el.colorMask, area);
      }
      if (el.type === 'table' && el.theme && tinycolor(el.theme.color).getAlpha() !== 0) {
        record(el.theme.color, area);
      }
      if (el.type === 'chart') {
        for (const color of el.themeColors) {
          if (tinycolor(color).getAlpha() !== 0) {
            record(color, area / el.themeColors.length * 0.1);
          }
        }
        if (el.themeColors[0] && tinycolor(el.themeColors[0]).getAlpha() !== 0) record(el.themeColors[0], area * 0.3);
        if (el.fill && tinycolor(el.fill).getAlpha() !== 0) record(el.fill, area * 0.6);
      }
      if (el.type === 'line' && tinycolor(el.color).getAlpha() !== 0) {
        record(el.color, area);
      }
      if (el.type === 'audio' && tinycolor(el.color).getAlpha() !== 0) {
        record(el.color, area);
      }
    }
    const colors = Object.keys(colorMap).sort((a, b) => colorMap[b] - colorMap[a]);
    return colors;
  };

  const createSlideThemeColorMap = (slide: Slide, _newColors: string[]): Record<string, string> => {
    const newColors = [..._newColors];
    const oldColors = getSlideAllColors(slide);
    const themeColorMap: Record<string, string> = {};
    if (oldColors.length > newColors.length) {
      const analogous = tinycolor(newColors[0]).analogous(oldColors.length - newColors.length + 10);
      const otherColors = analogous.map(item => item.toHexString()).slice(1);
      newColors.push(...otherColors);
    }
    for (let i = 0; i < oldColors.length; i++) {
      themeColorMap[oldColors[i]] = newColors[i];
    }
    return themeColorMap;
  };
export const setSlideTheme = (slide: Slide, theme: PresetTheme, index = 0, sourceAccents: readonly string[] = theme.colors) => {
    const roles = theme.preserveColorRoles ? designColorRoles(theme, sourceAccents) : undefined;
    const colorMap = roles ? {} : createSlideThemeColorMap(slide, theme.colors);
    const getColor = (color: string) => {
      if (roles) return roles.fill(color);
      const alpha = tinycolor(color).getAlpha();
      const _color = colorMap[tinycolor(color).setAlpha(1).toRgbString()];
      return _color ? tinycolor(_color).setAlpha(alpha).toRgbString() : color;
    };
    if (!slide.background || slide.background.type !== 'image') {
      slide.background = resolvePresetBackground(theme, slide.type, index);
    }
    const ink = roles ? theme.fontColor : preferredInk(resolveSlideSurfaceColors(slide.background, theme.background));
    // Paint all surfaces first so text sees the final panel below it.
    if (roles) for (const el of slide.elements) {
      if ((el.type === 'shape' || el.type === 'text' || el.type === 'chart') && el.fill) {
        el.fill = getColor(el.fill);
        if (el.type === 'shape' && el.name === 'Decor' && (el.opacity ?? 1) > 0.5 && tinycolor(el.fill).toHsl().l < 0.78) {
          el.fill = tinycolor.mix(theme.background, el.fill, 13).setAlpha(tinycolor(el.fill).getAlpha()).toRgbString();
        }
      }
      if (el.type === 'shape') delete el.gradient;
    }
    for (const el of slide.elements) {
      const surface = textSurface(slide, el, theme.background);
      const elementInk = roles ? roles.ink(surface) : ink;
      const formatText = (html: string) => roles
        ? retintInlineText(stripThemeInlineStyles(html, { fontName: theme.fontname }), surface, roles.ink)
        : stripThemeInlineStyles(html, { fontColor: ink, fontName: theme.fontname });
      if (el.type === 'shape') {
        if (el.fill && !roles) el.fill = getColor(el.fill);
        if (el.gradient) delete el.gradient;
        if (el.text) {
          el.text.defaultColor = elementInk;
          el.text.defaultFontName = theme.fontname;
          if (el.text.content) el.text.content = formatText(el.text.content);
        }
      }
      if (el.type === 'text') {
        if (el.fill && !roles) el.fill = getColor(el.fill);
        el.defaultColor = elementInk;
        el.defaultFontName = theme.fontname;
        el.placeholderColor = elementInk;
        if (el.content) el.content = formatText(el.content);
      }
      if (el.type === 'image' && el.colorMask) {
        el.colorMask = getColor(el.colorMask);
      }
      if (el.type === 'table') {
        if (el.theme) el.theme.color = getColor(el.theme.color);
        for (const rowCells of el.data) {
          for (const cell of rowCells) {
            if (cell.style) {
              if (roles && cell.style.backcolor) cell.style.backcolor = getColor(cell.style.backcolor);
              cell.style.color = roles ? roles.ink(cell.style.backcolor ?? theme.background) : ink;
              cell.style.fontname = theme.fontname;
              if (roles) cell.text = retintInlineText(stripThemeInlineStyles(cell.text, { fontName: theme.fontname }), cell.style.backcolor ?? theme.background, roles.ink);
            }
          }
        }
      }
      if (el.type === 'chart') {
        el.themeColors = resolveChartSeriesColors(
          themeChartColors(theme),
          resolveSlideSurfaceColors(slide.background, theme.background),
        );
        el.textColor = elementInk;
      }
      if (el.type === 'line') el.color = getColor(el.color);
      if (el.type === 'audio') el.color = getColor(el.color);
      if (el.type === 'latex') el.color = elementInk;
      if ('outline' in el && el.outline) {
        if (theme.outline) el.outline = {
          ...theme.outline
        };
        if (theme.borderColor) el.outline.color = theme.borderColor;
      }
      if ('shadow' in el && el.shadow && theme.shadow) {
        el.shadow = theme.shadow;
      }
    }
  };

/** Shared by the design picker and agent command, with no store/history effects. */
export function applyDesignTheme(slides: readonly Slide[], currentTheme: SlideTheme, preset: PresetTheme) {
  const theme: SlideTheme = {
    ...currentTheme,
    backgroundColor: preset.background,
    themeColors: [...preset.colors],
    fontColor: preset.fontColor,
    fontName: preset.fontname,
    outline: preset.outline ? { ...preset.outline } : { ...currentTheme.outline, ...(preset.borderColor ? { color: preset.borderColor } : {}) },
    ...(preset.shadow ? { shadow: { ...preset.shadow } } : {}),
  };
  const nextSlides = structuredClone(slides) as Slide[];
  nextSlides.forEach((slide, index) => {
    slide.type = inferThemeSlideType(slide, index, nextSlides.length);
    setSlideTheme(slide, preset, index, currentTheme.themeColors);
  });
  return { slides: nextSlides, theme };
}
