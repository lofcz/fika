
import { createElement, useEffect, useState } from 'react'
import { saveAs } from 'file-saver';
import pptxgen from '@lofcz/pptxgenjs';
import tinycolor from 'tinycolor2';
import { toPng, toJpeg } from 'html-to-image';
import { useSlidesStore } from '@/store';
import type { Gradient, PPTAnimation, PPTElementEffects, PPTElementOutline, PPTElementShadow, PPTElementLink, PPTTextElement, Slide } from '@/types/slides';
import { outlineRadiusToPptxRectRadius } from '@/utils/elementOutline';
import { getElementRange, getLineElementPath, getTableThemeColors } from '@/utils/element';
import { type AST, toAST } from '@/utils/htmlParser';
import { type SvgPoints, toPoints } from '@/utils/svgPathParser';
import { LATEX_ELEMENT_FONT_SIZE, MATH_CLASS } from '@/utils/math';
import { latexPaintScale } from '@/utils/latex';
import { applyOmmlRunStyle, prepareLatexToOmml, tryLatexToOmmlSync } from '@/utils/latexToOmml';
import { collectEmbeddedFonts } from '@/utils/exportFonts';
import { svg2Base64 } from '@/utils/svg2Base64';
import { renderMermaid } from '@/utils/mermaid';
import { codeElementPptxBox, codeElementToPptxText } from '@/utils/codePptxExport';
import { getPPTXImageCrop } from '@/utils/pptxUnit';
import { encrypt } from '@/utils/crypto';
import { tryGetCleanRetainedPackage } from '@/utils/pptxSourcePackage';
import { getPlaceholderBaselineHeight } from '@/utils/placeholderLayout';
import { resolveChartLabelColor } from '@/utils/textContrast';
import message from '@/utils/message';
import { getLL } from '@/i18n/getLL';
import { getFikaExportMediaResolver } from '@/configs/exportMediaResolver';
import { createJobProgress, slideJobProgress } from '@/utils/jobProgress';
const exportJob = createJobProgress();

/** 1×1 transparent PNG — used when a media URL cannot be inlined so pptxgenjs
 *  does not retry a cross-origin XHR (which surfaces as a CORS console error). */
