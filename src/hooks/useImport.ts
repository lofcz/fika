import { useSyncExternalStore } from 'react'
import { parse, type Shape, type Element, type ChartItem, type BaseElement } from 'pptxtojson';
import { nanoid } from 'nanoid';
import tinycolor from 'tinycolor2';
import { useSlidesStore, useMainStore, useImportConfirmStore } from '@/store';
import { drainCommitQueue } from '@/utils/commitQueue';
import { decrypt } from '@/utils/crypto';
import { isFloatEqual } from '@/utils/common';
import { type ShapePoolItem, SHAPE_LIST, SHAPE_PATH_FORMULAS } from '@/configs/shapes';
import useAddSlidesOrElements from '@/hooks/useAddSlidesOrElements';
import useHistorySnapshot from './useHistorySnapshot';
import message from '@/utils/message';
import { getLL } from '@/i18n/getLL';
import { getSvgPathRange, toPoints } from '@/utils/svgPathParser';
import { loadGoogleFonts } from '@/utils/font';
import { containsTexSource } from '@/utils/markdown';
import { convertBareLatexBlocks, convertOmmlMathSpans } from '@/utils/importedTex';
import { ensureMathliveReady, normalizeImportedLatex } from '@/utils/math';
import { importOutlineFromPptx, pptxBorderColorToString, type PptxBorderColor } from '@/utils/elementOutline';
import { fixSlideTextContrast, resolveChartLabelColor } from '@/utils/textContrast';
import { sampleImagePaintsForSlide } from '@/utils/imagePaintSample';
import { getPPTXImportScale } from '@/utils/pptxUnit';
import { pptxImageClip, pptxPictureSource } from '@/utils/pptxImportPicture';
import { PPTX_HYPERLINK_COLOR, linkifyPlainUrls, styleImportedHyperlinks, wrapHangingIndentParagraphsAsLists } from '@/utils/pptxImportText';
import { importedParagraphMetrics, scalePptxTextInset } from '@/utils/pptxImportMetrics';
import { markSourcePackageDirty, retainSourcePackage } from '@/utils/pptxSourcePackage';
import { htmlToStructuredText } from '@/utils/pptxStructuredText';
import { importedCodeFontSize, importedCodeSource, parseCodeShapeName } from '@/utils/codeShapeTag';
import { buildImportDiagnosticsReport, setLastImportDiagnostics } from '@/utils/pptxImportDiagnostics';
import { internSlidesMedia, startInternSlideMedia } from '@/utils/mediaIntern';
import { normalizeImportApplyOptions, resolveImportApply, type ImportApplyMode, type ImportApplyOptions } from '@/utils/importApply';
import { applyImportTransitions } from '@/utils/importTransition';
import { DEFAULT_TURNING_MODE } from '@/configs/animation';
import { createJobProgress, isAbortError, slideJobProgress } from '@/utils/jobProgress';
import type { Slide, SlideTheme, TableCellStyle, TableCell, ChartType, SlideBackground, PPTShapeElement, PPTLineElement, LinePoint, PPTImageElement, TextAlignVertical, PPTTextElement, PPTCodeElement, ChartOptions, Gradient, PPTElement } from '@/types/slides';

/** Lazy — pulls jszip (and Node stream/Buffer polyfills) only when importing PPTX. */
const loadPptxImportFidelity = () => import('@/utils/pptxImportFidelity');
const importJob = createJobProgress();
const readFileAsText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
  reader.onabort = () => reject(new DOMException('The file read was aborted', 'AbortError'));
  reader.readAsText(file);
});
const readFileAsArrayBuffer = (file: File, onProgress?: (ratio: number) => void) => new Promise<ArrayBuffer>((resolve, reject) => {
  const reader = new FileReader();
  reader.onprogress = event => {
    if (event.lengthComputable) onProgress?.(event.loaded / event.total);
  };
  reader.onload = () => resolve(reader.result as ArrayBuffer);
  reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
  reader.onabort = () => reject(new DOMException('The file read was aborted', 'AbortError'));
  reader.readAsArrayBuffer(file);
});
const vAlignMap: Record<string, TextAlignVertical> = {
  'mid': 'middle',
  'down': 'bottom',
  'up': 'top'
};
const getAspectRatio = (width: number, height: number) => {
  if (!width || !height) return 0.5625;
  let aspectRatio = height / width;
  if (isFloatEqual(aspectRatio, 0.625)) aspectRatio = 0.625;else if (isFloatEqual(aspectRatio, 0.75)) aspectRatio = 0.75;else if (isFloatEqual(aspectRatio, 0.5625)) aspectRatio = 0.5625;
  return aspectRatio;
};
const getTextNodeStyleSpan = (textNode: Text, styleProp: 'fontSize' | 'color') => {
  let parent = textNode.parentElement;
  while (parent) {
    if (parent.tagName === 'SPAN' && parent.style[styleProp]) return parent;
    if (parent.tagName === 'LI') break;
    parent = parent.parentElement;
  }
  return null;
};
const getListItemStyleValue = (li: HTMLLIElement, styleProp: 'fontSize' | 'color') => {
  const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
  let styleSpan: HTMLSpanElement | null = null;
  let hasTextContent = false;
  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    const textContent = textNode.textContent?.replace(/\s+/g, '');
    if (textContent) {
      const parentLi = textNode.parentElement?.closest('li');
      if (parentLi === li) {
        hasTextContent = true;
        const currentStyleSpan = getTextNodeStyleSpan(textNode, styleProp);
        if (!currentStyleSpan) return '';
        if (!styleSpan) styleSpan = currentStyleSpan as HTMLSpanElement;
        else if (styleSpan.style[styleProp] !== currentStyleSpan.style[styleProp]) return '';
      }
    }
    currentNode = walker.nextNode();
  }
  return hasTextContent && styleSpan ? styleSpan.style[styleProp] : '';
};

