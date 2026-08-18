import { nanoid } from 'nanoid';
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store';
import { drainCommitQueue } from '@/utils/commitQueue';
import { getImageSize } from '@/utils/image';
import { internMediaSrc } from '@/utils/mediaIntern';
import { queryFika } from '@/utils/portal';
import { focusElementEditor } from '@/utils/canvasHitTest';
import { resolveChartSeriesColors, resolveElementDefaultFontColor, resolveSlideSurfaceColors } from '@/utils/textContrast';
import type { PPTLineElement, PPTElement, PPTImageElement, PPTLatexElement, PPTCodeElement, TableCell, TableCellStyle, PPTShapeElement, ChartType, PPTVideoElement, PPTAudioElement } from '@/types/slides';
import type { FikaMediaKind, FikaMediaUploadResult } from '@/configs/mediaUpload';
import { layoutMediaBoxes, DEFAULT_VIDEO_SIZE, DEFAULT_AUDIO_SIZE, type MediaBox } from '@/utils/mediaLayout';
import { hfmath } from '@/components/LaTeXEditor/hfmath';
import { type ShapePoolItem, SHAPE_PATH_FORMULAS } from '@/configs/shapes';
import type { LinePoolItem } from '@/configs/lines';
import { getChartDefaultData } from '@/configs/chart';
import { DEFAULT_TABLE_CELL_MIN_HEIGHT, DEFAULT_TABLE_CELL_WIDTH, DEFAULT_TABLE_OUTLINE, DEFAULT_TABLE_THEME, TABLE_ON_INK } from '@/configs/table';
import { DEFAULT_CODE_FONT_SIZE, DEFAULT_CODE_LANGUAGE, DEFAULT_CODE_SAMPLE, DEFAULT_CODE_THEME, measureCodeElementSize, type CodeEditorPayload } from '@/configs/code';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
interface CommonElementPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}
interface LineElementPosition {
  top: number;
  left: number;
  start: [number, number];
  end: [number, number];
}
interface CreateTextData {
  content?: string;
  vertical?: boolean;
}
let pendingCreatedTextId: string | null = null;
export function takePendingCreatedTextId() {
  const id = pendingCreatedTextId;
  pendingCreatedTextId = null;
  return id;
}
const getSlideEnv = () => {
  const slides = useSlidesStore.getState();
  return {
    theme: slides.theme,
    viewportRatio: slides.viewportRatio,
    viewportSize: slides.viewportSize,
    currentSlide: selectCurrentSlide(slides),
    addElement: slides.addElement
  };
};
export default () => {
  const {
    addHistorySnapshot
  } = useHistorySnapshot();
  const defaultFontColor = () => {
    const { theme, currentSlide } = getSlideEnv();
    return resolveElementDefaultFontColor(theme.fontColor, {
      background: currentSlide?.background,
      fallbackSurface: theme.backgroundColor
    });
  };
  const fitImageToViewport = (width: number, height: number) => {
    const { viewportRatio, viewportSize } = getSlideEnv();
    const scale = height / width;
    if (scale < viewportRatio && width > viewportSize) {
      width = viewportSize;
      height = width * scale;
    } else if (height > viewportSize * viewportRatio) {
      height = viewportSize * viewportRatio;
      width = height / scale;
    }
    return {
      width,
      height
    };
  };
  const probeImageSize = (src: string) => {
    return Promise.race([getImageSize(src), new Promise<{
      width: number;
      height: number;
    }>(resolve => {
      setTimeout(() => resolve({
        width: 400,
        height: 300
      }), 8000);
    })]);
  };
  const commitElements = (elements: PPTElement[]) => {
    if (!elements.length) return;
    drainCommitQueue();
    const main = useMainStore.getState();
    getSlideEnv().addElement(elements);
    main.setActiveElementIdList([elements[elements.length - 1].id]);
    if (main.creatingElement) main.setCreatingElement(null);
    setTimeout(() => {
      main.setEditorareaFocus(true);
    }, 0);
    addHistorySnapshot();
  };

  const createElement = (element: PPTElement, callback?: () => void) => {
    drainCommitQueue();
    const main = useMainStore.getState();
    getSlideEnv().addElement(element);
    main.setActiveElementIdList([element.id]);
    if (main.creatingElement) main.setCreatingElement(null);
    setTimeout(() => {
      main.setEditorareaFocus(true);
    }, 0);
    if (callback) callback();
    addHistorySnapshot();
  };

  /**
   * Create image element
   * @param src Image address
   */
  const createImageElement = (src: string) => {
    // Warm the blob alias for fast painting, but persist the durable src:
    // blob: URLs die with the session and must never enter the document.
    internMediaSrc(src).then(interned => probeImageSize(interned).then(({
      width,
      height
    }) => {
      const { viewportRatio, viewportSize } = getSlideEnv();
      const size = fitImageToViewport(width, height);
      createElement({
        type: 'image',
        id: nanoid(10),
        src,
        width: size.width,
        height: size.height,
        left: (viewportSize - size.width) / 2,
        top: (viewportSize * viewportRatio - size.height) / 2,
        fixedRatio: true,
        rotate: 0
      });
    }));
  };
  const createMediaElements = async (items: Array<FikaMediaUploadResult & {
    kind: FikaMediaKind;
  }>) => {
    if (!items.length) return;
    // Warm blob aliases for painting/probing; elements keep the durable src.
    const internedItems = await Promise.all(items.map(async item => ({
      ...item,
      interned: await internMediaSrc(item.src),
    })));
    const { theme, viewportRatio, viewportSize } = getSlideEnv();
    const canvasWidth = viewportSize;
    const canvasHeight = viewportSize * viewportRatio;
    const naturalBoxes: MediaBox[] = [];
    for (const item of internedItems) {
      if (item.kind === 'image') {
        const probed = await probeImageSize(item.interned);
        naturalBoxes.push(items.length === 1 ? fitImageToViewport(probed.width, probed.height) : probed);
      } else if (item.kind === 'video') {
        naturalBoxes.push({
          ...DEFAULT_VIDEO_SIZE
        });
      } else {
        naturalBoxes.push({
          ...DEFAULT_AUDIO_SIZE
        });
      }
    }
    const placements = layoutMediaBoxes(naturalBoxes, canvasWidth, canvasHeight);
    const elements: PPTElement[] = [];
    for (const [index, item] of internedItems.entries()) {
      const place = placements[index];
      if (item.kind === 'image') {
        const image: PPTImageElement = {
          type: 'image',
          id: nanoid(10),
          src: item.src,
          width: place.width,
          height: place.height,
          left: place.left,
          top: place.top,
          fixedRatio: true,
          rotate: 0
        };
        elements.push(image);
      } else if (item.kind === 'video') {
        const video: PPTVideoElement = {
          type: 'video',
          id: nanoid(10),
          width: place.width,
          height: place.height,
          rotate: 0,
          left: place.left,
          top: place.top,
          src: item.src,
          autoplay: false
        };
        if (item.ext) video.ext = item.ext;
        elements.push(video);
      } else {
        const audio: PPTAudioElement = {
          type: 'audio',
          id: nanoid(10),
          width: place.width,
          height: place.height,
          rotate: 0,
          left: place.left,
          top: place.top,
          loop: false,
          autoplay: false,
          fixedRatio: false,
          color: theme.themeColors[0],
          src: item.src
        };
        if (item.ext) audio.ext = item.ext;
        elements.push(audio);
      }
    }
    commitElements(elements);
  };

  /**
   * Create chart element
   * @param chartType Chart type
   */
  const createChartElement = (type: ChartType) => {
    const { theme, currentSlide } = getSlideEnv();
    createElement({
      type: 'chart',
      id: nanoid(10),
      chartType: type,
      left: 300,
      top: 81.25,
      width: 400,
      height: 400,
      rotate: 0,
      themeColors: resolveChartSeriesColors(
        theme.themeColors,
        resolveSlideSurfaceColors(currentSlide?.background, theme.backgroundColor),
      ),
      textColor: defaultFontColor(),
      data: getChartDefaultData()[type]
    });
  };

  /**
   * Create table element
   * @param row Number of rows
   * @param col Number of columns
   */
  const createTableElement = (row: number, col: number) => {
    const { theme, viewportRatio, viewportSize } = getSlideEnv();
    const style: TableCellStyle = {
      fontname: theme.fontName,
      color: theme.fontColor
    };
    const data: TableCell[][] = [];
    for (let i = 0; i < row; i++) {
      const rowStyle: TableCellStyle = i === 0 ? {
        ...style,
        bold: true,
        color: TABLE_ON_INK
      } : style;
      const rowCells: TableCell[] = [];
      for (let j = 0; j < col; j++) {
        rowCells.push({
          id: nanoid(10),
          colspan: 1,
          rowspan: 1,
          text: '',
          style: rowStyle
        });
      }
      data.push(rowCells);
    }
    const colWidths: number[] = new Array(col).fill(1 / col);
    const width = col * DEFAULT_TABLE_CELL_WIDTH;
    const height = row * DEFAULT_TABLE_CELL_MIN_HEIGHT;
    createElement({
      type: 'table',
      id: nanoid(10),
      width,
      height,
      colWidths,
      rotate: 0,
      data,
      left: (viewportSize - width) / 2,
      top: (viewportSize * viewportRatio - height) / 2,
      outline: {
        ...DEFAULT_TABLE_OUTLINE
      },
      theme: {
        ...DEFAULT_TABLE_THEME
      },
      cellMinHeight: DEFAULT_TABLE_CELL_MIN_HEIGHT
    });
  };

  /**
   * Create text element
   * @param position Position size information
   * @param content Text content
   */
  const createTextElement = (position: CommonElementPosition, data?: CreateTextData) => {
    const {
      left,
      top,
      width,
      height
    } = position;
    const content = data?.content || '';
    const vertical = data?.vertical || false;
    const id = nanoid(10);
    const slides = useSlidesStore.getState();
    const slide = selectCurrentSlide(slides);
    const defaultColor = resolveElementDefaultFontColor(slides.theme.fontColor, {
      background: slide?.background,
      fallbackSurface: slides.theme.backgroundColor
    });
    createElement({
      type: 'text',
      id,
      left,
      top,
      width,
      height,
      content,
      rotate: 0,
      defaultFontName: slides.theme.fontName,
      defaultColor,
      vertical
    }, () => {
      pendingCreatedTextId = id;
      const main = useMainStore.getState();
      main.setEditingElementId(id);
      main.setDisableHotkeysState(true);
      setTimeout(() => {
        focusElementEditor(id);
        const editorRef = queryFika<HTMLElement>(`#editable-element-${id} .ProseMirror`);
        if (editorRef) editorRef.focus();
      }, 0);
    });
  };

  /**
   * Create shape element
   * @param position Position size information
   * @param data Shape path information
   */
  const createShapeElement = (position: CommonElementPosition, data: ShapePoolItem, supplement: Partial<PPTShapeElement> = {}) => {
    const { theme } = getSlideEnv();
    const {
      left,
      top,
      width,
      height
    } = position;
    const newElement: PPTShapeElement = {
      type: 'shape',
      id: nanoid(10),
      left,
      top,
      width,
      height,
      viewBox: data.viewBox,
      path: data.path,
      fill: theme.themeColors[0],
      fixedRatio: false,
      rotate: 0,
      ...supplement
    };
    if (data.withborder) newElement.outline = theme.outline;
    if (data.special) newElement.special = true;
    if (data.pathFormula) {
      newElement.pathFormula = data.pathFormula;
      newElement.viewBox = [width, height];
      const pathFormula = SHAPE_PATH_FORMULAS[data.pathFormula];
      if ('editable' in pathFormula && pathFormula.editable) {
        newElement.path = pathFormula.formula(width, height, pathFormula.defaultValue!);
        newElement.keypoints = pathFormula.defaultValue;
      } else newElement.path = pathFormula.formula(width, height);
    }
    createElement(newElement);
  };

  /**
   * Create line element
   * @param position Position size information
   * @param data Line path and style
   */
  const createLineElement = (position: LineElementPosition, data: LinePoolItem) => {
    const { theme } = getSlideEnv();
    const {
      left,
      top,
      start,
      end
    } = position;
    const newElement: PPTLineElement = {
      type: 'line',
      id: nanoid(10),
      left,
      top,
      start,
      end,
      points: data.points,
      color: theme.themeColors[0],
      style: data.style,
      width: 2
    };
    if (data.isBroken) newElement.broken = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    if (data.isBroken2) newElement.broken2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    if (data.isCurve) newElement.curve = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    if (data.isCubic) newElement.cubic = [[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]];
    createElement(newElement);
  };

  /**
   * Create LaTeX element
   * @param svg SVG code
   */
  const createLatexElement = (data: {
    path: string;
    latex: string;
    w: number;
    h: number;
  }) => {
    const { viewportRatio, viewportSize } = getSlideEnv();
    createElement({
      type: 'latex',
      id: nanoid(10),
      width: data.w,
      height: data.h,
      rotate: 0,
      left: (viewportSize - data.w) / 2,
      top: (viewportSize * viewportRatio - data.h) / 2,
      path: data.path,
      latex: data.latex,
      color: defaultFontColor(),
      strokeWidth: 2,
      viewBox: [data.w, data.h],
      fixedRatio: true
    });
  };

  /** Create multiple LaTeX elements (e.g. from equation extractor), laid out in rows. */
  const createLatexElements = (dataList: {
    latex: string;
    w: number;
    h: number;
    path?: string;
  }[]) => {
    if (!dataList.length) return;
    const { viewportRatio, viewportSize } = getSlideEnv();
    const canvasWidth = viewportSize;
    const canvasHeight = viewportSize * viewportRatio;
    const padding = 40;
    const gap = 16;
    const availableWidth = Math.max(1, canvasWidth - padding * 2);
    const availableHeight = Math.max(1, canvasHeight - padding * 2);
    const sizedItems = dataList.map(data => {
      const scale = Math.min(1, availableWidth / data.w, availableHeight / data.h);
      const w = data.w * scale;
      const h = data.h * scale;
      let path = data.path;
      if (!path) {
        const eq = new hfmath(data.latex);
        path = eq.pathd({});
      }
      return {
        ...data,
        w,
        h,
        path
      };
    });
    const rows: {
      items: typeof sizedItems;
      width: number;
      height: number;
    }[] = [];
    for (const item of sizedItems) {
      const row = rows[rows.length - 1];
      if (!row || row.width + gap + item.w > availableWidth) {
        rows.push({
          items: [item],
          width: item.w,
          height: item.h
        });
      } else {
        row.items.push(item);
        row.width += gap + item.w;
        row.height = Math.max(row.height, item.h);
      }
    }
    const contentHeight = rows.reduce((height, row) => height + row.height, 0) + gap * Math.max(0, rows.length - 1);
    let top = contentHeight <= availableHeight ? (canvasHeight - contentHeight) / 2 : padding;
    const elements: PPTLatexElement[] = [];
    for (const row of rows) {
      let left = (canvasWidth - row.width) / 2;
      for (const item of row.items) {
        elements.push({
          type: 'latex',
          id: nanoid(10),
          width: item.w,
          height: item.h,
          rotate: 0,
          left,
          top: top + (row.height - item.h) / 2,
          path: item.path!,
          latex: item.latex,
          color: defaultFontColor(),
          strokeWidth: 2,
          viewBox: [item.w, item.h],
          fixedRatio: true
        });
        left += item.w + gap;
      }
      top += row.height + gap;
    }
    const main = useMainStore.getState();
    getSlideEnv().addElement(elements);
    main.setActiveElementIdList(elements.map(el => el.id));
    addHistorySnapshot();
  };
  const createMermaidElement = (code: string) => {
    const { viewportRatio, viewportSize } = getSlideEnv();
    const width = 500;
    const height = 300;
    createElement({
      type: 'mermaid',
      id: nanoid(10),
      width,
      height,
      rotate: 0,
      left: (viewportSize - width) / 2,
      top: (viewportSize * viewportRatio - height) / 2,
      code
    });
  };
  const createCodeElement = (data: CodeEditorPayload) => {
    const { viewportRatio, viewportSize } = getSlideEnv();
    const code = data.code || DEFAULT_CODE_SAMPLE;
    const fontSize = data.fontSize || DEFAULT_CODE_FONT_SIZE;
    const showLineNumbers = data.showLineNumbers ?? true;
    const {
      width,
      height
    } = measureCodeElementSize({
      code,
      fontSize,
      showLineNumbers
    });
    createElement({
      type: 'code',
      id: nanoid(10),
      width,
      height,
      rotate: 0,
      left: (viewportSize - width) / 2,
      top: (viewportSize * viewportRatio - height) / 2,
      code,
      language: data.language || DEFAULT_CODE_LANGUAGE,
      theme: data.theme || DEFAULT_CODE_THEME,
      fontSize,
      showLineNumbers
    } satisfies PPTCodeElement);
  };

  /**
   * Create video element
   * @param src Video address
   */
  const createVideoElement = (src: string, ext?: string) => {
    const { viewportRatio, viewportSize } = getSlideEnv();
    const newElement: PPTVideoElement = {
      type: 'video',
      id: nanoid(10),
      width: DEFAULT_VIDEO_SIZE.width,
      height: DEFAULT_VIDEO_SIZE.height,
      rotate: 0,
      left: (viewportSize - DEFAULT_VIDEO_SIZE.width) / 2,
      top: (viewportSize * viewportRatio - DEFAULT_VIDEO_SIZE.height) / 2,
      src,
      autoplay: false
    };
    if (ext) newElement.ext = ext;
    createElement(newElement);
  };

  /**
   * Create audio element
   * @param src Audio address
   */
  const createAudioElement = (src: string, ext?: string) => {
    const { theme, viewportRatio, viewportSize } = getSlideEnv();
    const newElement: PPTAudioElement = {
      type: 'audio',
      id: nanoid(10),
      width: DEFAULT_AUDIO_SIZE.width,
      height: DEFAULT_AUDIO_SIZE.height,
      rotate: 0,
      left: (viewportSize - DEFAULT_AUDIO_SIZE.width) / 2,
      top: (viewportSize * viewportRatio - DEFAULT_AUDIO_SIZE.height) / 2,
      loop: false,
      autoplay: false,
      fixedRatio: false,
      color: theme.themeColors[0],
      src
    };
    if (ext) newElement.ext = ext;
    createElement(newElement);
  };
  return {
    createImageElement,
    createChartElement,
    createTableElement,
    createTextElement,
    createShapeElement,
    createLineElement,
    createLatexElement,
    createLatexElements,
    createMermaidElement,
    createCodeElement,
    createVideoElement,
    createAudioElement,
    createMediaElements
  };
};