const EMPTY_IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
import BaseShapeElement from '@/views/components/element/ShapeElement/BaseShapeElement';
interface ExportImageConfig {
  quality: number
  width: number
  fontEmbedCSS?: string
}
const svgToPngDataURL = (svg: string, width: number, height: number, pixelRatio = 2) => {
  return new Promise<string>((resolve, reject) => {
    const svgDocument = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const svgElement = svgDocument.documentElement;
    const canvasWidth = Math.max(1, Math.round(width * pixelRatio));
    const canvasHeight = Math.max(1, Math.round(height * pixelRatio));
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgElement.setAttribute('width', `${canvasWidth}`);
    svgElement.setAttribute('height', `${canvasHeight}`);
    const blob = new Blob([new XMLSerializer().serializeToString(svgElement)], {
      type: 'image/svg+xml;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Failed to create canvas context'));
          return;
        }
        context.drawImage(image, 0, 0, canvasWidth, canvasHeight);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to rasterize SVG'));
    };
    image.src = url;
  });
};
export default () => {
  const [, setTick] = useState(0);
  useEffect(() => exportJob.subscribe(() => setTick(n => n + 1)), []);
  const slides = useSlidesStore(s => s.slides);
  const theme = useSlidesStore(s => s.theme);
  const viewportRatio = useSlidesStore(s => s.viewportRatio);
  const title = useSlidesStore(s => s.title);
  const viewportSize = useSlidesStore(s => s.viewportSize);;
  const defaultFontSize = 16;
  const ratioPx2Inch = (() => {
    return 96 * (viewportSize / 960);
  })();
  const ratioPx2Pt = (() => {
    return 96 / 72 * (viewportSize / 960);
  })();
  const tickExportProgress = exportJob.tick;
  const pptxDefaultFontFace = () => theme.fontName || 'Calibri';

  const applyPPTXTheme = (pptx: pptxgen) => {
    const hex = (c: string) => tinycolor(c).toHexString().replace('#', '').toUpperCase();
    const t = theme;
    const accents = t.themeColors.map(hex);
    while (accents.length < 6) accents.push('5B9BD5');
    const dk1 = hex(t.fontColor || '#000000');
    const lt1 = hex(t.backgroundColor || '#FFFFFF');
    const dk2 = tinycolor(dk1).isLight() ? tinycolor(dk1).darken(35).toHexString().replace('#', '').toUpperCase() : '44546A';
    const lt2 = tinycolor(lt1).isDark() ? tinycolor(lt1).lighten(35).toHexString().replace('#', '').toUpperCase() : 'E7E6E6';
    pptx.theme = {
      headFontFace: t.fontName || 'Calibri Light',
      bodyFontFace: t.fontName || 'Calibri',
      themeColors: [dk1, lt1, dk2, lt2, accents[0], accents[1], accents[2], accents[3], accents[4], accents[5], '0563C1', '954F72']
    };
  };
  const setPPTXLayout = (pptx: pptxgen) => {
    if (viewportRatio === 0.625) pptx.layout = 'LAYOUT_16x10';else if (viewportRatio === 0.75) pptx.layout = 'LAYOUT_4x3';else {
      const layoutName = 'FIKA_CUSTOM_LAYOUT';
      pptx.defineLayout({
        name: layoutName,
        width: viewportSize / ratioPx2Inch,
        height: viewportSize * viewportRatio / ratioPx2Inch
      });
      pptx.layout = layoutName;
    }
  };

  const exportImage = (domRef: HTMLElement, format: string, quality: number, ignoreWebfont = true) => {
    if (exportJob.running.value) return;
    const gen = exportJob.start(0);
    const toImage = format === 'png' ? toPng : toJpeg;
    const foreignObjectSpans = domRef.querySelectorAll('foreignObject [xmlns]');
    foreignObjectSpans.forEach(spanRef => spanRef.removeAttribute('xmlns'));
    setTimeout(() => {
      const config: ExportImageConfig = {
        quality,
        width: 1600
      };
      if (ignoreWebfont) config.fontEmbedCSS = '';
      toImage(domRef, config).then(dataUrl => {
        exportJob.finish(gen);
        saveAs(dataUrl, `${title}.${format}`);
      }).catch(() => {
        exportJob.finish(gen);
        message.error(getLL().export.exportImageFailed());
      });
    }, 200);
  };

  const exportImagePPTX = (domRefs: NodeListOf<Element>) => {
    if (exportJob.running.value) return;
    const gen = exportJob.start(0);
    setTimeout(() => {
      const pptx = new pptxgen();
      setPPTXLayout(pptx);
      const config: ExportImageConfig = {
        quality: 1,
        width: 1600
      };
      const promiseArr = [];
      for (const domRef of domRefs) {
        const foreignObjectSpans = domRef.querySelectorAll('foreignObject [xmlns]');
        foreignObjectSpans.forEach(spanRef => spanRef.removeAttribute('xmlns'));
        const promiseFunc = () => toJpeg(domRef as HTMLElement, config);
        promiseArr.push(promiseFunc);
      }
      Promise.all(promiseArr.map(func => func())).then(imgs => {
        for (const data of imgs) {
          const pptxSlide = pptx.addSlide();
          pptxSlide.addImage({
            data,
            x: 0,
            y: 0,
            w: viewportSize / ratioPx2Inch,
            h: viewportSize * viewportRatio / ratioPx2Inch
          });
        }
        pptx.writeFile({
          fileName: `${title}.pptx`
        }).then(() => exportJob.finish(gen)).catch(() => {
          exportJob.finish(gen);
          message.error(getLL().export.exportFailed());
        });
      }).catch(() => {
        exportJob.finish(gen);
        message.error(getLL().export.exportFailed());
      });
    }, 200);
  };

  const exportSpecificFile = (_slides: Slide[]) => {
    const json = {
      title: title,
      width: viewportSize,
      height: viewportSize * viewportRatio,
      theme: theme,
      slides: _slides
    };
    const blob = new Blob([encrypt(JSON.stringify(json))], {
      type: ''
    });
    saveAs(blob, `${title}.fika`);
  };

  const exportJSON = () => {
    const json = {
      title: title,
      width: viewportSize,
      height: viewportSize * viewportRatio,
      theme: theme,
      slides: slides
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    saveAs(blob, `${title}.json`);
  };

  const formatColor = (_color: string) => {
    if (!_color) {
      return {
        alpha: 0,
        color: '#000000'
      };
    }
    const c = tinycolor(_color);
    const alpha = c.getAlpha();
    const color = alpha === 0 ? '#ffffff' : c.setAlpha(1).toHexString();
    return {
      alpha,
      color
    };
  };
  type FormatColor = ReturnType<typeof formatColor>;

  const gradientToPptxFill = (gradient: Gradient): pptxgen.ShapeFillProps | null => {
    if (gradient.type !== 'linear' || gradient.colors.length < 2) return null;
    return {
      type: 'linearGradient',
      angle: gradient.rotate,
      stops: gradient.colors.map(c => {
        const {
          color,
          alpha
        } = formatColor(c.color);
        return {
          pos: c.pos,
          color: color.replace('#', ''),
          ...(alpha < 1 ? {
            transparency: (1 - alpha) * 100
          } : {})
        };
      })
    };
  };

  type AnimationPreset = Omit<pptxgen.BaseAnimationConfig, 'trigger' | 'duration' | 'delay'> & Record<string, unknown>;
  const ANIMATION_EFFECT_MAP: Record<string, AnimationPreset> = {
    appear: {
      type: 'appear'
    },
    bounceIn: {
      type: 'bounce'
    },
    bounceInLeft: {
      type: 'bounce'
    },
    bounceInRight: {
      type: 'bounce'
    },
    bounceInUp: {
      type: 'bounce'
    },
    bounceInDown: {
      type: 'bounce'
    },
    fadeIn: {
      type: 'fadein'
    },
    fadeInDown: {
      type: 'flyin',
      direction: 'top'
    },
    fadeInDownBig: {
      type: 'flyin',
      direction: 'top'
    },
    fadeInLeft: {
      type: 'flyin',
      direction: 'left'
    },
    fadeInLeftBig: {
      type: 'flyin',
      direction: 'left'
    },
    fadeInRight: {
      type: 'flyin',
      direction: 'right'
    },
    fadeInRightBig: {
      type: 'flyin',
      direction: 'right'
    },
    fadeInUp: {
      type: 'flyin',
      direction: 'bottom'
    },
    fadeInUpBig: {
      type: 'flyin',
      direction: 'bottom'
    },
    fadeInTopLeft: {
      type: 'flyin',
      direction: 'topLeft'
    },
    fadeInTopRight: {
      type: 'flyin',
      direction: 'topRight'
    },
    fadeInBottomLeft: {
      type: 'flyin',
      direction: 'bottomLeft'
    },
    fadeInBottomRight: {
      type: 'flyin',
      direction: 'bottomRight'
    },
    rotateIn: {
      type: 'swivel'
    },
    rotateInDownLeft: {
      type: 'swivel'
    },
    rotateInDownRight: {
      type: 'swivel'
    },
    rotateInUpLeft: {
      type: 'swivel'
    },
    rotateInUpRight: {
      type: 'swivel'
    },
    zoomIn: {
      type: 'zoom'
    },
    zoomInDown: {
      type: 'zoom'
    },
    zoomInLeft: {
      type: 'zoom'
    },
    zoomInRight: {
      type: 'zoom'
    },
    zoomInUp: {
      type: 'zoom'
    },
    slideInDown: {
      type: 'flyin',
      direction: 'top'
    },
    slideInLeft: {
      type: 'flyin',
      direction: 'left'
    },
    slideInRight: {
      type: 'flyin',
      direction: 'right'
    },
    slideInUp: {
      type: 'flyin',
      direction: 'bottom'
    },
    flipInX: {
      type: 'growandturn'
    },
    flipInY: {
      type: 'growandturn'
    },
    backInDown: {
      type: 'floatin',
      direction: 'floatUp'
    },
    backInLeft: {
      type: 'floatin',
      direction: 'floatUp'
    },
    backInRight: {
      type: 'floatin',
      direction: 'floatUp'
    },
    backInUp: {
      type: 'floatin',
      direction: 'floatUp'
    },
    lightSpeedInRight: {
      type: 'wipe',
      direction: 'left'
    },
    lightSpeedInLeft: {
      type: 'wipe',
      direction: 'right'
    },
    bounceOut: {
      type: 'bounceexit'
    },
    bounceOutLeft: {
      type: 'bounceexit'
    },
    bounceOutRight: {
      type: 'bounceexit'
    },
    bounceOutUp: {
      type: 'bounceexit'
    },
    bounceOutDown: {
      type: 'bounceexit'
    },
    fadeOut: {
      type: 'fadeout'
    },
    fadeOutDown: {
      type: 'flyout',
      direction: 'bottom'
    },
    fadeOutDownBig: {
      type: 'flyout',
      direction: 'bottom'
    },
    fadeOutLeft: {
      type: 'flyout',
      direction: 'left'
    },
    fadeOutLeftBig: {
      type: 'flyout',
      direction: 'left'
    },
    fadeOutRight: {
      type: 'flyout',
      direction: 'right'
    },
    fadeOutRightBig: {
      type: 'flyout',
      direction: 'right'
    },
    fadeOutUp: {
      type: 'flyout',
      direction: 'top'
    },
    fadeOutUpBig: {
      type: 'flyout',
      direction: 'top'
    },
    fadeOutTopLeft: {
      type: 'flyout',
      direction: 'topLeft'
    },
    fadeOutTopRight: {
      type: 'flyout',
      direction: 'topRight'
    },
    fadeOutBottomLeft: {
      type: 'flyout',
      direction: 'bottomLeft'
    },
    fadeOutBottomRight: {
      type: 'flyout',
      direction: 'bottomRight'
    },
    rotateOut: {
      type: 'swivelexit'
    },
    rotateOutDownLeft: {
      type: 'swivelexit'
    },
    rotateOutDownRight: {
      type: 'swivelexit'
    },
    rotateOutUpLeft: {
      type: 'swivelexit'
    },
    rotateOutUpRight: {
      type: 'swivelexit'
    },
    zoomOut: {
      type: 'zoomexit'
    },
    zoomOutDown: {
      type: 'zoomexit'
    },
    zoomOutLeft: {
      type: 'zoomexit'
    },
    zoomOutRight: {
      type: 'zoomexit'
    },
    zoomOutUp: {
      type: 'zoomexit'
    },
    slideOutDown: {
      type: 'flyout',
      direction: 'bottom'
    },
    slideOutLeft: {
      type: 'flyout',
      direction: 'left'
    },
    slideOutRight: {
      type: 'flyout',
      direction: 'right'
    },
    slideOutUp: {
      type: 'flyout',
      direction: 'top'
    },
    flipOutX: {
      type: 'shrinkandturn'
    },
    flipOutY: {
      type: 'shrinkandturn'
    },
    backOutDown: {
      type: 'floatout',
      direction: 'floatDown'
    },
    backOutLeft: {
      type: 'floatout',
      direction: 'floatDown'
    },
    backOutRight: {
      type: 'floatout',
      direction: 'floatDown'
    },
    backOutUp: {
      type: 'floatout',
      direction: 'floatDown'
    },
    lightSpeedOutRight: {
      type: 'wipeexit',
      direction: 'right'
    },
    lightSpeedOutLeft: {
      type: 'wipeexit',
      direction: 'left'
    },
    shakeX: {
      type: 'teeter'
    },
    shakeY: {
      type: 'teeter'
    },
    headShake: {
      type: 'teeter'
    },
    swing: {
      type: 'teeter'
    },
    wobble: {
      type: 'teeter'
    },
    tada: {
      type: 'pulse'
    },
    jello: {
      type: 'teeter'
    },
    bounce: {
      type: 'pulse'
    },
    flash: {
      type: 'pulse'
    },
    pulse: {
      type: 'pulse'
    },
    rubberBand: {
      type: 'growshrink'
    },
    heartBeat: {
      type: 'pulse'
    }
  };
  const ANIMATION_TRIGGER_MAP = {
    click: 'onClick',
    meantime: 'withPrevious',
    auto: 'afterPrevious'
  } as const;

  const TRANSITION_MAP: Record<string, pptxgen.SlideTransitionProps> = {
    fade: {
      type: 'fade'
    },
    slideX: {
      type: 'push',
      direction: 'l'
    },
    slideY: {
      type: 'push',
      direction: 'u'
    },
    slideX3D: {
      type: 'flip',
      direction: 'r'
    },
    slideY3D: {
      type: 'flip',
      direction: 'u'
    },
    rotate: {
      type: 'ferris',
      direction: 'l'
    },
    scaleX: {
      type: 'warp',
      direction: 'in'
    },
    scaleY: {
      type: 'warp',
      direction: 'in'
    },
    scale: {
      type: 'zoom',
      direction: 'in'
    },
    scaleReverse: {
      type: 'zoom',
      direction: 'out'
    },
    random: {
      type: 'random'
    }
  };
  const transitionForSlide = (mode?: Slide['turningMode']): pptxgen.SlideTransitionProps | undefined => {
    if (!mode || mode === 'no') return undefined;
    return TRANSITION_MAP[mode];
  };

  const animationForElement = (elId: string, animations?: PPTAnimation[]): pptxgen.AnimationConfig | undefined => {
    if (!animations?.length) return undefined;
    for (const anim of animations) {
      if (anim.elId !== elId) continue;
      const mapped = ANIMATION_EFFECT_MAP[anim.effect];
      if (!mapped) continue;
      return {
        ...mapped,
        trigger: ANIMATION_TRIGGER_MAP[anim.trigger],
        duration: anim.duration
      };
    }
    return undefined;
  };

  const isEmptyHTMLText = (html?: string) => {
    if (!html) return true;
    const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&#8203;|\u200b/g, '');
    return text.trim().length === 0;
  };

  const decodeLatexAttr = (value: string) => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const formatHTML = (html: string, fallback?: {
    color?: string;
    fontSizePt?: number;
  }) => {
    const ast = toAST(html);
    let bulletFlag = false;
    let indent = 0;
    const slices: pptxgen.TextProps[] = [];
    const parse = (obj: AST[], baseStyleObj: Record<string, string> = {}) => {
      for (const item of obj) {
        const isBlockTag = 'tagName' in item && ['div', 'li', 'p'].includes(item.tagName);
        if (isBlockTag && slices.length) {
          const lastSlice = slices[slices.length - 1];
          if (!lastSlice.options) lastSlice.options = {};
          lastSlice.options.breakLine = true;
        }

        if ('tagName' in item && item.tagName === 'span' && 'attributes' in item) {
          const classAttr = item.attributes.find(attr => attr.key === 'class');
          const latexAttr = item.attributes.find(attr => attr.key === 'data-latex');
          const classVal = classAttr?.value || '';
          const isMath = classVal.split(/\s+/).includes(MATH_CLASS) || !!latexAttr?.value;
          if (isMath) {
            const latex = decodeLatexAttr(latexAttr?.value || '');
            let omml = latex ? tryLatexToOmmlSync(latex) : null;
            const options: pptxgen.TextPropsOptions = {};
            if (bulletFlag && baseStyleObj['list-type'] === 'ol') {
              options.bullet = {
                type: 'number',
                indent: defaultFontSize * 1.25
              };
              options.paraSpaceBefore = 0.1;
              bulletFlag = false;
            }
            if (bulletFlag && baseStyleObj['list-type'] === 'ul') {
              options.bullet = {
                indent: defaultFontSize * 1.25
              };
              options.paraSpaceBefore = 0.1;
              bulletFlag = false;
            }
            if (indent) {
              options.indentLevel = indent;
              indent = 0;
            }

            const mathOwnStyle: Record<string, string> = {};
            const mathStyleAttr = item.attributes.find(attr => attr.key === 'style');
            if (mathStyleAttr?.value) {
              for (const styleItem of mathStyleAttr.value.split(';')) {
                const match = styleItem.match(/([^:]+):\s*(.+)/);
                if (match) mathOwnStyle[match[1].trim()] = match[2].trim();
              }
            }
            const inheritedColor = mathOwnStyle.color || baseStyleObj.color;
            const explicitFontSize = mathOwnStyle['font-size'] ? parseInt(mathOwnStyle['font-size']) / ratioPx2Pt : undefined;
            if (explicitFontSize) options.fontSize = explicitFontSize;
            const mathColor = inheritedColor ? formatColor(inheritedColor).color : fallback?.color;
            if (mathColor) options.color = mathColor;
            if (omml) {
              options.omml = applyOmmlRunStyle(omml, {
                color: mathColor,
                fontSizePt: explicitFontSize
              });
              slices.push({
                text: '',
                options
              });
            } else {
              slices.push({
                text: latex || '',
                options
              });
            }
            continue;
          }
        }
        const styleObj = {
          ...baseStyleObj
        };
        const styleAttr = 'attributes' in item ? item.attributes.find(attr => attr.key === 'style') : null;
        if (styleAttr && styleAttr.value) {
          let hasGradient = false;
          const styleArr = styleAttr.value.split(';');
          for (const styleItem of styleArr) {
            const match = styleItem.match(/([^:]+):\s*(.+)/);
            if (match) {
              const [key, value] = [match[1].trim(), match[2].trim()];
              if (key && value) {
                if (key === 'background' && value.includes('linear-gradient')) {
                  hasGradient = true;
                  const colorMatches = value.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?\([^)]+\)/g);
                  if (colorMatches && colorMatches.length > 0) {
                    const colors = colorMatches.map(c => tinycolor(c));
                    const avgColor = colors.reduce((acc, c) => {
                      const rgb = c.toRgb();
                      return {
                        r: acc.r + rgb.r / colors.length,
                        g: acc.g + rgb.g / colors.length,
                        b: acc.b + rgb.b / colors.length
                      };
                    }, {
                      r: 0,
                      g: 0,
                      b: 0
                    });
                    styleObj['color'] = tinycolor(avgColor).toHexString();
                  }
                } else if (hasGradient && (key === 'background-clip' || key === '-webkit-background-clip' || key === 'color' && value === 'transparent')) {
                  continue;
                } else styleObj[key] = value;
              }
            }
          }
        }
        if ('tagName' in item) {
          if (item.tagName === 'em') {
            styleObj['font-style'] = 'italic';
          }
          if (item.tagName === 'strong') {
            styleObj['font-weight'] = 'bold';
          }
          if (item.tagName === 'sup') {
            styleObj['vertical-align'] = 'super';
          }
          if (item.tagName === 'sub') {
            styleObj['vertical-align'] = 'sub';
          }
          if (item.tagName === 'a') {
            const attr = item.attributes.find(attr => attr.key === 'href');
            styleObj['href'] = attr?.value || '';
          }
          if (item.tagName === 'ul') {
            styleObj['list-type'] = 'ul';
          }
          if (item.tagName === 'ol') {
            styleObj['list-type'] = 'ol';
          }
          if (item.tagName === 'li') {
            bulletFlag = true;
          }
          if (item.tagName === 'p') {
            if ('attributes' in item) {
              const dataIndentAttr = item.attributes.find(attr => attr.key === 'data-indent');
              if (dataIndentAttr && dataIndentAttr.value) indent = +dataIndentAttr.value;
            }
          }
        }
        if ('tagName' in item && item.tagName === 'br') {
          slices.push({
            text: '',
            options: {
              breakLine: true
            }
          });
        } else if ('content' in item) {
          const text = item.content.replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\n/g, '');
          const options: pptxgen.TextPropsOptions = {};
          if (styleObj['font-size']) {
            options.fontSize = parseInt(styleObj['font-size']) / ratioPx2Pt;
          }
          if (styleObj['color']) {
            options.color = formatColor(styleObj['color']).color;
          }
          if (styleObj['background-color']) {
            options.highlight = formatColor(styleObj['background-color']).color;
          }
          if (styleObj['text-decoration-line']) {
            if (styleObj['text-decoration-line'].indexOf('underline') !== -1) {
              options.underline = {
                color: options.color || '#000000',
                style: 'sng'
              };
            }
            if (styleObj['text-decoration-line'].indexOf('line-through') !== -1) {
              options.strike = 'sngStrike';
            }
          }
          if (styleObj['text-decoration']) {
            if (styleObj['text-decoration'].indexOf('underline') !== -1) {
              options.underline = {
                color: options.color || '#000000',
                style: 'sng'
              };
            }
            if (styleObj['text-decoration'].indexOf('line-through') !== -1) {
              options.strike = 'sngStrike';
            }
          }
          if (styleObj['vertical-align']) {
            if (styleObj['vertical-align'] === 'super') options.superscript = true;
            if (styleObj['vertical-align'] === 'sub') options.subscript = true;
          }
          if (styleObj['text-align']) options.align = styleObj['text-align'] as pptxgen.HAlign;
          if (styleObj['font-weight']) options.bold = styleObj['font-weight'] === 'bold';
          if (styleObj['font-style']) options.italic = styleObj['font-style'] === 'italic';
          if (styleObj['font-family']) options.fontFace = styleObj['font-family'];
          if (styleObj['href']) options.hyperlink = {
            url: styleObj['href']
          };
          if (bulletFlag && styleObj['list-type'] === 'ol') {
            options.bullet = {
              type: 'number',
              indent: (options.fontSize || defaultFontSize) * 1.25
            };
            options.paraSpaceBefore = 0.1;
            bulletFlag = false;
          }
          if (bulletFlag && styleObj['list-type'] === 'ul') {
            options.bullet = {
              indent: (options.fontSize || defaultFontSize) * 1.25
            };
            options.paraSpaceBefore = 0.1;
            bulletFlag = false;
          }
          if (indent) {
            options.indentLevel = indent;
            indent = 0;
          }
          slices.push({
            text,
            options
          });
        } else if ('children' in item) parse(item.children, styleObj);
      }
    };
    parse(ast);
    return slices;
  };
  type Points = Array<{
    x: number;
    y: number;
    moveTo?: boolean;
  } | {
    x: number;
    y: number;
    curve: {
      type: 'arc';
      hR: number;
      wR: number;
      stAng: number;
      swAng: number;
    };
  } | {
    x: number;
    y: number;
    curve: {
      type: 'quadratic';
      x1: number;
      y1: number;
    };
  } | {
    x: number;
    y: number;
    curve: {
      type: 'cubic';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };
  } | {
    close: true;
  }>;

  const formatPoints = (points: SvgPoints, scale = {
    x: 1,
    y: 1
  }): Points => {
    return points.map(point => {
      if (point.close !== undefined) {
        return {
          close: true
        };
      } else if (point.type === 'M') {
        return {
          x: point.x / ratioPx2Inch * scale.x,
          y: point.y / ratioPx2Inch * scale.y,
          moveTo: true
        };
      } else if (point.curve) {
        if (point.curve.type === 'cubic') {
          return {
            x: point.x / ratioPx2Inch * scale.x,
            y: point.y / ratioPx2Inch * scale.y,
            curve: {
              type: 'cubic',
              x1: (point.curve.x1 as number) / ratioPx2Inch * scale.x,
              y1: (point.curve.y1 as number) / ratioPx2Inch * scale.y,
              x2: (point.curve.x2 as number) / ratioPx2Inch * scale.x,
              y2: (point.curve.y2 as number) / ratioPx2Inch * scale.y
            }
          };
        } else if (point.curve.type === 'quadratic') {
          return {
            x: point.x / ratioPx2Inch * scale.x,
            y: point.y / ratioPx2Inch * scale.y,
            curve: {
              type: 'quadratic',
              x1: (point.curve.x1 as number) / ratioPx2Inch * scale.x,
              y1: (point.curve.y1 as number) / ratioPx2Inch * scale.y
            }
          };
        }
      }
      return {
        x: point.x / ratioPx2Inch * scale.x,
        y: point.y / ratioPx2Inch * scale.y
      };
    });
  };

  const getShadowOption = (shadow: PPTElementShadow): pptxgen.ShadowProps => {
    const c = formatColor(shadow.color);
    const {
      h,
      v
    } = shadow;
    let offset = 4;
    let angle = 45;
    if (h === 0 && v === 0) {
      offset = 4;
      angle = 45;
    } else if (h === 0) {
      if (v > 0) {
        offset = v;
        angle = 90;
      } else {
        offset = -v;
        angle = 270;
      }
    } else if (v === 0) {
      if (h > 0) {
        offset = h;
        angle = 1;
      } else {
        offset = -h;
        angle = 180;
      }
    } else if (h > 0 && v > 0) {
      offset = Math.max(h, v);
      angle = 45;
    } else if (h > 0 && v < 0) {
      offset = Math.max(h, -v);
      angle = 315;
    } else if (h < 0 && v > 0) {
      offset = Math.max(-h, v);
      angle = 135;
    } else if (h < 0 && v < 0) {
      offset = Math.max(-h, -v);
      angle = 225;
    }
    return {
      type: 'outer',
      color: c.color.replace('#', ''),
      opacity: c.alpha,
      blur: shadow.blur / ratioPx2Pt,
      offset,
      angle
    };
  };
  const dashTypeMap = {
    'solid': 'solid',
    'dashed': 'dash',
    'dotted': 'sysDot'
  };

  const getOutlineOption = (outline: PPTElementOutline): pptxgen.ShapeLineProps => {
    const c = formatColor(outline?.color || '#000000');
    return {
      color: c.color,
      transparency: (1 - c.alpha) * 100,
      width: (outline.width || 1) / ratioPx2Pt,
      dashType: outline.style ? dashTypeMap[outline.style] as 'solid' | 'dash' | 'sysDot' : 'solid'
    };
  };

  const getLinkOption = (link: PPTElementLink): pptxgen.HyperlinkProps | null => {
    const {
      type,
      target
    } = link;
    if (type === 'web') return {
      url: target
    };
    if (type === 'slide') {
      const index = slides.findIndex(slide => slide.id === target);
      if (index !== -1) return {
        slide: index + 1
      };
    }
    return null;
  };

  const isBase64Image = (url: string) => {
    const regex = /^data:image\/[^;]+;base64,/;
    return url.match(regex) !== null;
  };

  const isSVGImage = (url: string) => {
    const isSVGBase64 = /^data:image\/svg\+xml;base64,/.test(url);
    const isSVGUrl = /\.svg$/.test(url);
    return isSVGBase64 || isSVGUrl;
  };

  const isInlineDataUrl = (url: string) => {
    return /^data:/i.test(url);
  };

  const isForeignSource = (url: string) => {
    return /^(https?:|blob:)/i.test(url);
  };

  /** Cross-origin http(s) — direct fetch will fail CORS and browsers always log it. */
  const isCrossOriginHttp = (url: string) => {
    if (!/^https?:/i.test(url)) return false;
    try {
      return new URL(url, location.href).origin !== location.origin;
    } catch {
      return true;
    }
  };

  /**
   * Read a Blob as a data URL for pptxgenjs `options.data` / `cover`.
   * Prefer the response MIME type; fall back to application/octet-stream.
   */
  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') resolve(result);else reject(new Error('FileReader produced non-string result'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Fetch foreign media (images, video, audio, posters, shape patterns) from
   * the editor origin and convert it to a base64 data URL.
   *
   * pptxgenjs `writeFile()` fetches each `path` URL without credentials or the
   * host page CORS context. A bucket CORS/401/403/404 or a flaky network then
   * rejects the whole export as a generic "Export failed". Hosts such as
   * sciobot that store media as hosted URLs (not base64) always hit this.
   *
   * Flow:
   *  1. Cross-origin http(s) + host `exportMediaResolver` → proxy FIRST.
   *     Never probe with browser fetch: failed CORS always spams the console
   *     even when the rejection is caught (sciencefacts.net etc.).
   *  2. Same-origin / blob: direct `fetch` (`credentials: 'omit'`), then proxy.
   *  3. On total failure, return a tiny data: URL so pptxgenjs does not retry
   *     XHR and spam more CORS errors; count in `failed`.
   */
  const fetchSourceAsDataUrl = async (src: string, failed: Set<string>): Promise<string> => {
    if (!src) return src;
    if (isInlineDataUrl(src)) return src;
    if (!isForeignSource(src)) return src;
    const tryBlob = async (blob: Blob): Promise<string> => {
      if (!blob.type || /^(text\/html|text\/plain|application\/json)/i.test(blob.type)) {
        throw new Error(`unexpected mime: ${blob.type || 'empty'}`);
      }
      return blobToDataUrl(blob);
    };
    const tryResolver = async (): Promise<string | null> => {
      const resolver = getFikaExportMediaResolver();
      if (!resolver) return null;
      try {
        const resolved = await resolver(src);
        if (typeof resolved === 'string' && resolved) {
          if (isInlineDataUrl(resolved)) return resolved;
          if (isForeignSource(resolved)) {
            if (isCrossOriginHttp(resolved)) return null;
            const res = await fetch(resolved, {
              credentials: 'omit'
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await tryBlob(await res.blob());
          }
        }
      } catch {
      }
      return null;
    };

    if (isCrossOriginHttp(src) && getFikaExportMediaResolver()) {
      const viaProxy = await tryResolver();
      if (viaProxy) return viaProxy;
      failed.add(src);
      return EMPTY_IMAGE_DATA_URL;
    }
    try {
      const res = await fetch(src, {
        credentials: 'omit'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await tryBlob(await res.blob());
    } catch {
    }
    const viaProxy = await tryResolver();
    if (viaProxy) return viaProxy;
    failed.add(src);
    return EMPTY_IMAGE_DATA_URL;
  };

  /**
   * Collect foreign media on `_slides` (image elements, image backgrounds,
   * shape patterns, video, audio, posters), resolve them to data URLs with a
   * concurrency cap before the export loop, and return original→resolved.
   * Failed sources stay as-is for the pptxgenjs path fallback and increment
   * `failed`. Every data/path branch looks up this map.
   */
  const resolveSlideSources = async (_slides: Slide[], failed: Set<string>): Promise<Map<string, string>> => {
    const srcs = new Set<string>();
    const collect = (src?: string) => {
      if (src && isForeignSource(src)) srcs.add(src);
    };
    for (const slide of _slides) {
      if (slide.background?.type === 'image') collect(slide.background.image?.src);
      if (!slide.elements) continue;
      for (const el of slide.elements) {
        if (el.type === 'image') collect(el.src);else if (el.type === 'shape' && el.pattern) collect(el.pattern);else if (el.type === 'video' || el.type === 'audio') {
          collect(el.src);
          if (el.type === 'video' && el.poster) collect(el.poster);
        }
      }
    }
    if (!srcs.size) return new Map();

    const CONCURRENCY = 6;
    const queue = Array.from(srcs);
    const resolved = new Map<string, string>();
    let cursor = 0;
    const workers: Promise<void>[] = [];
    const run = async () => {
      while (cursor < queue.length) {
        const src = queue[cursor++];
        resolved.set(src, await fetchSourceAsDataUrl(src, failed));
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) workers.push(run());
    await Promise.all(workers);
    return resolved;
  };

  /** Map Fika DrawingML effect extras onto pptxgenjs shape/image options (4.1.12+). */
  const applyEffectsOption = (options: Record<string, unknown>, effects?: PPTElementEffects): void => {
    if (!effects) return;
    if (effects.glow) {
      options.glow = {
        size: effects.glow.radius / ratioPx2Pt,
        color: formatColor(effects.glow.color).color,
        opacity: effects.glow.opacity
      };
    }
    if (effects.softEdge) {
      options.softEdge = {
        radius: effects.softEdge.radius / ratioPx2Pt
      };
    }
    if (effects.reflection) {
      options.reflection = {
        blur: effects.reflection.blur / ratioPx2Pt,
        distance: effects.reflection.distance / ratioPx2Pt,
        direction: effects.reflection.direction,
        opacity: effects.reflection.opacity,
        scaleY: effects.reflection.scaleY
      };
    }
    if (effects.innerShadow) {
      options.shadow = {
        type: 'inner',
        color: formatColor(effects.innerShadow.color).color,
        blur: effects.innerShadow.blur / ratioPx2Pt,
        offset: Math.hypot(effects.innerShadow.h, effects.innerShadow.v) / ratioPx2Pt,
        angle: Math.atan2(effects.innerShadow.v, effects.innerShadow.h) * 180 / Math.PI,
        opacity: effects.innerShadow.opacity ?? 0.75
      };
    }
  };

  const exportPPTX = async (_slides: Slide[], masterOverwrite = true, ignoreMedia = true) => {
    if (exportJob.running.value) return;
    const gen = exportJob.start(_slides.length);
    try {
      await tickExportProgress(0, 0, gen);

      const retained = tryGetCleanRetainedPackage(_slides);
      if (retained) {
        try {
          await tickExportProgress(1, _slides.length, gen);
          saveAs(new Blob([retained], {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          }), `${title}.pptx`);
          return;
        } catch {
        }
      }
      const pptx = new pptxgen();
      applyPPTXTheme(pptx);
      const failedSources = new Set<string>();
      let sources: Map<string, string> = new Map();
      try {
        await prepareLatexToOmml();
        await tickExportProgress(0.04, 0);

        sources = await resolveSlideSources(_slides, failedSources);
        await tickExportProgress(0.08, 0);

        const usedFontFamilies = new Set<string>();
        if (theme.fontName) usedFontFamilies.add(theme.fontName);
        for (const slide of _slides) {
          for (const el of slide.elements) {
            if (el.type === 'text' && el.defaultFontName) usedFontFamilies.add(el.defaultFontName);else if (el.type === 'shape' && el.text?.defaultFontName) usedFontFamilies.add(el.text.defaultFontName);else if (el.type === 'table') {
              for (const row of el.data) {
                for (const cell of row) {
                  if (cell.style?.fontname) usedFontFamilies.add(cell.style.fontname);
                }
              }
            }
          }
        }
        for (const font of await collectEmbeddedFonts([...usedFontFamilies])) {
          await pptx.addFont(font);
        }
        await tickExportProgress(0.1, 0);
        setPPTXLayout(pptx);
        if (masterOverwrite) {
          const {
            color: bgColor,
            alpha: bgAlpha
          } = formatColor(theme.backgroundColor);
          pptx.defineSlideMaster({
            title: 'ScioBot',
            background: {
              color: bgColor,
              transparency: (1 - bgAlpha) * 100
            }
          });
        }

        let phMasterSeq = 0;
        const BODY_TEXT_TYPES = ['subtitle', 'content', 'item', 'itemTitle'];
        const seenSections = new Set<string>();
        const slideCount = _slides.length;
        const SLIDE_START = 0.1;
        const SLIDE_END = 0.92;
        for (let i = 0; i < slideCount; i++) {
          const slide = _slides[i];
          await tickExportProgress(slideJobProgress(i, slideCount, SLIDE_START, SLIDE_END), i + 1, gen);
          if (slide.sectionTag && !seenSections.has(slide.sectionTag.id)) {
            seenSections.add(slide.sectionTag.id);
            pptx.addSection({
              title: slide.sectionTag.title || 'Section'
            });
          }

          const phBindings = new Map<string, 'title' | 'body'>();
          type MasterObjects = NonNullable<pptxgen.SlideMasterProps['objects']>;
          const masterObjects: MasterObjects = [];
          if (slide.elements) {
            const titleEl = slide.elements.find(el => el.type === 'text' && el.textType === 'title') as PPTTextElement | undefined;
            const bodyEl = slide.elements.find(el => el.type === 'text' && BODY_TEXT_TYPES.includes(el.textType || '')) as PPTTextElement | undefined;
            const registerPlaceholder = (el: PPTTextElement, name: 'title' | 'body', type: 'title' | 'body') => {
              phBindings.set(el.id, name);
              const inset = el.inset || [10, 10, 10, 10];
              const boxHeight = isEmptyHTMLText(el.content) ? getPlaceholderBaselineHeight(el) : el.height;
              const fontSizePx = el.placeholderFontSize ?? (type === 'title' ? 28 : 20);
              masterObjects.push({
                placeholder: {
                  options: {
                    name,
                    type,
                    x: el.left / ratioPx2Inch,
                    y: el.top / ratioPx2Inch,
                    w: el.width / ratioPx2Inch,
                    h: boxHeight / ratioPx2Inch,
                    valign: el.vAlign || 'top',
                    align: el.placeholderAlign || (type === 'title' ? 'center' : 'left'),
                    margin: [inset[3], inset[1], inset[2], inset[0]].map(item => item / ratioPx2Pt) as [number, number, number, number],
                    fontFace: el.defaultFontName || pptxDefaultFontFace(),
                    fontSize: fontSizePx / ratioPx2Pt
                  },
                  text: ''
                }
              });
            };
            if (titleEl) registerPlaceholder(titleEl, 'title', 'title');
            if (bodyEl) registerPlaceholder(bodyEl, 'body', 'body');
          }
          let pptxSlide: ReturnType<typeof pptx.addSlide>;
          if (masterObjects.length) {
            const masterName = `ScioBot_${phMasterSeq++}`;
            const masterProps: pptxgen.SlideMasterProps = {
              title: masterName,
              objects: masterObjects
            };
            if (masterOverwrite) {
              const {
                color: bgColor,
                alpha: bgAlpha
              } = formatColor(theme.backgroundColor);
              masterProps.background = {
                color: bgColor,
                transparency: (1 - bgAlpha) * 100
              };
            }
            pptx.defineSlideMaster(masterProps);
            pptxSlide = pptx.addSlide({
              masterName
            });
          } else {
            pptxSlide = pptx.addSlide();
          }

          const transition = transitionForSlide(slide.turningMode);
          if (transition) pptxSlide.addTransition(transition);

          if (slide.notes?.length) {
            for (const note of slide.notes) {
              pptxSlide.addComment({
                text: note.content,
                author: note.user || 'Fika',
                startDate: new Date(note.time).toISOString(),
                replies: (note.replies || []).map(r => ({
                  text: r.content,
                  author: r.user || 'Fika'
                }))
              });
            }
          }
          if (slide.background) {
            const background = slide.background;
            if (background.type === 'image' && background.image) {
              const bgSrc = sources.get(background.image.src) ?? background.image.src;
              if (isSVGImage(bgSrc)) {
                pptxSlide.addImage({
                  data: bgSrc,
                  x: 0,
                  y: 0,
                  w: viewportSize / ratioPx2Inch,
                  h: viewportSize * viewportRatio / ratioPx2Inch
                });
              } else if (isBase64Image(bgSrc)) {
                pptxSlide.background = {
                  data: bgSrc
                };
              } else {
                pptxSlide.background = {
                  path: bgSrc
                };
              }
            } else if (background.type === 'solid' && background.color) {
              const c = formatColor(background.color);
              pptxSlide.background = {
                color: c.color,
                transparency: (1 - c.alpha) * 100
              };
            } else if (background.type === 'gradient' && background.gradient) {
              const gradientFill = gradientToPptxFill(background.gradient);
              if (gradientFill) {
                pptxSlide.background = gradientFill;
              } else {
                const colors = background.gradient.colors;
                const color1 = colors[0].color;
                const color2 = colors[colors.length - 1].color;
                const color = tinycolor.mix(color1, color2).toHexString();
                const c = formatColor(color);
                pptxSlide.background = {
                  color: c.color,
                  transparency: (1 - c.alpha) * 100
                };
              }
            }
          }
          if (slide.remark) {
            const doc = new DOMParser().parseFromString(slide.remark, 'text/html');
            const pList = doc.body.querySelectorAll('p');
            const text = [];
            for (const p of pList) {
              const textContent = p.textContent;
              text.push(textContent || '');
            }
            pptxSlide.addNotes(text.join('\n'));
          }
          if (!slide.elements) continue;
          for (const el of slide.elements) {
            if (el.type === 'text') {
              const phName = phBindings.get(el.id);

              if (isEmptyHTMLText(el.content) && (phName || el.placeholder)) continue;

              const inset = el.inset || [10, 10, 10, 10];
              const baseFontSizePx = el.placeholderFontSize ?? defaultFontSize;
              const baseFontSizePt = baseFontSizePx / ratioPx2Pt;
              const defaultColor = el.defaultColor ? formatColor(el.defaultColor).color : undefined;
              const textProps = formatHTML(el.content, {
                color: defaultColor,
                fontSizePt: baseFontSizePt
              });
              const options: pptxgen.TextPropsOptions = {
                x: el.left / ratioPx2Inch,
                y: el.top / ratioPx2Inch,
                w: el.width / ratioPx2Inch,
                h: el.height / ratioPx2Inch,
                fontSize: baseFontSizePt,
                fontFace: pptxDefaultFontFace(),
                color: '#000000',
                valign: el.vAlign || 'top',
                margin: [inset[3], inset[1], inset[2], inset[0]].map(item => item / ratioPx2Pt) as [number, number, number, number],
                paraSpaceBefore: 5 / ratioPx2Pt,
                lineSpacingMultiple: 1.5 / 1.25
              };
              if (el.rotate) options.rotate = el.rotate;
              if (el.wordSpace) options.charSpacing = el.wordSpace / ratioPx2Pt;
              if (el.lineHeight) options.lineSpacingMultiple = el.lineHeight / 1.25;
              if (el.fill) {
                const c = formatColor(el.fill);
                const opacity = el.opacity === undefined ? 1 : el.opacity;
                options.fill = {
                  color: c.color,
                  transparency: (1 - c.alpha * opacity) * 100
                };
              }
              if (defaultColor) options.color = defaultColor;
              if (el.defaultFontName) options.fontFace = el.defaultFontName;
              if (el.placeholderAlign) options.align = el.placeholderAlign;
              if (el.shadow) options.shadow = getShadowOption(el.shadow);
              applyEffectsOption(options as Record<string, unknown>, el.effects);
              if (el.outline?.width) options.line = getOutlineOption(el.outline);
              if (el.outline?.radius) {
                options.rectRadius = outlineRadiusToPptxRectRadius(el.outline.radius, el.width, el.height);
              }
              if (el.opacity !== undefined) options.transparency = (1 - el.opacity) * 100;
              if (el.paragraphSpace !== undefined) options.paraSpaceBefore = el.paragraphSpace / ratioPx2Pt;
              if (el.vertical) options.vert = 'eaVert';
              if (phName) options.placeholder = phName;
              if (!el.fixedHeight && !phName && !el.placeholder) options.fit = 'resize';
              const animation = animationForElement(el.id, slide.animations);
              if (animation) options.animation = animation;
              pptxSlide.addText(textProps, options);
            } else if (el.type === 'image') {
              const options: pptxgen.ImageProps = {
                x: el.left / ratioPx2Inch,
                y: el.top / ratioPx2Inch,
                w: el.width / ratioPx2Inch,
                h: el.height / ratioPx2Inch
              };
              const imgSrc = sources.get(el.src) ?? el.src;
              if (isBase64Image(imgSrc)) options.data = imgSrc;else options.path = imgSrc;
              if (el.flipH) options.flipH = el.flipH;
              if (el.flipV) options.flipV = el.flipV;
              if (el.rotate) options.rotate = el.rotate;
              if (el.link) {
                const linkOption = getLinkOption(el.link);
                if (linkOption) options.hyperlink = linkOption;
              }
              if (el.filters?.opacity) options.transparency = 100 - parseInt(el.filters?.opacity);
              if (el.radius) options.rectRadius = outlineRadiusToPptxRectRadius(el.radius, el.width, el.height);
              if (el.outline?.width) options.line = getOutlineOption(el.outline);
              if (el.shadow) options.shadow = getShadowOption(el.shadow);
              applyEffectsOption(options as Record<string, unknown>, el.effects);
              if (el.clip) {
                if (el.clip.shape === 'ellipse') options.rounding = true;
                const crop = getPPTXImageCrop(el.width, el.height, el.clip.range, ratioPx2Inch);
                options.w = crop.imageWidth;
                options.h = crop.imageHeight;
                options.sizing = {
                  type: 'crop',
                  ...crop.sizing
                };
              }
              const animation = animationForElement(el.id, slide.animations);
              if (animation) options.animation = animation;
              pptxSlide.addImage(options);
            } else if (el.type === 'shape') {
              if (el.special) {
                const container = document.createElement('div');
                const { createElement } = await import('react');
                const { createRoot } = await import('react-dom/client');
                const { flushSync } = await import('react-dom');
                const root = createRoot(container);
                flushSync(() => {
                  root.render(createElement(BaseShapeElement, { elementInfo: el }));
                });
                const svgRef = container.querySelector('svg');
                const base64SVG = svgRef ? svg2Base64(svgRef) : '';
                root.unmount();
                if (!base64SVG) continue;
                const options: pptxgen.ImageProps = {
                  data: base64SVG,
                  x: el.left / ratioPx2Inch,
                  y: el.top / ratioPx2Inch,
                  w: el.width / ratioPx2Inch,
                  h: el.height / ratioPx2Inch
                };
                if (el.rotate) options.rotate = el.rotate;
                if (el.flipH) options.flipH = el.flipH;
                if (el.flipV) options.flipV = el.flipV;
                if (el.shadow) options.shadow = getShadowOption(el.shadow);
                applyEffectsOption(options as Record<string, unknown>, el.effects);
                if (el.link) {
                  const linkOption = getLinkOption(el.link);
                  if (linkOption) options.hyperlink = linkOption;
                }
                const animation = animationForElement(el.id, slide.animations);
                if (animation) options.animation = animation;
                pptxSlide.addImage(options);
              } else {
                const scale = {
                  x: el.width / el.viewBox[0],
                  y: el.height / el.viewBox[1]
                };
                const points = formatPoints(toPoints(el.path), scale);
                let fillColor = formatColor(el.fill);
                const gradientFill = el.gradient ? gradientToPptxFill(el.gradient) : null;
                if (el.gradient && !gradientFill) {
                  const colors = el.gradient.colors;
                  const color1 = colors[0].color;
                  const color2 = colors[colors.length - 1].color;
                  const color = tinycolor.mix(color1, color2).toHexString();
                  fillColor = formatColor(color);
                }
                if (el.pattern) fillColor = formatColor('#00000000');
                const opacity = el.opacity === undefined ? 1 : el.opacity;
                const options: pptxgen.ShapeProps = {
                  x: el.left / ratioPx2Inch,
                  y: el.top / ratioPx2Inch,
                  w: el.width / ratioPx2Inch,
                  h: el.height / ratioPx2Inch,
                  fill: gradientFill ?? {
                    color: fillColor.color,
                    transparency: (1 - fillColor.alpha * opacity) * 100
                  },
                  points
                };
                if (el.flipH) options.flipH = el.flipH;
                if (el.flipV) options.flipV = el.flipV;
                if (el.shadow) options.shadow = getShadowOption(el.shadow);
                applyEffectsOption(options as Record<string, unknown>, el.effects);
                if (el.outline?.width) options.line = getOutlineOption(el.outline);
                if (el.rotate) options.rotate = el.rotate;
                if (el.link) {
                  const linkOption = getLinkOption(el.link);
                  if (linkOption) options.hyperlink = linkOption;
                }
                const animation = animationForElement(el.id, slide.animations);
                if (animation) options.animation = animation;
                pptxSlide.addShape('custGeom' as pptxgen.ShapeType, options);
              }
              if (el.text) {
                const inset = el.text.inset || [10, 10, 10, 10];
                const shapeFontSizePt = defaultFontSize / ratioPx2Pt;
                const shapeDefaultColor = el.text.defaultColor ? formatColor(el.text.defaultColor).color : undefined;
                const textProps = formatHTML(el.text.content, {
                  color: shapeDefaultColor,
                  fontSizePt: shapeFontSizePt
                });
                const options: pptxgen.TextPropsOptions = {
                  x: el.left / ratioPx2Inch,
                  y: el.top / ratioPx2Inch,
                  w: el.width / ratioPx2Inch,
                  h: el.height / ratioPx2Inch,
                  fontSize: shapeFontSizePt,
                  fontFace: pptxDefaultFontFace(),
                  color: '#000000',
                  paraSpaceBefore: 5 / ratioPx2Pt,
                  margin: [inset[3], inset[1], inset[2], inset[0]].map(item => item / ratioPx2Pt) as [number, number, number, number],
                  valign: el.text.align
                };
                if (el.rotate) options.rotate = el.rotate;
                if (shapeDefaultColor) options.color = shapeDefaultColor;
                if (el.text.defaultFontName) options.fontFace = el.text.defaultFontName;
                pptxSlide.addText(textProps, options);
              }
              if (el.pattern) {
                const options: pptxgen.ImageProps = {
                  x: el.left / ratioPx2Inch,
                  y: el.top / ratioPx2Inch,
                  w: el.width / ratioPx2Inch,
                  h: el.height / ratioPx2Inch
                };
                const patternSrc = sources.get(el.pattern) ?? el.pattern;
                if (isBase64Image(patternSrc)) options.data = patternSrc;else options.path = patternSrc;
                if (el.flipH) options.flipH = el.flipH;
                if (el.flipV) options.flipV = el.flipV;
                if (el.rotate) options.rotate = el.rotate;
                if (el.link) {
                  const linkOption = getLinkOption(el.link);
                  if (linkOption) options.hyperlink = linkOption;
                }
                pptxSlide.addImage(options);
              }
            } else if (el.type === 'line') {
              const path = getLineElementPath(el);
              const points = formatPoints(toPoints(path));
              const {
                minX,
                maxX,
                minY,
                maxY
              } = getElementRange(el);
              const c = formatColor(el.color);
              const options: pptxgen.ShapeProps = {
                x: el.left / ratioPx2Inch,
                y: el.top / ratioPx2Inch,
                w: (maxX - minX) / ratioPx2Inch,
                h: (maxY - minY) / ratioPx2Inch,
                line: {
                  color: c.color,
                  transparency: (1 - c.alpha) * 100,
                  width: el.width / ratioPx2Pt,
                  dashType: dashTypeMap[el.style] as 'solid' | 'dash' | 'sysDot',
                  beginArrowType: el.points[0] ? 'arrow' : 'none',
                  endArrowType: el.points[1] ? 'arrow' : 'none'
                },
                points
              };
              if (el.shadow) options.shadow = getShadowOption(el.shadow);
              const animation = animationForElement(el.id, slide.animations);
              if (animation) options.animation = animation;
              pptxSlide.addShape('custGeom' as pptxgen.ShapeType, options);
            } else if (el.type === 'chart') {
              const chartData: pptxgen.IOptsChartData[] = [];
              for (let i = 0; i < el.data.series.length; i++) {
                const item = el.data.series[i];
                chartData.push({
                  name: el.data.legends?.[i] || getLL().export.chartSeries({
                    index: i + 1
                  }),
                  labels: el.data.labels as unknown as string[][],
                  values: item
                });
              }
              let chartColors: string[] = [];
              if (el.themeColors.length === 10) chartColors = el.themeColors.map(color => formatColor(color).color);else if (el.themeColors.length === 1) chartColors = tinycolor(el.themeColors[0]).analogous(10).map(color => formatColor(color.toHexString()).color);else {
                const len = el.themeColors.length;
                const supplement = tinycolor(el.themeColors[len - 1]).analogous(10 + 1 - len).map(color => color.toHexString());
                chartColors = [...el.themeColors.slice(0, len - 1), ...supplement].map(color => formatColor(color).color);
              }
              const options: pptxgen.IChartOpts = {
                x: el.left / ratioPx2Inch,
                y: el.top / ratioPx2Inch,
                w: el.width / ratioPx2Inch,
                h: el.height / ratioPx2Inch,
                chartColors: el.chartType === 'pie' || el.chartType === 'ring' ? chartColors : chartColors.slice(0, el.data.series.length)
              };
              const textColor = formatColor(resolveChartLabelColor(el, {
                background: slide.background,
                fallbackSurface: theme.backgroundColor,
                fontColor: theme.fontColor
              })).color;
              options.catAxisLabelColor = textColor;
              options.valAxisLabelColor = textColor;
              const fontSize = 14 / ratioPx2Pt;
              options.catAxisLabelFontSize = fontSize;
              options.valAxisLabelFontSize = fontSize;
              if (el.fill || el.outline) {
                const plotArea: pptxgen.IChartPropsFillLine = {};
                if (el.fill) {
                  plotArea.fill = {
                    color: formatColor(el.fill).color
                  };
                }
                if (el.outline) {
                  plotArea.border = {
                    pt: el.outline.width! / ratioPx2Pt,
                    color: formatColor(el.outline.color!).color
                  };
                }
                options.plotArea = plotArea;
              }
              if (el.data.series.length > 1 && el.chartType !== 'scatter' || el.chartType === 'pie' || el.chartType === 'ring') {
                options.showLegend = true;
                options.legendPos = 'b';
                options.legendColor = textColor;
                options.legendFontSize = fontSize;
              }
              let type = pptx.ChartType.bar;
              if (el.chartType === 'bar') {
                type = pptx.ChartType.bar;
                options.barDir = 'col';
                if (el.options?.stack) options.barGrouping = 'stacked';else options.barOverlapPct = 0; 
              } else if (el.chartType === 'column') {
                type = pptx.ChartType.bar;
                options.barDir = 'bar';
                if (el.options?.stack) options.barGrouping = 'stacked';else options.barOverlapPct = 0;
              } else if (el.chartType === 'line') {
                type = pptx.ChartType.line;
                if (el.options?.lineSmooth) options.lineSmooth = true;
              } else if (el.chartType === 'area') {
                type = pptx.ChartType.area;
              } else if (el.chartType === 'radar') {
                type = pptx.ChartType.radar;
              } else if (el.chartType === 'scatter') {
                type = pptx.ChartType.scatter;
                options.lineSize = 0;
              } else if (el.chartType === 'pie') {
                type = pptx.ChartType.pie;
              } else if (el.chartType === 'ring') {
                type = pptx.ChartType.doughnut;
                options.holeSize = 60;
              }
              pptxSlide.addChart(type, chartData, options);
            } else if (el.type === 'table') {
              const hiddenCells = [];
              for (let i = 0; i < el.data.length; i++) {
                const rowData = el.data[i];
                for (let j = 0; j < rowData.length; j++) {
                  const cell = rowData[j];
                  if (cell.colspan > 1 || cell.rowspan > 1) {
                    for (let row = i; row < i + cell.rowspan; row++) {
                      for (let col = row === i ? j + 1 : j; col < j + cell.colspan; col++) hiddenCells.push(`${row}_${col}`);
                    }
                  }
                }
              }
              const tableData = [];
              const theme = el.theme;
              let headerColor: FormatColor | null = null;
              let stripeColor: FormatColor | null = null;
              let stripeAltColor: FormatColor | null = null;
              if (theme) {
                const palette = getTableThemeColors(theme.color);
                headerColor = formatColor(palette.header);
                stripeColor = formatColor(palette.stripe);
                stripeAltColor = formatColor(palette.stripeAlt);
              }
              for (let i = 0; i < el.data.length; i++) {
                const row = el.data[i];
                const _row = [];
                for (let j = 0; j < row.length; j++) {
                  const cell = row[j];
                  const cellOptions: pptxgen.TableCellProps = {
                    colspan: cell.colspan,
                    rowspan: cell.rowspan,
                    bold: cell.style?.bold || false,
                    italic: cell.style?.em || false,
                    underline: {
                      style: cell.style?.underline ? 'sng' : 'none'
                    },
                    align: cell.style?.align || 'left',
                    valign: 'middle',
                    fontFace: cell.style?.fontname || pptxDefaultFontFace(),
                    fontSize: (cell.style?.fontsize ? parseInt(cell.style?.fontsize) : 14) / ratioPx2Pt
                  };
                  if (theme && headerColor && stripeColor && stripeAltColor) {
                    let c: FormatColor = i % 2 === 0 ? stripeAltColor : stripeColor;
                    if (theme.rowHeader && i === 0) c = headerColor;else if (theme.rowFooter && i === el.data.length - 1) c = headerColor;else if (theme.colHeader && j === 0) c = headerColor;else if (theme.colFooter && j === row.length - 1) c = headerColor;
                    cellOptions.fill = {
                      color: c.color,
                      transparency: (1 - c.alpha) * 100
                    };
                  }
                  if (cell.style?.backcolor) {
                    const c = formatColor(cell.style.backcolor);
                    cellOptions.fill = {
                      color: c.color,
                      transparency: (1 - c.alpha) * 100
                    };
                  }
                  if (cell.style?.color) cellOptions.color = formatColor(cell.style.color).color;
                  if (!hiddenCells.includes(`${i}_${j}`)) {
                    _row.push({
                      text: cell.text,
                      options: cellOptions
                    });
                  }
                }
                if (_row.length) tableData.push(_row);
              }
              const options: pptxgen.TableProps = {
                x: el.left / ratioPx2Inch,
                y: el.top / ratioPx2Inch,
                w: el.width / ratioPx2Inch,
                h: el.height / ratioPx2Inch,
                colW: el.colWidths.map(item => el.width * item / ratioPx2Inch)
              };
              if (el.theme) options.fill = {
                color: '#fafafa'
              };
              if (el.outline.width && el.outline.color) {
                options.border = {
                  type: el.outline.style === 'solid' ? 'solid' : 'dash',
                  pt: el.outline.width / ratioPx2Pt,
                  color: formatColor(el.outline.color).color
                };
              }
              const animation = animationForElement(el.id, slide.animations);
              if (animation) options.animation = animation;
              pptxSlide.addTable(tableData, options);
            } else if (el.type === 'latex') {
              const color = formatColor(el.color || '#000000').color;
              const fontSizePt = LATEX_ELEMENT_FONT_SIZE * latexPaintScale(el) / ratioPx2Pt;
              const ommlRaw = tryLatexToOmmlSync(el.latex);
              const omml = ommlRaw ? applyOmmlRunStyle(ommlRaw, {
                color,
                fontSizePt
              }) : null;
              const options: pptxgen.TextPropsOptions = {
                x: el.left / ratioPx2Inch,
                y: el.top / ratioPx2Inch,
                w: el.width / ratioPx2Inch,
                h: el.height / ratioPx2Inch,
                fontSize: fontSizePt,
                color,
                valign: 'middle',
                align: 'center'
              };
              if (el.link) {
                const linkOption = getLinkOption(el.link);
                if (linkOption) options.hyperlink = linkOption;
              }
              const animation = animationForElement(el.id, slide.animations);
              if (animation) options.animation = animation;
              if (omml) {
                pptxSlide.addText([{
                  text: '',
                  options: {
                    omml
                  }
                }], options);
              } else {
                pptxSlide.addText(el.latex, options);
              }
            } else if (el.type === 'mermaid') {
              let imageData = '';
              try {
                const svg = await renderMermaid(el.code, el.id);
                imageData = await svgToPngDataURL(svg, el.width, el.height);
              } catch (error) {
                console.error('Mermaid export failed:', error);
                imageData = '';
              }
              if (imageData) {
                const options: pptxgen.ImageProps = {
                  data: imageData,
                  x: el.left / ratioPx2Inch,
                  y: el.top / ratioPx2Inch,
                  w: el.width / ratioPx2Inch,
                  h: el.height / ratioPx2Inch
                };
                if (el.rotate) options.rotate = el.rotate;
                if (el.link) {
                  const linkOption = getLinkOption(el.link);
                  if (linkOption) options.hyperlink = linkOption;
                }
                const animation = animationForElement(el.id, slide.animations);
                if (animation) options.animation = animation;
                pptxSlide.addImage(options);
              }
            } else if (el.type === 'code') {
              const painted = await codeElementToPptxText(el);
              const options: pptxgen.TextPropsOptions = codeElementPptxBox(el, painted, ratioPx2Inch, ratioPx2Pt);
              if (el.link) {
                const linkOption = getLinkOption(el.link);
                if (linkOption) options.hyperlink = linkOption;
              }
              const animation = animationForElement(el.id, slide.animations);
              if (animation) options.animation = animation;
              pptxSlide.addText(painted.runs, options);
            } else if (!ignoreMedia && (el.type === 'video' || el.type === 'audio')) {
              const mediaSrc = sources.get(el.src) ?? el.src;
              const isInline = isInlineDataUrl(mediaSrc);
              const options: pptxgen.MediaProps = {
                x: el.left / ratioPx2Inch,
                y: el.top / ratioPx2Inch,
                w: el.width / ratioPx2Inch,
                h: el.height / ratioPx2Inch,
                type: el.type
              };
              if (isInline) options.data = mediaSrc;else options.path = mediaSrc;
              if (el.type === 'video' && el.poster) {
                const posterSrc = sources.get(el.poster) ?? el.poster;
                options.cover = posterSrc;
              }
              if (el.autoplay) options.autoplay = true;
              if (el.type === 'audio' && el.loop) options.loop = true;
              const extMatch = el.src.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
              if (extMatch && extMatch[1]) options.extn = extMatch[1];else if (el.ext) options.extn = el.ext;
              const videoExts = ['avi', 'mp4', 'm4v', 'mov', 'wmv'];
              const audioExts = ['mp3', 'm4a', 'mp4', 'wav', 'wma'];
              if (options.extn && [...videoExts, ...audioExts].includes(options.extn)) {
                const animation = animationForElement(el.id, slide.animations);
                if (animation) options.animation = animation;
                pptxSlide.addMedia(options);
              }
            }
          }
        }
        await tickExportProgress(0.96, slideCount + 1, gen);
        try {
          await pptx.writeFile({
            fileName: `${title}.pptx`
          });
          await tickExportProgress(1, slideCount + 1, gen);
          if (failedSources.size) {
            message.warning(`${getLL().export.exportPartial()} (${failedSources.size})`);
          }
        } catch {
          const detail = failedSources.size ? ` (${failedSources.size})` : '';
          message.error(`${getLL().export.exportFailed()}${detail}`);
        }
      } catch {
        message.error(getLL().export.exportFailed());
      }
    } finally {
      exportJob.finish(gen);
    }
  };
  return {
    exporting: exportJob.running.value,
    exportProgress: exportJob.progress.value,
    exportSlide: exportJob.current.value,
    exportSlideTotal: exportJob.total.value,
    exportImage,
    exportImagePPTX,
    exportJSON,
    exportSpecificFile,
    exportPPTX
  };
};