/** Recursively check parsed pptxtojson elements for inline OMML math markup. */
const elementsContainOmmlMath = (elements?: Element[]): boolean => {
  if (!elements) return false;
  for (const el of elements) {
    if (el.type === 'group' && elementsContainOmmlMath(el.elements)) return true;
    if ('content' in el && typeof el.content === 'string' && el.content.includes('omml-math')) return true;
    if (el.type === 'table' && el.data.some(row => row.some(cell => cell.text && cell.text.includes('omml-math')))) return true;
  }
  return false;
};
const elementsContainBareLatex = (elements?: Element[]): boolean => {
  if (!elements) return false;
  for (const el of elements) {
    if (el.type === 'group' && elementsContainBareLatex(el.elements)) return true;
    if ('content' in el && typeof el.content === 'string' && containsTexSource(el.content)) return true;
  }
  return false;
};
const finalizeImportedHtml = (html: string) => {
  const hasList = /<(ul|ol)\b/i.test(html) && (/font-size\s*:/i.test(html) || /color\s*:/i.test(html));
  const hasOmmlMath = html.includes('omml-math');
  const hasBareLatex = containsTexSource(html);
  if (!hasList && !hasOmmlMath && !hasBareLatex) return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (hasOmmlMath) convertOmmlMathSpans(doc);
  if (hasBareLatex) convertBareLatexBlocks(doc);
  if (hasList) promoteListTextStyle(doc);
  return doc.body.innerHTML;
};
const promoteListTextStyle = (doc: Document) => {
  const lists = doc.body.querySelectorAll<HTMLElement>('ul, ol');
  lists.forEach(list => {
    const listItems = Array.from(list.children).filter(child => child.tagName === 'LI') as HTMLLIElement[];
    if (!listItems.length) return;
    if (!list.style.fontSize) {
      let fontSize = '';
      for (const li of listItems) {
        const currentFontSize = getListItemStyleValue(li, 'fontSize');
        if (!currentFontSize) {
          fontSize = '';
          break;
        }
        if (!fontSize) fontSize = currentFontSize;else if (fontSize !== currentFontSize) {
          fontSize = '';
          break;
        }
      }
      if (fontSize) list.style.fontSize = fontSize;
    }
    if (!list.style.color) {
      let color = '';
      for (const li of listItems) {
        const currentColor = getListItemStyleValue(li, 'color');
        if (!currentColor) {
          color = '';
          break;
        }
        if (!color) color = currentColor;else if (color !== currentColor) {
          color = '';
          break;
        }
      }
      if (color && tinycolor(color).toHexString().toLowerCase() !== PPTX_HYPERLINK_COLOR.toLowerCase()) {
        list.style.color = color;
      }
    }
  });
};
const normalizeIndentValue = (indent: string, ratio: number) => {
  const value = parseFloat(indent);
  if (!value || value < 0) return 0;
  let indentValue = 0;
  if (indent.indexOf('em') !== -1) {
    indentValue = parseInt(indent);
  } else if (indent.indexOf('px') !== -1) {
    indentValue = Math.floor(parseInt(indent) / 16);
    if (!indentValue) indentValue = 1;
  } else if (indent.indexOf('pt') !== -1) {
    indentValue = Math.floor(value * ratio / 16);
    if (!indentValue) indentValue = 1;
  }
  if (indentValue > 8) indentValue = 8;
  return indentValue;
};
const convertTextContent = (html: string, ratio: number) => {
  if (!html) return '';
  const listedHtml = wrapHangingIndentParagraphsAsLists(html, ratio);
  const processedHtml = listedHtml.replace(/font-size:\s*([\d.]+)pt/g, (match, p1) => {
    return `font-size: ${Math.floor(parseFloat(p1) * ratio)}px`;
  }).replace(/&nbsp;/g, ' ').replace(/style="([^"]*)"/g, (match, styleStr: string) => {
    let newStyle = styleStr;
    const gradientMatch = styleStr.match(/background:\s*(linear-gradient\([^)]+\))/);
    if (gradientMatch) {
      const colorMatches = gradientMatch[1].match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?\([^)]+\)/g);
      if (colorMatches && colorMatches.length) {
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
        const hexColor = tinycolor(avgColor).toHexString();
        newStyle = newStyle.replace(/background:\s*linear-gradient\([^)]+\)\s*;?/g, '').replace(/background-clip:\s*text\s*;?/g, '').replace(/color:\s*transparent\s*;?/g, '');
        newStyle = `color: ${hexColor}; ${newStyle}`;
      }
    }
    const marginLeftMatch = newStyle.match(/margin-left\s*:\s*([^;]+);?/i);
    const indentValue = marginLeftMatch ? normalizeIndentValue(marginLeftMatch[1], ratio) : 0;
    newStyle = newStyle.replace(/margin-(top|bottom|left)\s*:\s*[^;]+;?/g, '').replace(/text-indent\s*:\s*([^;]+);?/g, (match, p1) => {
      const textIndentValue = normalizeIndentValue(p1, ratio);
      return textIndentValue ? `text-indent: ${textIndentValue}em;` : '';
    }).replace(/;\s*;/g, ';').replace(/^\s*;\s*/, '').replace(/;\s*$/, ';').trim();
    return [indentValue ? `data-indent="${indentValue}"` : '', newStyle ? `style="${newStyle}"` : ''].filter(Boolean).join(' ');
  });
  return finalizeImportedHtml(styleImportedHyperlinks(linkifyPlainUrls(processedHtml)));
};
const slidesState = () => useSlidesStore.getState();

