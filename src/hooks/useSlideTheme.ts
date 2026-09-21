import { applyDesignTheme, setSlideTheme } from '@/utils/applyDesignTheme';
import tinycolor from 'tinycolor2';
import { useSlidesStore } from '@/store';
import type { Slide, SlideBackground } from '@/types/slides';
import { DEFAULT_PRESET_THEME, type PresetTheme } from '@/configs/theme';
import { applySlideBackgroundWithContrast } from '@/utils/textContrast';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
interface ThemeValueWithArea {
  area: number;
  value: string;
}
export default () => {
  const {
    addHistorySnapshot
  } = useHistorySnapshot();

  const getSlidesThemeStyles = (slide: Slide | Slide[]) => {
    const theme = useSlidesStore.getState().theme;
    const slides = Array.isArray(slide) ? slide : [slide];
    const backgroundColorValues: ThemeValueWithArea[] = [];
    const themeColorValues: ThemeValueWithArea[] = [];
    const fontColorValues: ThemeValueWithArea[] = [];
    const fontNameValues: ThemeValueWithArea[] = [];
    for (const slide of slides) {
      if (slide.background) {
        if (slide.background.type === 'solid' && slide.background.color) {
          backgroundColorValues.push({
            area: 1,
            value: slide.background.color
          });
        } else if (slide.background.type === 'gradient' && slide.background.gradient) {
          const len = slide.background.gradient.colors.length;
          backgroundColorValues.push(...slide.background.gradient.colors.map(item => ({
            area: 1 / len,
            value: item.color
          })));
        } else backgroundColorValues.push({
          area: 1,
          value: theme.backgroundColor
        });
      }
      for (const el of slide.elements) {
        const elWidth = el.width;
        let elHeight = 0;
        if (el.type === 'line') {
          const [startX, startY] = el.start;
          const [endX, endY] = el.end;
          elHeight = Math.sqrt(Math.pow(Math.abs(startX - endX), 2) + Math.pow(Math.abs(startY - endY), 2));
        } else elHeight = el.height;
        const area = elWidth * elHeight;
        if (el.type === 'shape' || el.type === 'text') {
          if (el.fill) {
            themeColorValues.push({
              area,
              value: el.fill
            });
          }
          if (el.type === 'shape' && el.gradient) {
            const len = el.gradient.colors.length;
            themeColorValues.push(...el.gradient.colors.map(item => ({
              area: 1 / len * area,
              value: item.color
            })));
          }
          const text = (el.type === 'shape' ? el.text?.content : el.content) || '';
          if (!text) continue;
          const plainText = text.replace(/<[^>]+>/g, '').replace(/\s*/g, '');
          const matchForColor = text.match(/<[^>]+color: .+?<\/.+?>/g);
          const matchForFont = text.match(/<[^>]+font-family: .+?<\/.+?>/g);
          let defaultColorPercent = 1;
          let defaultFontPercent = 1;
          if (matchForColor) {
            for (const item of matchForColor) {
              const ret = item.match(/color: (.+?);/);
              if (!ret) continue;
              const text = item.replace(/<[^>]+>/g, '').replace(/\s*/g, '');
              const color = ret[1];
              const percentage = text.length / plainText.length;
              defaultColorPercent = defaultColorPercent - percentage;
              fontColorValues.push({
                area: area * percentage,
                value: color
              });
            }
          }
          if (matchForFont) {
            for (const item of matchForFont) {
              const ret = item.match(/font-family: (.+?);/);
              if (!ret) continue;
              const text = item.replace(/<[^>]+>/g, '').replace(/\s*/g, '');
              const font = ret[1];
              const percentage = text.length / plainText.length;
              defaultFontPercent = defaultFontPercent - percentage;
              fontNameValues.push({
                area: area * percentage,
                value: font
              });
            }
          }
          if (defaultColorPercent) {
            const _defaultColor = el.type === 'shape' ? el.text?.defaultColor : el.defaultColor;
            const defaultColor = _defaultColor || theme.fontColor;
            fontColorValues.push({
              area: area * defaultColorPercent,
              value: defaultColor
            });
          }
          if (defaultFontPercent) {
            const _defaultFont = el.type === 'shape' ? el.text?.defaultFontName : el.defaultFontName;
            const defaultFont = _defaultFont || theme.fontName;
            fontNameValues.push({
              area: area * defaultFontPercent,
              value: defaultFont
            });
          }
        } else if (el.type === 'table') {
          const cellCount = el.data.length * el.data[0].length;
          let cellWithFillCount = 0;
          for (const row of el.data) {
            for (const cell of row) {
              if (cell.style?.backcolor) {
                cellWithFillCount += 1;
                themeColorValues.push({
                  area: area / cellCount,
                  value: cell.style?.backcolor
                });
              }
              if (cell.text) {
                const percent = cell.text.length >= 10 ? 1 : cell.text.length / 10;
                if (cell.style?.color) {
                  fontColorValues.push({
                    area: area / cellCount * percent,
                    value: cell.style?.color
                  });
                }
                if (cell.style?.fontname) {
                  fontColorValues.push({
                    area: area / cellCount * percent,
                    value: cell.style?.fontname
                  });
                }
              }
            }
          }
          if (el.theme) {
            const percent = 1 - cellWithFillCount / cellCount;
            themeColorValues.push({
              area: area * percent,
              value: el.theme.color
            });
          }
        } else if (el.type === 'chart') {
          if (el.fill) {
            themeColorValues.push({
              area: area * 0.6,
              value: el.fill
            });
          }
          if (el.themeColors[0]) {
            themeColorValues.push({
              area: area * 0.3,
              value: el.themeColors[0]
            });
          }
          for (const color of el.themeColors) {
            if (tinycolor(color).getAlpha() !== 0) {
              themeColorValues.push({
                area: area / el.themeColors.length * 0.1,
                value: color
              });
            }
          }
        } else if (el.type === 'line') {
          themeColorValues.push({
            area,
            value: el.color
          });
        } else if (el.type === 'audio') {
          themeColorValues.push({
            area,
            value: el.color
          });
        } else if (el.type === 'latex') {
          fontColorValues.push({
            area,
            value: el.color
          });
        }
      }
    }
    const backgroundColors: Record<string, number> = {};
    for (const item of backgroundColorValues) {
      const color = tinycolor(item.value).toRgbString();
      if (color === 'rgba(0, 0, 0, 0)') continue;
      if (!backgroundColors[color]) backgroundColors[color] = item.area;else backgroundColors[color] += item.area;
    }
    const themeColors: Record<string, number> = {};
    for (const item of themeColorValues) {
      const color = tinycolor(item.value).toRgbString();
      if (color === 'rgba(0, 0, 0, 0)') continue;
      if (!themeColors[color]) themeColors[color] = item.area;else themeColors[color] += item.area;
    }
    const fontColors: Record<string, number> = {};
    for (const item of fontColorValues) {
      const color = tinycolor(item.value).toRgbString();
      if (color === 'rgba(0, 0, 0, 0)') continue;
      if (!fontColors[color]) fontColors[color] = item.area;else fontColors[color] += item.area;
    }
    const fontNames: Record<string, number> = {};
    for (const item of fontNameValues) {
      if (!fontNames[item.value]) fontNames[item.value] = item.area;else fontNames[item.value] += item.area;
    }
    return {
      backgroundColors: Object.keys(backgroundColors).sort((a, b) => backgroundColors[b] - backgroundColors[a]),
      themeColors: Object.keys(themeColors).sort((a, b) => themeColors[b] - themeColors[a]),
      fontColors: Object.keys(fontColors).sort((a, b) => fontColors[b] - fontColors[a]),
      fontNames: Object.keys(fontNames).sort((a, b) => fontNames[b] - fontNames[a])
    };
  };

  const applyPresetTheme = (theme: PresetTheme) => {
    const { slides, setTheme, setSlides } = useSlidesStore.getState();
    const result = applyDesignTheme(slides, useSlidesStore.getState().theme, theme);
    setTheme(result.theme);
    setSlides(result.slides);
    addHistorySnapshot();
  };

  const clearPresetTheme = () => applyPresetTheme(DEFAULT_PRESET_THEME);

  const applyThemeLookToCurrentSlide = (background: SlideBackground) => {
    const { slides, slideIndex, theme, setSlides } = useSlidesStore.getState();
    const current = slides[slideIndex];
    if (!current) return;
    const next = slides.map((slide, index) => (
      index === slideIndex
        ? applySlideBackgroundWithContrast({
          ...slide,
          background: structuredClone(background),
        }, {
          backgroundColor: theme.backgroundColor,
          fontColor: theme.fontColor,
        })
        : slide
    ));
    setSlides(next);
    addHistorySnapshot();
  };

  const applyThemeToAllSlides = (applyAll = false) => {
    const { slides, theme, setSlides } = useSlidesStore.getState();
    const newSlides: Slide[] = JSON.parse(JSON.stringify(slides));
    const _theme: PresetTheme = {
      background: theme.backgroundColor,
      fontColor: theme.fontColor,
      borderColor: applyAll ? theme.outline.color : undefined,
      fontname: theme.fontName,
      colors: theme.themeColors,
      outline: applyAll ? theme.outline : undefined,
      shadow: applyAll ? theme.shadow : undefined
    };
    newSlides.forEach((slide, index) => setSlideTheme(slide, _theme, index));
    setSlides(newSlides);
    addHistorySnapshot();
  };

  const applyFontToAllSlides = (fontname: string) => {
    const { slides, setSlides } = useSlidesStore.getState();
    const newSlides: Slide[] = JSON.parse(JSON.stringify(slides));
    for (const slide of newSlides) {
      for (const el of slide.elements) {
        if (el.type === 'shape') {
          if (el.text) {
            el.text.defaultFontName = fontname;
            if (el.text.content) el.text.content = el.text.content.replace(/font-family: .+?;/g, '');
          }
        }
        if (el.type === 'text') {
          el.defaultFontName = fontname;
          if (el.content) el.content = el.content.replace(/font-family: .+?;/g, '');
        }
        if (el.type === 'table') {
          for (const rowCells of el.data) {
            for (const cell of rowCells) {
              if (cell.style) {
                cell.style.fontname = fontname;
              }
            }
          }
        }
      }
    }
    setSlides(newSlides);
    addHistorySnapshot();
  };
  return {
    getSlidesThemeStyles,
    applyPresetTheme,
    clearPresetTheme,
    applyThemeLookToCurrentSlide,
    applyThemeToAllSlides,
    applyFontToAllSlides
  };
};
