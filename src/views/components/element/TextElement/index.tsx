import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useCallback, memo, useState, useEffect, useLayoutEffect, type CSSProperties, type ElementRef } from 'react';
import type { CSSPropertiesWithVars } from '@/types/css';
import { nativePointerEvent, type ReactPointerEvent } from '@/utils/canvasPointer';

import { openContextmenu } from '@/utils/openContextmenu';
import { debounce } from '@/utils/debounce';
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store';
import type { PPTTextElement, TextAlign, TextInset } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import useElementShadow from '@/views/components/element/hooks/useElementShadow';
import useTextFit from '@/views/components/element/hooks/useTextFit';
import { useOutlineRadiusCss } from '@/views/components/element/hooks/useElementOutline';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
import { resolveElementDefaultFontColor, resolveElementSurfaces, resolveLiveTextPaint, resolvePlaceholderColor } from '@/utils/textContrast';
import { computePlaceholderSlotHeight, resolveTextBoxLayout, shouldBlockPlaceholderHeightShrink, textBoxFlexColumn, textBoxJustify, textBoxLiveMode, textBoxPaintSize, type TextBoxLiveMode } from '@/utils/placeholderLayout';
import { isPlaceholderPromptFontSize } from '@/configs/textPresets';
import { isEmptyRichText, isListPlaceholder, placeholderBoxVars, placeholderPhase, placeholderSeed, repairFilledPlaceholderHtml } from '@/utils/placeholderPaint';
import type { EmptyPlaceholderStylePatch } from '@/utils/prosemirror/commands/applyPlaceholderStyles';
import ElementOutline from '@/views/components/element/ElementOutline';
import ProsemirrorEditor from '@/views/components/element/ProsemirrorEditor';
export type ITextElementProps = {
  elementInfo: PPTTextElement;
  selectElement: (e: MouseEvent | TouchEvent, element: PPTTextElement, canMove?: boolean) => void;
  contextmenus: () => ContextmenuItem[] | null;
  isEditing?: boolean;
  className?: string;
  style?: CSSProperties;
};
const readSlideTheme = () => {
  const state = useSlidesStore.getState();
  return {
    currentSlide: selectCurrentSlide(state),
    theme: state.theme
  };
};