export function getImportApi() {
  /* oxlint-disable react/rules-of-hooks -- zustand snapshot helpers, not React hooks */
  const {
    addHistorySnapshot
  } = useHistorySnapshot();
  const {
    addSlidesFromData
  } = useAddSlidesOrElements();
  /* oxlint-enable react/rules-of-hooks */
  const beginImportJob = (total = 0) => {
    if (importJob.running.value) {
      message.warning(getLL().editor.import.busy());
      return null;
    }
    return importJob.start(total);
  };
  const failImport = (error: unknown, fallback: string) => {
    if (isAbortError(error)) return;
    console.error('[pptx-import]', error);
    message.error(fallback);
  };
  const resetEditorSelection = () => {
    drainCommitQueue();
    const main = useMainStore.getState();
    main.setActiveElementIdList([]);
    main.setActiveGroupElementId('');
    main.setClipingImageElementId('');
    main.updateSelectedSlidesIndex([]);
    if (main.creatingElement) main.setCreatingElement(null);
    if (main.creatingCustomShape) main.setCreatingCustomShapeState(null);
    if (main.disableHotkeys) main.setDisableHotkeysState(false);
  };
  const applyImportedSlides = async (slides: Slide[], apply: ImportApplyMode, extras?: {
    theme?: Partial<SlideTheme>;
    title?: string;
    aspectRatio?: number;
    width?: number;
    turningMode?: ImportApplyOptions['turningMode'];
    defaultTurningMode?: ImportApplyOptions['defaultTurningMode'];
  }) => {
    const applied = applyImportTransitions(slides, {
      turningMode: extras?.turningMode,
      defaultTurningMode: extras?.defaultTurningMode ?? DEFAULT_TURNING_MODE,
    })
    await internSlidesMedia(applied.slides);
    resetEditorSelection();
    const store = slidesState();
    if (typeof extras?.turningMode === 'string') {
      store.setDefaultTurningMode(extras.turningMode)
    } else if (apply === 'replace') {
      store.setDefaultTurningMode(DEFAULT_TURNING_MODE)
    }
    if (apply === 'replace') {
      store.updateSlideIndex(0);
      store.setSlides(applied.slides, extras?.theme, { clone: false });
      if (extras?.title) store.setTitle(extras.title);
      if (extras?.aspectRatio !== undefined && extras.aspectRatio !== store.viewportRatio) {
        store.setViewportRatio(extras.aspectRatio);
      }
      if (extras?.width && extras.width !== store.viewportSize) store.setViewportSize(extras.width);
      addHistorySnapshot();
      return;
    }
    addSlidesFromData(applied.slides);
  };
  const decideImportApply = async (options?: boolean | ImportApplyOptions) => {
    const normalized = normalizeImportApplyOptions(options);
    const slideCount = slidesState().slides.length;
    const decision = resolveImportApply(slideCount, normalized);
    if (!decision.needsConfirm) {
      return {
        apply: decision.apply,
        turningMode: normalized.turningMode,
        defaultTurningMode: normalized.defaultTurningMode,
      };
    }
    const confirmed = await useImportConfirmStore.getState().request(slideCount);
    if (!confirmed) return null;
    return {
      apply: confirmed.apply,
      turningMode: normalized.turningMode ?? (confirmed.turningMode === 'keep' ? undefined : confirmed.turningMode),
      defaultTurningMode: normalized.defaultTurningMode,
    };
  };
  const importTextDeck = async (files: FileList | File[], options: boolean | ImportApplyOptions, decode: (text: string) => unknown) => {
    if (importJob.running.value) {
      message.warning(getLL().editor.import.busy());
      return false;
    }
    const apply = await decideImportApply(options);
    if (!apply) return false;
    const file = files[0];
    if (!file) return false;
    const gen = beginImportJob(0);
    if (gen == null) return false;
    try {
      await importJob.tick(0.12, 0, gen);
      const parsed = decode(await readFileAsText(file)) as {
        title?: string;
        slides?: Slide[];
        theme?: Partial<SlideTheme>;
        width?: number;
        height?: number;
      };
      if (!Array.isArray(parsed.slides) || !parsed.slides.length) {
        message.error(getLL().editor.import.failed());
        return false;
      }
      importJob.setTotal(parsed.slides.length, gen);
      await importJob.tick(0.82, parsed.slides.length + 1, gen);
      await applyImportedSlides(parsed.slides, apply.apply, {
        theme: parsed.theme || {},
        title: parsed.title,
        aspectRatio: getAspectRatio(parsed.width || 0, parsed.height || 0),
        width: parsed.width,
        turningMode: apply.turningMode,
        defaultTurningMode: apply.defaultTurningMode,
      });
      await importJob.tick(1, parsed.slides.length + 1, gen);
      return true;
    } catch (error) {
      failImport(error, getLL().common.fileParseError());
      return false;
    } finally {
      importJob.finish(gen);
    }
  };
  const importJSON = (files: FileList | File[], options: boolean | ImportApplyOptions = {}) => {
    return importTextDeck(files, options, text => JSON.parse(text));
  };
  const importSpecificFile = (files: FileList | File[], options: boolean | ImportApplyOptions = {}) => {
    return importTextDeck(files, options, text => JSON.parse(decrypt(text)));
  };
  const rotateLine = (line: PPTLineElement, angleDeg: number) => {
    const {
      start,
      end
    } = line;
    const angleRad = angleDeg * Math.PI / 180;
    const midX = (start[0] + end[0]) / 2;
    const midY = (start[1] + end[1]) / 2;
    const startTransX = start[0] - midX;
    const startTransY = start[1] - midY;
    const endTransX = end[0] - midX;
    const endTransY = end[1] - midY;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const startRotX = startTransX * cosA - startTransY * sinA;
    const startRotY = startTransX * sinA + startTransY * cosA;
    const endRotX = endTransX * cosA - endTransY * sinA;
    const endRotY = endTransX * sinA + endTransY * cosA;
    const startNewX = startRotX + midX;
    const startNewY = startRotY + midY;
    const endNewX = endRotX + midX;
    const endNewY = endRotY + midY;
    const beforeMinX = Math.min(start[0], end[0]);
    const beforeMinY = Math.min(start[1], end[1]);
    const afterMinX = Math.min(startNewX, endNewX);
    const afterMinY = Math.min(startNewY, endNewY);
    const startAdjustedX = startNewX - afterMinX;
    const startAdjustedY = startNewY - afterMinY;
    const endAdjustedX = endNewX - afterMinX;
    const endAdjustedY = endNewY - afterMinY;
    const startAdjusted: [number, number] = [startAdjustedX, startAdjustedY];
    const endAdjusted: [number, number] = [endAdjustedX, endAdjustedY];
    const offset = [afterMinX - beforeMinX, afterMinY - beforeMinY];
    return {
      start: startAdjusted,
      end: endAdjusted,
      offset
    };
  };
  const parseLineEnd = (lineEnd?: {
    type?: string;
  }): LinePoint => {
    if (!lineEnd || !lineEnd.type || lineEnd.type === 'none') return '';
    if (['triangle', 'stealth', 'arrow'].includes(lineEnd.type)) return 'arrow';
    if (['diamond', 'oval'].includes(lineEnd.type)) return 'dot';
    return '';
  };
  const parseLineElement = (el: Shape, ratio: number) => {
    let start: [number, number] = [0, 0];
    let end: [number, number] = [0, 0];
    let rotateOffset: [number, number] = [0, 0];
    if (!el.isFlipV && !el.isFlipH) {
      start = [0, 0];
      end = [el.width, el.height];
    } else if (el.isFlipV && el.isFlipH) {
      start = [el.width, el.height];
      end = [0, 0];
    } else if (el.isFlipV && !el.isFlipH) {
      start = [0, el.height];
      end = [el.width, 0];
    } else {
      start = [el.width, 0];
      end = [0, el.height];
    }
    const data: PPTLineElement = {
      type: 'line',
      id: nanoid(10),
      width: +((el.borderWidth || 1) * ratio).toFixed(2),
      left: el.left,
      top: el.top,
      start,
      end,
      style: el.borderType,
      color: pptxBorderColorToString(el.borderColor) || '#000000',
      points: [parseLineEnd(el.headEnd), parseLineEnd(el.tailEnd)]
    };
    if (el.rotate) {
      const {
        start,
        end,
        offset
      } = rotateLine(data, el.rotate);
      data.start = start;
      data.end = end;
      data.left = data.left + offset[0];
      data.top = data.top + offset[1];
      rotateOffset = [offset[0], offset[1]];
    }
    if (/bentConnector/.test(el.shapType)) {
      const setDefaultBroken2 = () => {
        data.broken2 = [Math.abs(data.start[0] - data.end[0]) / 2, Math.abs(data.start[1] - data.end[1]) / 2];
      };
      const getPathPoints = (maxLength: number) => {
        if (!el.path) return [];
        return toPoints(el.path).map(point => {
          if (!('x' in point) || !('y' in point)) return null;
          if (typeof point.x !== 'number' || typeof point.y !== 'number') return null;
          let x = el.pathViewBox?.width ? point.x / el.pathViewBox.width * el.width : point.x * ratio;
          let y = el.pathViewBox?.height ? point.y / el.pathViewBox.height * el.height : point.y * ratio;
          if (el.isFlipH) x = el.width - x;
          if (el.isFlipV) y = el.height - y;
          if (el.rotate) {
            const angleRad = el.rotate * Math.PI / 180;
            const midX = (start[0] + end[0]) / 2;
            const midY = (start[1] + end[1]) / 2;
            const xTrans = x - midX;
            const yTrans = y - midY;
            const xRot = xTrans * Math.cos(angleRad) - yTrans * Math.sin(angleRad) + midX;
            const yRot = xTrans * Math.sin(angleRad) + yTrans * Math.cos(angleRad) + midY;
            const beforeMinX = Math.min(start[0], end[0]);
            const beforeMinY = Math.min(start[1], end[1]);
            x = xRot - beforeMinX - rotateOffset[0];
            y = yRot - beforeMinY - rotateOffset[1];
          }
          return [x, y];
        }).filter((point): point is [number, number] => !!point).slice(0, maxLength);
      };
      if (el.shapType === 'bentConnector2') {
        const pathPoints = getPathPoints(3);
        if (pathPoints.length >= 3 && pathPoints.every(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))) {
          const deltaX = Math.abs(pathPoints[1][0] - pathPoints[0][0]);
          const deltaY = Math.abs(pathPoints[1][1] - pathPoints[0][1]);
          data.broken = deltaX >= deltaY ? [data.start[0], data.end[1]] : [data.end[0], data.start[1]];
        } else data.broken = [data.start[0], data.end[1]];
      } else if (el.shapType === 'bentConnector3') {
        const pathPoints = getPathPoints(4);
        if (pathPoints.length >= 4 && pathPoints.every(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))) {
          const mid1 = pathPoints[1];
          const mid2 = pathPoints[2];
          const deltaX = Math.abs(pathPoints[1][0] - pathPoints[0][0]);
          const deltaY = Math.abs(pathPoints[1][1] - pathPoints[0][1]);
          data.broken2 = [(mid1[0] + mid2[0]) / 2, (mid1[1] + mid2[1]) / 2];
          data.broken2Direction = deltaX >= deltaY ? 'horizontal' : 'vertical';
        } else setDefaultBroken2();
      } else setDefaultBroken2();
    }
    if (/curvedConnector/.test(el.shapType)) {
      const cubic: [number, number] = [Math.abs(data.start[0] - data.end[0]) / 2, Math.abs(data.start[1] - data.end[1]) / 2];
      data.cubic = [cubic, cubic];
    }
    return data;
  };
  const flipGroupElements = (elements: BaseElement[], axis: 'x' | 'y') => {
    const minX = Math.min(...elements.map(el => el.left));
    const maxX = Math.max(...elements.map(el => el.left + el.width));
    const minY = Math.min(...elements.map(el => el.top));
    const maxY = Math.max(...elements.map(el => el.top + el.height));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return elements.map(element => {
      const newElement = {
        ...element
      };
      if (axis === 'y') newElement.left = 2 * centerX - element.left - element.width;
      if (axis === 'x') newElement.top = 2 * centerY - element.top - element.height;
      return newElement;
    });
  };
  const calculateRotatedPosition = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number, ak: number, bk 
  : number) => {
    const aRadians = ak * (Math.PI / 180);
    const aCos = Math.cos(aRadians);
    const aSin = Math.sin(aRadians);
    const aCenterX = ax + aw / 2;
    const aCenterY = ay + ah / 2;
    const corners = [{
      ox: bx,
      oy: by
    }, {
      ox: bx + bw,
      oy: by
    }, {
      ox: bx + bw,
      oy: by + bh
    }, {
      ox: bx,
      oy: by + bh
    }];
    let minX = Infinity;
    let minY = Infinity;
    for (const corner of corners) {
      const relativeX = corner.ox - aw / 2;
      const relativeY = corner.oy - ah / 2;
      const rotatedX = relativeX * aCos + relativeY * aSin;
      const rotatedY = -relativeX * aSin + relativeY * aCos;
      const graphicX = aCenterX + rotatedX;
      const graphicY = aCenterY + rotatedY;
      minX = Math.min(minX, graphicX);
      minY = Math.min(minY, graphicY);
    }
    const globalRotation = (bk + ak) % 360;
    return {
      x: minX,
      y: minY,
      globalRotation
    };
  };

  const importPPTXFile = async (files: FileList | File[], options?: ImportApplyOptions & {
    fixedViewport?: boolean;
    fixContrast?: boolean;
  }): Promise<boolean> => {
    const defaultOptions = {
      fixedViewport: false,
      fixContrast: false
    };
    const {
      fixedViewport,
      fixContrast,
      ...applyOptions
    } = {
      ...defaultOptions,
      ...options
    };
    const file = files[0];
    if (!file) return false;
    if (importJob.running.value) {
      message.warning(getLL().editor.import.busy());
      return false;
    }
    const apply = await decideImportApply(applyOptions);
    if (!apply) return false;
    const gen = beginImportJob(0);
    if (gen == null) return false;
    const theme = slidesState().theme;
    const shapeList: ShapePoolItem[] = [];
    for (const item of SHAPE_LIST) {
      shapeList.push(...item.children);
    }
    try {
      await importJob.tick(0, 0, gen);
      const arrayBuffer = await readFileAsArrayBuffer(file, ratio => {
        void importJob.tick(0.03 * ratio, 0, gen, { yieldPaint: false });
      });
      await importJob.tick(0.04, 0, gen);
      const {
        attachElementSource,
        bindImportedAnimations,
        buildLatexElementFromMath,
        extractPptxImportExtras,
        mapPptxtojsonAnimation,
        mapPptxTransitionToTurningMode,
        takeIdentityForGeometry,
        takeIdentityForObjectId
      } = await loadPptxImportFidelity();
      let json = null;
      try {
        json = await parse(arrayBuffer, {
          imageMode: 'base64',
          videoMode: 'blob',
          audioMode: 'blob'
        });
      } catch (error) {
        failImport(error, getLL().common.fileParseError());
        return false;
      }
      if (!json?.slides?.length) {
        message.error(getLL().common.fileParseError());
        return false;
      }
      await importJob.tick(0.08, 0, gen);
      let importExtras: Awaited<ReturnType<typeof extractPptxImportExtras>> | null = null;
      try {
        importExtras = await extractPptxImportExtras(arrayBuffer);
        retainSourcePackage(importExtras.packageId, arrayBuffer);
      } catch {
        importExtras = null;
      }
      if (json.usedFonts && json.usedFonts.length) loadGoogleFonts(json.usedFonts);

      if (json.slides.some(item => elementsContainOmmlMath(item.elements) || elementsContainOmmlMath(item.layoutElements) || elementsContainBareLatex(item.elements) || elementsContainBareLatex(item.layoutElements))) {
        try {
          await ensureMathliveReady();
        } catch {}
      }
      await importJob.tick(0.1, 0, gen);
      const width = json.size.width;
      const height = json.size.height;
      const targetViewportSize = fixedViewport ? 1000 : undefined;
      const ratio = getPPTXImportScale(width, targetViewportSize);
      const aspectRatio = getAspectRatio(width, height);
      const nextViewportSize = fixedViewport ? 1000 : width * ratio;
      const slideCount = json.slides.length;
      const SLIDE_START = 0.1;
      const SLIDE_END = 0.88;
      importJob.setTotal(slideCount, gen);
      const slides: Slide[] = [];
      const failedSlides: number[] = [];
      let flattenedLayoutElements = 0;
      let mathFallbackImages = 0;
      let unmappedTransitions = 0;
      for (const [slideIndex, item] of json.slides.entries()) {
        try {
          flattenedLayoutElements += item.layoutElements?.length || 0;
          const {
            type,
            value
          } = item.fill;
          let background: SlideBackground;
          if (type === 'image') {
            background = {
              type: 'image',
              image: {
                src: value.base64,
                size: 'cover'
              }
            };
          } else if (type === 'gradient') {
            background = {
              type: 'gradient',
              gradient: {
                type: value.path === 'line' ? 'linear' : 'radial',
                colors: value.colors.map(item => ({
                  ...item,
                  pos: parseInt(item.pos)
                })),
                rotate: value.rot
              }
            };
          } else if (type === 'pattern') {
            background = {
              type: 'solid',
              color: '#fff'
            };
          } else {
            background = {
              type: 'solid',
              color: value || '#fff'
            };
          }
          const slide: Slide = {
            id: nanoid(10),
            elements: [],
            background,
            remark: item.note || ''
          };
          if (importExtras?.packageId) slide.sourcePackageId = importExtras.packageId;
          const turningMode = mapPptxTransitionToTurningMode(item.transition);
          if (turningMode) slide.turningMode = turningMode;else if (item.transition?.type && item.transition.type !== 'none') unmappedTransitions += 1;
          const importedNotes = importExtras?.commentsBySlide.get(slideIndex);
          if (importedNotes?.length) slide.notes = importedNotes;
          const identityPool = importExtras?.identitiesBySlide.get(slideIndex)?.slice() || [];
          const spidToElId = new Map<string, string>();
          let currentSpid: string | undefined;
          const pushElement = <T extends PPTElement,>(element: T, originBox?: {
            left: number;
            top: number;
            width: number;
            height: number;
          }) => {
            if (importExtras?.packageId) {
              const identity = originBox && takeIdentityForGeometry(identityPool, originBox) || takeIdentityForObjectId(identityPool, currentSpid);
              if (identity) {
                attachElementSource(element, importExtras.packageId, identity);
              }
            }
            if (currentSpid) spidToElId.set(currentSpid, element.id);
            slide.elements.push(element);
          };
          const parseElements = (elements: Element[]) => {
            const sortedElements = elements.sort((a, b) => a.order - b.order);
            for (const el of sortedElements) {
              currentSpid = el.id != null && String(el.id) !== '' ? String(el.id) : undefined;
              let backstopSize = 1;
              if (el.type === 'shape') {
                if (el.shapType === 'line' || /straightConnector/.test(el.shapType) || /bentConnector/.test(el.shapType) || /curvedConnector/.test(el.shapType)) {
                  backstopSize = 0;
                }
              }
              const originWidth = el.width || backstopSize;
              const originHeight = el.height || backstopSize;
              const originLeft = el.left || 0;
              const originTop = el.top || 0;
              const originBox = {
                left: originLeft,
                top: originTop,
                width: originWidth,
                height: originHeight
              };
              el.width = originWidth * ratio;
              el.height = originHeight * ratio;
              el.left = originLeft * ratio;
              el.top = originTop * ratio;
              const picture = pptxPictureSource(el);
              const codeShape = (el.type === 'text' || el.type === 'shape') ? el : null;
              const codeTag = codeShape ? parseCodeShapeName(codeShape.name) : null;
              if (codeShape && codeTag) {
                const codeEl: PPTCodeElement = {
                  type: 'code',
                  id: nanoid(10),
                  width: codeShape.width,
                  height: codeShape.height,
                  left: codeShape.left,
                  top: codeShape.top,
                  rotate: codeShape.rotate,
                  code: importedCodeSource(codeShape.content, codeTag),
                  language: codeTag.language,
                  theme: codeTag.theme,
                  fontSize: importedCodeFontSize(codeShape.content, ratio),
                  showLineNumbers: codeTag.showLineNumbers
                };
                if (codeShape.link) codeEl.link = {
                  type: 'web',
                  target: codeShape.link
                };
                pushElement(codeEl, originBox);
              } else if (el.type === 'text') {
                const autoFitType = el.autoFit?.type;
                const isSelfAdaptive = autoFitType === 'shape';
                const textRatio = ratio;
                const metrics = importedParagraphMetrics(el.content, textRatio);
                const textEl: PPTTextElement = {
                  type: 'text',
                  id: nanoid(10),
                  width: el.width,
                  height: el.height,
                  left: el.left,
                  top: el.top,
                  rotate: el.rotate,
                  defaultFontName: theme.fontName,
                  defaultColor: theme.fontColor,
                  content: convertTextContent(el.content, textRatio),
                  lineHeight: 1,
                  outline: importOutlineFromPptx(el, ratio),
                  fill: el.fill?.type === 'color' ? el.fill.value : '',
                  vertical: el.isVertical
                };
                if (!isSelfAdaptive) {
                  textEl.fixedHeight = true;
                  textEl.vAlign = vAlignMap[el.vAlign] || 'top';
                }
                if (el.shadow) {
                  textEl.shadow = {
                    h: el.shadow.h * ratio,
                    v: el.shadow.v * ratio,
                    blur: el.shadow.blur * ratio,
                    color: el.shadow.color
                  };
                }
                if (el.link) textEl.link = {
                  type: 'web',
                  target: el.link
                };
                const inset = scalePptxTextInset(el.textInset, ratio);
                if (inset) textEl.inset = inset;
                if (metrics.lineHeight) textEl.lineHeight = metrics.lineHeight;
                if (metrics.margin) textEl.paragraphSpace = metrics.margin;
                const structuredText = htmlToStructuredText(textEl.content);
                if (structuredText) textEl.structuredText = structuredText;
                pushElement(textEl, originBox);
              } else if (picture) {
                const element: PPTImageElement = {
                  type: 'image',
                  id: nanoid(10),
                  src: picture.src,
                  width: el.width,
                  height: el.height,
                  left: el.left,
                  top: el.top,
                  fixedRatio: true,
                  rotate: picture.rotate || 0,
                  flipH: picture.isFlipH,
                  flipV: picture.isFlipV
                };
                if (picture.borderWidth) {
                  element.outline = importOutlineFromPptx(el, ratio);
                }
                const clip = pptxImageClip(picture.geom, picture.rect);
                if (clip) element.clip = clip;
                if (picture.link) element.link = {
                  type: 'web',
                  target: picture.link
                };
                pushElement(element, originBox);
              } else if (el.type === 'math') {
                const latexEl = buildLatexElementFromMath(el, {
                  color: theme.fontColor || '#333333'
                });
                if (latexEl) {
                  pushElement(latexEl, originBox);
                } else if (el.picBase64) {
                  mathFallbackImages += 1;
                  pushElement({
                    type: 'image',
                    id: nanoid(10),
                    src: el.picBase64,
                    width: el.width,
                    height: el.height,
                    left: el.left,
                    top: el.top,
                    fixedRatio: true,
                    rotate: 0
                  }, originBox);
                }
              } else if (el.type === 'audio' && el.blob) {
                pushElement({
                  type: 'audio',
                  id: nanoid(10),
                  src: el.blob,
                  width: el.width,
                  height: el.height,
                  left: el.left,
                  top: el.top,
                  rotate: 0,
                  fixedRatio: false,
                  color: theme.themeColors[0],
                  loop: false,
                  autoplay: false
                }, originBox);
              } else if (el.type === 'video' && el.blob) {
                pushElement({
                  type: 'video',
                  id: nanoid(10),
                  src: el.blob,
                  width: el.width,
                  height: el.height,
                  left: el.left,
                  top: el.top,
                  rotate: 0,
                  autoplay: false
                }, originBox);
              } else if (el.type === 'shape') {
                if (el.shapType === 'line' || /straightConnector/.test(el.shapType) || /bentConnector/.test(el.shapType) || /curvedConnector/.test(el.shapType)) {
                  const lineElement = parseLineElement(el, ratio);
                  pushElement(lineElement, originBox);
                } else {
                  const shape = shapeList.find(item => item.pptxShapeType === el.shapType);
                  const gradient: Gradient | undefined = el.fill?.type === 'gradient' ? {
                    type: el.fill.value.path === 'line' ? 'linear' : 'radial',
                    colors: el.fill.value.colors.map(item => ({
                      ...item,
                      pos: parseInt(item.pos)
                    })),
                    rotate: el.fill.value.rot
                  } : undefined;
                  const pattern: string | undefined = el.fill?.type === 'image' ? el.fill.value.base64 : undefined;
                  const fill = !el.strokeOnly && el.fill?.type === 'color' ? el.fill.value : '';
                  const metrics = importedParagraphMetrics(el.content, ratio);
                  const element: PPTShapeElement = {
                    type: 'shape',
                    id: nanoid(10),
                    width: el.width,
                    height: el.height,
                    left: el.left,
                    top: el.top,
                    viewBox: [200, 200],
                    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
                    fill,
                    gradient,
                    pattern,
                    fixedRatio: false,
                    rotate: el.rotate,
                    outline: importOutlineFromPptx(el, ratio, {
                      includeCornerRadius: false
                    }),
                    text: {
                      content: convertTextContent(el.content, ratio),
                      defaultFontName: theme.fontName,
                      defaultColor: theme.fontColor,
                      align: vAlignMap[el.vAlign] || 'middle'
                    },
                    flipH: el.isFlipH,
                    flipV: el.isFlipV
                  };
                  if (el.link) element.link = {
                    type: 'web',
                    target: el.link
                  };
                  const inset = scalePptxTextInset(el.textInset, ratio);
                  if (inset) element.text!.inset = inset;
                  if (metrics.lineHeight) element.text!.lineHeight = metrics.lineHeight;
                  if (metrics.margin) element.text!.paragraphSpace = metrics.margin;
                  if (el.shadow) {
                    element.shadow = {
                      h: el.shadow.h * ratio,
                      v: el.shadow.v * ratio,
                      blur: el.shadow.blur * ratio,
                      color: el.shadow.color
                    };
                  }
                  if (shape) {
                    element.path = shape.path;
                    element.viewBox = shape.viewBox;
                    if (shape.pathFormula) {
                      element.pathFormula = shape.pathFormula;
                      element.viewBox = [el.width, el.height];
                      const pathFormula = SHAPE_PATH_FORMULAS[shape.pathFormula];
                      if ('editable' in pathFormula && pathFormula.editable) {
                        let keypointValues = pathFormula.defaultValue;
                        if (el.keypoints) {
                          let keypoint = 0;
                          if (el.shapType === 'roundRect') {
                            const val = el.keypoints.adj === undefined ? 0.334 : el.keypoints.adj;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'snip1Rect') {
                            const val = el.keypoints.adj === undefined ? 0.334 : el.keypoints.adj;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'snip2SameRect') {
                            const val = el.keypoints.adj1 === undefined ? 0.334 : el.keypoints.adj1;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'snip2DiagRect') {
                            const val = el.keypoints.adj2 === undefined ? 0.334 : el.keypoints.adj2;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'snipRoundRect') {
                            const val1 = el.keypoints.adj1 === undefined ? 0.334 : el.keypoints.adj1;
                            const val2 = el.keypoints.adj2 === undefined ? 0.334 : el.keypoints.adj2;
                            keypoint = (val1 + val2) / 2 * 0.5;
                          }
                          if (el.shapType === 'round1Rect') {
                            const val = el.keypoints.adj === undefined ? 0.334 : el.keypoints.adj;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'round2SameRect') {
                            const val = el.keypoints.adj1 === undefined ? 0.334 : el.keypoints.adj1;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'round2DiagRect') {
                            const val = el.keypoints.adj1 === undefined ? 0.334 : el.keypoints.adj1;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'triangle') {
                            const val = el.keypoints.adj === undefined ? 1 : el.keypoints.adj;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'trapezoid') {
                            const val = el.keypoints.adj === undefined ? 0.5 : el.keypoints.adj;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'frame') {
                            const val = el.keypoints.adj1 === undefined ? 0.25 : el.keypoints.adj1;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'corner') {
                            const val1 = el.keypoints.adj1 === undefined ? 1 : el.keypoints.adj1;
                            const val2 = el.keypoints.adj2 === undefined ? 1 : el.keypoints.adj2;
                            keypoint = (val1 + val2) / 2 * 0.5;
                          }
                          if (el.shapType === 'diagStripe') {
                            const val = el.keypoints.adj === undefined ? 1 : el.keypoints.adj;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'donut') {
                            const val = el.keypoints.adj === undefined ? 0.5 : el.keypoints.adj;
                            keypoint = val * 0.5;
                          }
                          if (el.shapType === 'plus') {
                            const val = el.keypoints.adj === undefined ? 0.5 : el.keypoints.adj;
                            keypoint = 1 - val;
                          }
                          if (pathFormula.range && keypoint < pathFormula.range[0][0]) keypoint = pathFormula.range[0][0];
                          if (pathFormula.range && keypoint > pathFormula.range[0][1]) keypoint = pathFormula.range[0][1];
                          keypointValues = [keypoint];
                        }
                        element.path = pathFormula.formula(el.width, el.height, keypointValues);
                        element.keypoints = keypointValues;
                      } else element.path = pathFormula.formula(el.width, el.height);
                    }
                  } else if (el.path && el.path.indexOf('NaN') === -1) {
                    element.path = el.path;
                    const fixedViewBoxPresetShapeTypes = ['blockArc', 'pie', 'pieWedge', 'arc', 'chord', 'teardrop', 'mathPlus', 'mathMinus', 'mathMultiply', 'mathDivide', 'mathEqual', 'mathNotEqual'];
                    if (fixedViewBoxPresetShapeTypes.includes(el.shapType) && el.pathViewBox) {
                      element.viewBox = [el.pathViewBox.width, el.pathViewBox.height];
                    } else {
                      const {
                        maxX,
                        maxY
                      } = getSvgPathRange(el.path);
                      if (maxX / maxY > originWidth / originHeight) {
                        element.viewBox = [maxX, maxX * originHeight / originWidth];
                      } else {
                        element.viewBox = [maxY * originWidth / originHeight, maxY];
                      }
                    }
                  }
                  if (el.shapType === 'custom') {
                    if (el.path!.indexOf('NaN') !== -1) {
                      if (element.width === 0) element.width = 0.1;
                      if (element.height === 0) element.height = 0.1;
                      element.path = el.path!.replace(/NaN/g, '0');
                    } else {
                      element.path = el.path!;
                    }
                    const {
                      maxX,
                      maxY
                    } = getSvgPathRange(element.path);
                    if (maxX / maxY > originWidth / originHeight) {
                      element.viewBox = [maxX, maxX * originHeight / originWidth];
                    } else {
                      element.viewBox = [maxY * originWidth / originHeight, maxY];
                    }
                  }
                  if (element.path && element.viewBox[0] && element.viewBox[1]) pushElement(element, originBox);
                }
              } else if (el.type === 'table') {
                const row = el.data.length;
                const col = el.data[0].length;
                const style: TableCellStyle = {
                  fontname: theme.fontName,
                  color: theme.fontColor
                };
                const data: TableCell[][] = [];
                for (let i = 0; i < row; i++) {
                  const rowCells: TableCell[] = [];
                  for (let j = 0; j < col; j++) {
                    const cellData = el.data[i][j];
                    let textDiv: HTMLDivElement | null = document.createElement('div');
                    textDiv.innerHTML = cellData.text;
                    for (const mathSpan of Array.from(textDiv.querySelectorAll('span.omml-math'))) {
                      const latex = normalizeImportedLatex(
                        (mathSpan.getAttribute('data-latex') || mathSpan.textContent || '').trim()
                      );
                      mathSpan.replaceWith(document.createTextNode(latex ? `$${latex}$` : ''));
                    }
                    const p = textDiv.querySelector('p');
                    const align = p?.style.textAlign || 'left';
                    const span = textDiv.querySelector('span');
                    const fontsize = span?.style.fontSize ? (parseInt(span?.style.fontSize) * ratio).toFixed(1) + 'px' : '';
                    const fontname = span?.style.fontFamily || '';
                    const color = span?.style.color || cellData.fontColor;
                    const fontWeight = span?.style.fontWeight || '';
                    const bold = fontWeight === 'bold' || +fontWeight >= 600 || cellData.fontBold;
                    const em = span?.style.fontStyle === 'italic';
                    const textDecoration = span?.style.textDecoration || '';
                    const underline = textDecoration.includes('underline');
                    const strikethrough = textDecoration.includes('line-through');
                    rowCells.push({
                      id: nanoid(10),
                      colspan: cellData.colSpan || 1,
                      rowspan: cellData.rowSpan || 1,
                      text: textDiv.innerText,
                      style: {
                        ...style,
                        vAlign: vAlignMap[cellData.vAlign] || 'middle',
                        align: ['left', 'right', 'center'].includes(align) ? align as 'left' | 'right' | 'center' : 'left',
                        fontsize,
                        fontname,
                        color,
                        bold,
                        em,
                        underline,
                        strikethrough,
                        backcolor: cellData.fillColor
                      }
                    });
                    textDiv = null;
                  }
                  data.push(rowCells);
                }
                const allWidth = el.colWidths.reduce((a, b) => a + b, 0);
                const colWidths: number[] = el.colWidths.map(item => item / allWidth);
                const isVisibleBorder = (b?: {
                  borderColor?: PptxBorderColor;
                  borderWidth?: number;
                }) => {
                  if (!b || !b.borderWidth) return false;
                  const c = pptxBorderColorToString(b.borderColor) || '';
                  if (c === 'transparent') return false;
                  if (/^#[0-9a-fA-F]{8}$/.test(c) && c.slice(-2).toLowerCase() === '00') return false;
                  return true;
                };
                const borderCounter = new Map<string, {
                  border: any;
                  count: number;
                }>();
                const collectBorders = (borders?: Record<string, any>) => {
                  if (!borders) return;
                  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
                    const b = borders[side];
                    if (!isVisibleBorder(b)) continue;
                    const key = `${pptxBorderColorToString(b.borderColor)}|${b.borderWidth}|${b.borderType}`;
                    const hit = borderCounter.get(key);
                    if (hit) hit.count++;else borderCounter.set(key, {
                      border: b,
                      count: 1
                    });
                  }
                };
                collectBorders(el.borders);
                for (const rowCells of el.data) {
                  for (const cell of rowCells) collectBorders(cell.borders);
                }
                const border = [...borderCounter.values()].sort((a, b) => b.count - a.count)[0]?.border;
                const borderWidth = border?.borderWidth || 0;
                const borderStyle = border?.borderType || 'solid';
                const borderColor = pptxBorderColorToString(border?.borderColor) || '#eeece1';
                pushElement({
                  type: 'table',
                  id: nanoid(10),
                  width: el.width,
                  height: el.height,
                  left: el.left,
                  top: el.top,
                  colWidths,
                  rotate: 0,
                  data,
                  outline: {
                    width: +(borderWidth * ratio || 2).toFixed(2),
                    style: borderStyle,
                    color: borderColor
                  },
                  cellMinHeight: el.rowHeights[0] ? el.rowHeights[0] * ratio : 36
                }, originBox);
              } else if (el.type === 'chart') {
                let labels: string[];
                let legends: string[];
                let series: number[][];
                if (el.chartType === 'scatterChart' || el.chartType === 'bubbleChart') {
                  labels = el.data[0].map((item, index) => getLL().editor.import.chartCoordinate({
                    index: index + 1
                  }));
                  legends = el.data.map((item, index) => {
                    if (index === 0) return 'X';
                    if (index === 1) return 'Y';
                    return `Y${index}`;
                  });
                  series = el.data;
                } else {
                  const data = el.data as ChartItem[];
                  labels = Object.values(data[0].xlabels);
                  legends = data.map(item => item.key);
                  series = data.map(item => item.values.map(v => v.y));
                }
                const options: ChartOptions = {};
                let chartType: ChartType = 'bar';
                switch (el.chartType) {
                  case 'barChart':
                  case 'bar3DChart':
                    chartType = 'bar';
                    if (el.barDir === 'bar') chartType = 'column';
                    if (el.grouping === 'stacked' || el.grouping === 'percentStacked') options.stack = true;
                    break;
                  case 'lineChart':
                  case 'line3DChart':
                    if (el.grouping === 'stacked' || el.grouping === 'percentStacked') options.stack = true;
                    chartType = 'line';
                    break;
                  case 'areaChart':
                  case 'area3DChart':
                    if (el.grouping === 'stacked' || el.grouping === 'percentStacked') options.stack = true;
                    chartType = 'area';
                    break;
                  case 'scatterChart':
                  case 'bubbleChart':
                    chartType = 'scatter';
                    break;
                  case 'pieChart':
                  case 'pie3DChart':
                    chartType = 'pie';
                    break;
                  case 'radarChart':
                    chartType = 'radar';
                    break;
                  case 'doughnutChart':
                    chartType = 'ring';
                    break;
                  default:
                }
                pushElement({
                  type: 'chart',
                  id: nanoid(10),
                  chartType: chartType,
                  width: el.width,
                  height: el.height,
                  left: el.left,
                  top: el.top,
                  rotate: 0,
                  themeColors: el.colors.length ? el.colors : theme.themeColors,
                  textColor: resolveChartLabelColor({
                    textColor: theme.fontColor
                  }, {
                    background,
                    fallbackSurface: theme.backgroundColor,
                    fontColor: theme.fontColor
                  }),
                  data: {
                    labels,
                    legends,
                    series
                  },
                  options
                }, originBox);
              } else if (el.type === 'group') {
                let elements: BaseElement[] = el.elements.map(_el => {
                  let left = _el.left + originLeft;
                  let top = _el.top + originTop;
                  let rotate = 0;
                  if ('rotate' in _el) rotate = _el.rotate;
                  if (el.rotate) {
                    const {
                      x,
                      y,
                      globalRotation
                    } = calculateRotatedPosition(originLeft, originTop, originWidth, originHeight, _el.left, _el.top, _el.width, _el.height, el.rotate, rotate);
                    left = x;
                    top = y;
                    rotate = globalRotation;
                  }
                  const element = {
                    ..._el,
                    left,
                    top
                  };
                  if (el.isFlipH && 'isFlipH' in element) element.isFlipH = true;
                  if (el.isFlipV && 'isFlipV' in element) element.isFlipV = true;
                  if ('rotate' in element && el.rotate) element.rotate = rotate;
                  return element;
                });
                if (el.isFlipH) elements = flipGroupElements(elements, 'y');
                if (el.isFlipV) elements = flipGroupElements(elements, 'x');
                parseElements(elements);
              } else if (el.type === 'diagram') {
                const elements = el.elements.map(_el => ({
                  ..._el,
                  left: _el.left + originLeft,
                  top: _el.top + originTop
                }));
                parseElements(elements);
              }
            }
          };
          parseElements([...item.elements, ...item.layoutElements]);
          const jsonAnims = (item as {
            animations?: Array<{
              spid: string;
              trigger: string;
              class: string;
              presetId: number;
              presetSubtype?: number;
              duration: number;
              delay?: number;
              filter?: string;
            }>;
          }).animations;
          const importedAnims = jsonAnims?.length ? jsonAnims.map(mapPptxtojsonAnimation).filter((anim): anim is NonNullable<typeof anim> => !!anim) : importExtras?.animationsBySlide.get(slideIndex) || [];
          if (importedAnims.length) {
            const bound = bindImportedAnimations(importedAnims, slide.elements, spidToElId);
            if (bound.length) slide.animations = bound;
          }
          slides.push(slide);
          startInternSlideMedia(slide);
        } catch (error) {
          failedSlides.push(slideIndex + 1);
          console.error(`[pptx-import] slide ${slideIndex + 1} failed`, error);
        }
        await importJob.tick(slideJobProgress(slideIndex, slideCount, SLIDE_START, SLIDE_END), slideIndex + 1, gen);
      }
      if (!slides.length) {
        message.error(getLL().editor.import.failed());
        return false;
      }

      if (fixContrast) {
        const viewport = {
          width: nextViewportSize,
          height: nextViewportSize * aspectRatio
        };
        let contrastFixes = 0;
        for (const [index, slide] of slides.entries()) {
          try {
            const images = await sampleImagePaintsForSlide(slide, viewport);
            contrastFixes += fixSlideTextContrast(slide, {
              backgroundColor: theme.backgroundColor,
              fontColor: theme.fontColor
            }, images ? {
              images
            } : undefined);
          } catch (error) {
            console.error(`[pptx-import] contrast repair failed on slide ${index + 1}`, error);
          }
          await importJob.tick(0.88 + (index + 1) / slides.length * 0.08, slideCount, gen);
        }
        if (contrastFixes) markSourcePackageDirty();
        if (contrastFixes && import.meta.env.DEV) {
          // oxlint-disable-next-line no-console
          console.info(`[pptx-import] repaired ${contrastFixes} low-contrast text color(s)`);
        }
      }
      const diagnostics = buildImportDiagnosticsReport({
        slides,
        packageId: importExtras?.packageId,
        flattenedLayoutElements,
        mathFallbackImages,
        unmappedTransitions
      });
      setLastImportDiagnostics(diagnostics);
      if (import.meta.env.DEV) {
        // oxlint-disable-next-line no-console
        console.info('[pptx-import]', diagnostics.status, diagnostics.summary, diagnostics);
      }
      await importJob.tick(0.96, slideCount + 1, gen);
      slidesState().setViewportSize(nextViewportSize);
      slidesState().setTheme({
        themeColors: json.themeColors
      });
      await applyImportedSlides(slides, apply.apply, {
        aspectRatio,
        turningMode: apply.turningMode,
        defaultTurningMode: apply.defaultTurningMode,
      });
      await importJob.tick(1, slideCount + 1, gen);
      if (failedSlides.length) {
        message.warning(`${getLL().editor.import.partial()} (${failedSlides.length})`);
      }
      return true;
    } catch (error) {
      failImport(error, getLL().editor.import.failed());
      return false;
    } finally {
      importJob.finish(gen);
    }
  };
  return {
    importSpecificFile,
    importJSON,
    importPPTXFile,
  };
}

const subscribeImportJob = (onChange: () => void) => importJob.subscribe(onChange)
const getImportJobSnapshot = () => (
  `${Number(importJob.running.value)}:${importJob.progress.value}:${importJob.current.value}:${importJob.total.value}`
)

export default function useImport() {
  const snapshot = useSyncExternalStore(subscribeImportJob, getImportJobSnapshot, getImportJobSnapshot)
  const [running, progress, current, total] = snapshot.split(':')
  return {
    ...getImportApi(),
    importing: running === '1',
    importProgress: Number(progress) || 0,
    importSlide: Number(current) || 0,
    importSlideTotal: Number(total) || 0,
  };
}