const applyAutoHeightChrome = (id: string, height: number) => {
  const operate = document.getElementById(`operate-element-${id}`);
  if (!operate) return;
  const scale = useMainStore.getState().canvasScale;
  const scaleHeight = height * scale;
  operate.style.height = `${scaleHeight}px`;
  operate.style.transformOrigin = `${operate.offsetWidth / 2}px ${scaleHeight / 2}px`;
};
const TextElement = memo((props: ITextElementProps) => {
  const { elementInfo, contextmenus, isEditing, className, style } = props;
  const elementId = elementInfo.id;
  const isHandleElement = useMainStore(s => s.handleElementId === elementId);
  const isScaling = useMainStore(s => s.handleElementId === elementId && s.isScaling);
  const { addHistorySnapshot } = useHistorySnapshot();
  const { currentSlide, theme } = readSlideTheme();
  const painted = resolveLiveTextPaint(elementInfo.defaultColor || theme?.fontColor || '#333', elementInfo.content, {
    element: elementInfo,
    elements: currentSlide?.elements,
    fill: elementInfo.fill,
    background: currentSlide?.background,
    fallbackSurface: theme?.backgroundColor,
    themeFontColor: theme?.fontColor,
  });
  const elementSurfaces = resolveElementSurfaces({
    fill: elementInfo.fill,
    background: currentSlide?.background,
    fallbackSurface: theme?.backgroundColor
  });
  const defaultInkColor = painted.ink;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const prosemirrorEditorRef = useRef<ElementRef<typeof ProsemirrorEditor> | null>(null);
  const [editorFocused, setEditorFocused] = useState(false);
  const [placeholderTextEditing, setPlaceholderTextEditing] = useState(false);
  const liveContentRef = useRef<string | null>(null);
  const textFitHostRef = useRef<HTMLDivElement | null>(null);
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const inset: TextInset = elementInfo.inset || [10, 10, 10, 10];
  const { textFitPaintStyle, setLiveContent, resync: resyncTextFit } = useTextFit(elementInfo, liveContentRef, textFitHostRef);
  const outlineBorderRadius = useOutlineRadiusCss(elementInfo.outline, elementInfo.width, elementInfo.height);
  const [liveHtml, setLiveHtml] = useState(elementInfo.content);
  const editorEmpty = isEmptyRichText(liveHtml);
  const textBoxLayout = resolveTextBoxLayout(elementInfo, currentSlide?.type, editorEmpty);
  const paintSize = textBoxPaintSize(elementInfo, textBoxLayout);
  const contentBoxJustify = textBoxJustify(textBoxLayout);
  const useFlexColumn = textBoxFlexColumn(textBoxLayout);
  const liveMode = textBoxLiveMode(elementInfo, textBoxLayout);
  const elementInfoRef = useRef(elementInfo);
  elementInfoRef.current = elementInfo;
  const editorEmptyRef = useRef(editorEmpty);
  editorEmptyRef.current = editorEmpty;
  const editorFocusedRef = useRef(editorFocused);
  editorFocusedRef.current = editorFocused;
  const defaultInkColorRef = useRef(defaultInkColor);
  defaultInkColorRef.current = defaultInkColor;
  const textBoxLayoutRef = useRef(textBoxLayout);
  textBoxLayoutRef.current = textBoxLayout;
  useEffect(() => {
    if (editorFocused || isEditing || placeholderTextEditing) return;
    setLiveHtml(elementInfo.content);
    liveContentRef.current = isEmptyRichText(elementInfo.content) ? null : elementInfo.content;
  }, [elementInfo.content, editorFocused, isEditing, placeholderTextEditing]);
  const listPlaceholder = isListPlaceholder(elementInfo);
  const isEmptyPlaceholder = !!elementInfo.placeholder && editorEmpty;
  const editingActive = !!(isEditing || placeholderTextEditing);
  const isEditingEmpty = isEmptyPlaceholder && editingActive;
  const showPlaceholder = isEmptyPlaceholder && !editingActive;
  const seedPlaceholder = (info: PPTTextElement, empty: boolean) => {
    const phase = placeholderPhase(empty);
    if (phase === 'empty' && (!isEmptyRichText(info.content) || !editorEmptyRef.current)) return;
    prosemirrorEditorRef.current?.seedPlaceholderStyles(
      placeholderSeed(info, phase, defaultInkColorRef.current),
      phase,
    );
  };
  const applyPlaceholderPreset = useCallback(() => {
    const info = elementInfoRef.current;
    if (!info.placeholder) return;
    if (!isEmptyRichText(info.content) || !editorEmptyRef.current) return;
    Promise.resolve().then(() => {
      const next = elementInfoRef.current;
      if (!next.placeholder) return;
      if (!isEmptyRichText(next.content) || !editorEmptyRef.current) return;
      seedPlaceholder(next, true);
    });
  }, []);
  const handleEditorFocus = useCallback(() => {
    setEditorFocused(true);
    const info = elementInfoRef.current;
    if (info.placeholder && editorEmptyRef.current) {
      setPlaceholderTextEditing(true);
      applyPlaceholderPreset();
    }
  }, [applyPlaceholderPreset]);
  const handleEditorBlur = useCallback(() => {
    setEditorFocused(false);
  }, []);
  const placeholderColor = resolvePlaceholderColor({
    author: elementInfo.placeholderColor,
    surfaces: elementSurfaces
  });
  const placeholderTypography = placeholderBoxVars(elementInfo, isEmptyPlaceholder, placeholderColor);
  const emptySeed = placeholderSeed(elementInfo, placeholderPhase(isEmptyPlaceholder), defaultInkColor);
  const filledSeed = placeholderSeed(elementInfo, 'filled', defaultInkColor);
  const placeholderEditorDefaults = elementInfo.placeholder
    ? { defaultFontSize: filledSeed.fontSize, defaultAlign: filledSeed.align as TextAlign }
    : { defaultFontSize: undefined as string | undefined, defaultAlign: undefined as TextAlign | undefined };
  const [placeholderSeeded, setPlaceholderSeeded] = useState(false);
  const placeholderSeededRef = useRef(placeholderSeeded);
  placeholderSeededRef.current = placeholderSeeded;
  const seedPlaceholderContentStyles = useCallback(() => {
    const info = elementInfoRef.current;
    if (!info.placeholder || placeholderSeededRef.current) return;
    seedPlaceholder(info, false);
  }, []);
  const startEdit = useCallback(() => {
    const info = elementInfoRef.current;
    if (info.lock) return;
    setPlaceholderTextEditing(true);
    Promise.resolve().then(() => {
      const editor = prosemirrorEditorRef.current;
      if (!editor) return;
      if (info.placeholder && editorEmptyRef.current) seedPlaceholder(info, true);
      if (isListPlaceholder(info) && editorEmptyRef.current) editor.ensureBulletList();
      editor.focus();
    });
  }, []);
  const startEditRef = useRef(startEdit);
  startEditRef.current = startEdit;
  useLayoutEffect(() => {
    if (isEditing) startEditRef.current();
  }, [isEditing]);
  const handleEmptyChange = useCallback((empty: boolean) => {
    if (empty) {
      setPlaceholderSeeded(false);
      return;
    }
    setPlaceholderTextEditing(true);
    seedPlaceholderContentStyles();
    setPlaceholderSeeded(true);
  }, [seedPlaceholderContentStyles]);
  const handlePlaceholderStyle = useCallback((patch: EmptyPlaceholderStylePatch) => {
    const info = elementInfoRef.current;
    if (!info.placeholder || !editorEmptyRef.current) return;
    const next: Partial<PPTTextElement> = {
      placeholderBold: patch.placeholderBold || undefined,
      placeholderItalic: patch.placeholderItalic || undefined
    };
    if (patch.placeholderFontSize && !isPlaceholderPromptFontSize(info, patch.placeholderFontSize)) {
      next.placeholderFontSize = patch.placeholderFontSize;
    }
    if (patch.placeholderAlign) next.placeholderAlign = patch.placeholderAlign;
    if (patch.defaultFontName !== undefined) next.defaultFontName = patch.defaultFontName || '';
    if (patch.colorCleared) {
      const { currentSlide, theme } = readSlideTheme();
      next.defaultColor = resolveElementDefaultFontColor(theme?.fontColor || '#333', {
        fill: info.fill,
        background: currentSlide?.background,
        fallbackSurface: theme?.backgroundColor
      });
    } else if (patch.defaultColor) next.defaultColor = patch.defaultColor;
    const slot = computePlaceholderSlotHeight({ ...info, ...next });
    if (slot !== info.placeholderLayoutHeight) next.placeholderLayoutHeight = slot;
    useSlidesStore.getState().updateElement({
      id: info.id,
      props: next
    });
    addHistorySnapshot();
  }, [addHistorySnapshot]);

  const handleSelectElement = useCallback((e: ReactPointerEvent | MouseEvent | TouchEvent, canMove = true) => {
    const info = elementInfoRef.current;
    if (info.lock) return;
    e.stopPropagation();

    if (props.isEditing && !canMove) return;
    props.selectElement(nativePointerEvent(e), info, canMove);
  }, [props.isEditing, props.selectElement]);
  const handleSelectElementRef = useRef(handleSelectElement);
  handleSelectElementRef.current = handleSelectElement;
  const activatePlaceholder = useCallback((e: ReactPointerEvent) => {
    handleSelectElementRef.current(e, false);
    startEditRef.current();
  }, []);

  const realHeightCache = useRef(-1);
  const realWidthCache = useRef(-1);
  const prevLiveModeRef = useRef<TextBoxLiveMode | undefined>(undefined);
  useLayoutEffect(() => {
    const prev = prevLiveModeRef.current;
    prevLiveModeRef.current = liveMode;
    if (prev === undefined || prev === liveMode) return;
    resyncTextFit();
    if (useMainStore.getState().isGesturing) return;
    const info = elementInfoRef.current;
    if (info.vertical || !elementRef.current) return;
    if (liveMode !== 'grow') {
      applyAutoHeightChrome(info.id, info.height);
      return;
    }
    const realHeight = Math.ceil(elementRef.current.offsetHeight);
    if (shouldBlockPlaceholderHeightShrink(info, realHeight, editorEmptyRef.current)) return;
    applyAutoHeightChrome(info.id, realHeight);
    if (info.height === realHeight) return;
    useSlidesStore.getState().updateElement({
      id: info.id,
      props: { height: realHeight }
    });
  }, [liveMode, resyncTextFit]);
  useEffect(() => {
    if (!isHandleElement) return;
    if (!isScaling) {
      const info = elementInfoRef.current;
      const layout = textBoxLayoutRef.current;
      if (!layout.lockPaintHeight && !info.vertical && realHeightCache.current !== -1) {
        applyAutoHeightChrome(info.id, realHeightCache.current);
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { height: realHeightCache.current }
        });
        realHeightCache.current = -1;
      }
      if (!layout.lockPaintHeight && info.vertical && realWidthCache.current !== -1) {
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { width: realWidthCache.current }
        });
        realWidthCache.current = -1;
      }
    }
  }, [isScaling, isHandleElement]);
  const insetKey = inset.join(',');
  useEffect(() => {
    Promise.resolve().then(() => {
      if (useMainStore.getState().isGesturing) return;
      if (!elementRef.current) return;
      const info = elementInfoRef.current;
      const layout = textBoxLayoutRef.current;
      if (!layout.lockPaintHeight && !info.vertical && info.height !== elementRef.current.offsetHeight) {
        if (shouldBlockPlaceholderHeightShrink(info, elementRef.current.offsetHeight, editorEmptyRef.current)) return;
        applyAutoHeightChrome(info.id, elementRef.current.offsetHeight);
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { height: elementRef.current.offsetHeight }
        });
      }
      if (!layout.lockPaintHeight && info.vertical && info.width !== elementRef.current.offsetWidth) {
        if (info.placeholder && editorEmptyRef.current) return;
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { width: elementRef.current.offsetWidth }
        });
      }
    });
  }, [insetKey]);
  const updateTextElementHeight = useCallback((_entries: ResizeObserverEntry[]) => {
    const node = elementRef.current;
    if (!node) return;
    const info = elementInfoRef.current;
    const realHeight = Math.ceil(node.offsetHeight);
    const realWidth = Math.ceil(node.offsetWidth);
    if (shouldBlockPlaceholderHeightShrink(info, realHeight, editorEmptyRef.current)) return;
    const layout = textBoxLayoutRef.current;
    const main = useMainStore.getState();
    if (main.isGesturing) return;
    const scaling = main.isScaling;
    if (!layout.lockPaintHeight && !info.vertical && info.height !== realHeight) {
      applyAutoHeightChrome(info.id, realHeight);
      if (!scaling) {
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { height: realHeight }
        });
      } else realHeightCache.current = realHeight;
    }
    if (!layout.lockPaintHeight && info.vertical && info.width !== realWidth) {
      if (!scaling) {
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { width: realWidth }
        });
      } else realWidthCache.current = realWidth;
    }
  }, []);
  const updateTextElementHeightRef = useRef(updateTextElementHeight);
  updateTextElementHeightRef.current = updateTextElementHeight;
  useEffect(() => {
    const el = elementRef.current;
    const resizeObserver = new ResizeObserver(entries => updateTextElementHeightRef.current(entries));
    if (el) resizeObserver.observe(el);
    const info = elementInfoRef.current;
    if (info.placeholder) {
      if (isEmptyRichText(info.content)) applyPlaceholderPreset();
      else Promise.resolve().then(() => seedPlaceholder(info, false));
    }
    return () => {
      if (el) resizeObserver.unobserve(el);
    };
  }, []);
  const updateContent = useCallback((content: string, ignore = false) => {
    const info = elementInfoRef.current;
    const nextContent = info.placeholder ? repairFilledPlaceholderHtml(info, content) : content;
    useSlidesStore.getState().updateElement({
      id: elementId,
      props: { content: nextContent }
    });
    if (!ignore) addHistorySnapshot();
  }, [elementId, addHistorySnapshot]);
  const handleUpdate = useCallback((payload: { value: string; ignore: boolean }) => {
    updateContent(payload.value, payload.ignore);
  }, [updateContent]);
  const checkEmptyText = useMemo(() => debounce(function () {
    const info = selectCurrentSlide(useSlidesStore.getState())?.elements.find(el => el.id === elementId) as PPTTextElement | undefined;
    if (!info || info.placeholder) return;
    const pureText = info.content.replace(/<[^>]+>/g, '');
    if (!pureText) useSlidesStore.getState().deleteElement(info.id);
  }, 300, {
    trailing: true
  }), [elementId]);
  useEffect(() => {
    if (!isHandleElement) {
      setPlaceholderTextEditing(false);
      checkEmptyText();
    }
  }, [isHandleElement, checkEmptyText]);
  const handleEditorMouseDown = useCallback((event: MouseEvent) => {
    handleSelectElementRef.current(event, false);
  }, []);
  const handleDocChange = useCallback((html: string) => {
    liveContentRef.current = html;
    setLiveHtml(html);
    setLiveContent(html);
    requestAnimationFrame(() => updateTextElementHeightRef.current([]));
  }, [setLiveContent]);
  return <div className={cx('editable-element-text', className, {
    'lock': elementInfo.lock
  })} style={{
    top: elementInfo.top + 'px',
    left: elementInfo.left + 'px',
    width: elementInfo.width + 'px',
    height: paintSize.height,
    boxSizing: 'border-box',
    overflow: textBoxLayout.lockPaintHeight ? 'hidden' : undefined,
    ...style
  }}><div className={cx('rotate-wrapper')} style={{
      transform: `rotate(${elementInfo.rotate}deg)`,
      height: paintSize.height === 'auto' ? 'auto' : undefined
    }}><div className={cx('element-content', {
        'placeholder-element': elementInfo.placeholder,
        'content-title-placeholder': textBoxLayout.flexCenterInLayoutBox,
        'v-align-box': useFlexColumn,
        'show-placeholder': showPlaceholder,
        'editing-empty': isEditingEmpty,
        'is-editing': isEditing || placeholderTextEditing
      })} ref={elementRef} data-live-box data-text-box-mode={textBoxLiveMode(elementInfo, textBoxLayout)} {...(textBoxLayout.fixedHeight ? { 'data-fixed-height': '' } : {})} {...(paintSize.height === 'auto' ? { 'data-live-auto-height': '' } : {})} style={{
        width: paintSize.width,
        height: paintSize.height,
        backgroundColor: elementInfo.fill,
        opacity: elementInfo.opacity,
        textShadow: shadowStyle,
        lineHeight: elementInfo.lineHeight,
        letterSpacing: (elementInfo.wordSpace || 0) + 'px',
        color: defaultInkColor,
        caretColor: defaultInkColor,
        fontFamily: elementInfo.defaultFontName,
        ...placeholderTypography,
        writingMode: elementInfo.vertical ? 'vertical-rl' : 'horizontal-tb',
        padding: `${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px`,
        boxSizing: 'border-box',
        display: useFlexColumn ? 'flex' : undefined,
        flexDirection: useFlexColumn ? 'column' : undefined,
        justifyContent: contentBoxJustify,
        overflow: textBoxLayout.lockPaintHeight || outlineBorderRadius ? 'hidden' : undefined,
        borderRadius: outlineBorderRadius,
        '--paragraphSpace': `${elementInfo.paragraphSpace === undefined ? 5 : elementInfo.paragraphSpace}px`
      } as CSSPropertiesWithVars} onContextMenu={(event) => { event.stopPropagation(); event.preventDefault(); openContextmenu(event, contextmenus); }} onMouseDown={($event) => {
        if (showPlaceholder) {
          activatePlaceholder($event);
          return;
        }
        handleSelectElement($event, !(isEditing || placeholderTextEditing));
      }} onTouchStart={($event) => {
        if (showPlaceholder) {
          activatePlaceholder($event);
          return;
        }
        handleSelectElement($event, !(isEditing || placeholderTextEditing));
      }} onDoubleClick={(event) => { event.stopPropagation(); startEdit(); }}><ElementOutline width={elementInfo.width} height={elementInfo.height} outline={elementInfo.outline} /><div className={cx('text-fit-host')} ref={textFitHostRef} data-text-fit-host style={textFitPaintStyle}><div className={cx('text')}><ProsemirrorEditor elementId={elementId} defaultColor={defaultInkColor} defaultFontName={elementInfo.defaultFontName} defaultFontSize={placeholderEditorDefaults.defaultFontSize} defaultAlign={placeholderEditorDefaults.defaultAlign} editable={!elementInfo.lock && !!(isEditing || placeholderTextEditing)} wrapEmptyAs={listPlaceholder ? 'bullet' : undefined} value={(isEditing || placeholderTextEditing || editorFocused) ? elementInfo.content : painted.html} autoFocus={!!(isEditing || placeholderTextEditing)} ref={prosemirrorEditorRef} onUpdate={handleUpdate} onMouseDown={handleEditorMouseDown} onFocus={handleEditorFocus} onBlur={handleEditorBlur} onEmptyChange={handleEmptyChange} onPlaceholderFill={() => seedPlaceholder(elementInfoRef.current, false)} placeholderFillStyles={elementInfo.placeholder ? placeholderSeed(elementInfo, 'filled', defaultInkColor) : undefined} onDocChange={handleDocChange} onPlaceholderStyle={handlePlaceholderStyle} /></div></div>{}<div className={cx('drag-handler', 'top')} /><div className={cx('drag-handler', 'bottom')} /></div></div></div>;
});
export default TextElement;
