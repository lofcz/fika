import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useCallback, memo, useState, useEffect, type CSSProperties, type ElementRef } from 'react';
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
import { resolveElementDefaultFontColor, resolveElementSurfaces, resolvePlaceholderColor } from '@/utils/textContrast';
import { computePlaceholderSlotHeight, getPlaceholderBaselineHeight, resolveTextBoxLayout, shouldBlockPlaceholderHeightShrink } from '@/utils/placeholderLayout';
import { isPlaceholderPromptFontSize } from '@/configs/textPresets';
import { isListPlaceholder, placeholderBoxVars, placeholderPhase, placeholderSeed } from '@/utils/placeholderPaint';
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
const TextElement = memo((props: ITextElementProps) => {
  const { elementInfo, contextmenus, isEditing, className, style } = props;
  const elementId = elementInfo.id;
  const isHandleElement = useMainStore(s => s.handleElementId === elementId);
  const isScaling = useMainStore(s => s.handleElementId === elementId && s.isScaling);
  const { addHistorySnapshot } = useHistorySnapshot();
  const { currentSlide, theme } = readSlideTheme();
  const elementSurfaces = resolveElementSurfaces({
    fill: elementInfo.fill,
    background: currentSlide?.background,
    fallbackSurface: theme?.backgroundColor
  });
  const defaultInkColor = resolveElementDefaultFontColor(elementInfo.defaultColor || theme?.fontColor || '#333', {
    fill: elementInfo.fill,
    background: currentSlide?.background,
    fallbackSurface: theme?.backgroundColor
  });
  const elementRef = useRef<HTMLDivElement | null>(null);
  const prosemirrorEditorRef = useRef<ElementRef<typeof ProsemirrorEditor> | null>(null);
  const [editorFocused, setEditorFocused] = useState(false);
  const [placeholderTextEditing, setPlaceholderTextEditing] = useState(false);
  const liveContentRef = useRef<string | null>(null);
  const textFitHostRef = useRef<HTMLDivElement | null>(null);
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const inset: TextInset = elementInfo.inset || [10, 10, 10, 10];
  const { textFitPaintStyle, setLiveContent } = useTextFit(elementInfo, liveContentRef, textFitHostRef, {
    observeResize: false
  });
  const outlineBorderRadius = useOutlineRadiusCss(elementInfo.outline, elementInfo.width, elementInfo.height);
  const textBoxLayout = resolveTextBoxLayout(elementInfo, currentSlide?.type);
  const fixedContentJustify = (() => {
    if (!textBoxLayout.fixedHeight) return undefined;
    const vAlignMap: Record<NonNullable<PPTTextElement['vAlign']>, CSSProperties['justifyContent']> = {
      top: 'flex-start',
      middle: 'center',
      bottom: 'flex-end'
    };
    return vAlignMap[textBoxLayout.vAlign];
  })();
  const contentBoxJustify = textBoxLayout.flexCenterInLayoutBox ? 'center' : fixedContentJustify;
  const placeholderVAlign = (() => {
    if (textBoxLayout.flexCenterInLayoutBox) return 'middle' as const;
    return elementInfo.vAlign ?? (elementInfo.textType === 'content' ? 'top' : 'middle');
  })();
  const contentTitleLayoutMinHeight = textBoxLayout.flexCenterInLayoutBox ? `${elementInfo.height}px` : undefined;
  const computeEmpty = (html: string) => {
    return !html.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  };

  const [editorEmpty, setEditorEmpty] = useState(computeEmpty(elementInfo.content));
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
    if (editorFocused) return;
    setEditorEmpty(computeEmpty(elementInfo.content));
  }, [elementInfo.content, editorFocused]);
  const listPlaceholder = isListPlaceholder(elementInfo);
  const isEmptyPlaceholder = !!elementInfo.placeholder && editorEmpty;
  const editingActive = !!(isEditing || placeholderTextEditing);
  const isEditingEmpty = isEmptyPlaceholder && editingActive;
  const showPlaceholder = isEmptyPlaceholder && !editingActive;
  const seedPlaceholder = (info: PPTTextElement, empty: boolean) => {
    prosemirrorEditorRef.current?.seedPlaceholderStyles(
      placeholderSeed(info, placeholderPhase(empty), defaultInkColorRef.current),
    );
  };
  const applyPlaceholderPreset = useCallback(() => {
    const info = elementInfoRef.current;
    if (!info.placeholder) return;
    Promise.resolve().then(() => seedPlaceholder(info, true));
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
    setLiveContent(null);
  }, [setLiveContent]);
  const placeholderLayoutMinHeight = elementInfo.placeholder
    ? `${getPlaceholderBaselineHeight(elementInfo)}px`
    : undefined;
  useEffect(() => {
    if (!elementInfo.placeholder) return;
    const slot = computePlaceholderSlotHeight(elementInfo);
    const next: Partial<PPTTextElement> = {};
    if (elementInfo.height < slot) next.height = slot;
    if ((elementInfo.placeholderLayoutHeight ?? 0) < slot) next.placeholderLayoutHeight = slot;
    if (!Object.keys(next).length) return;
    useSlidesStore.getState().updateElement({
      id: elementInfo.id,
      props: next
    });
  }, [elementInfo.id, elementInfo.placeholder, elementInfo.placeholderFontSize, elementInfo.height, elementInfo.placeholderLayoutHeight, elementInfo.lineHeight, elementInfo.inset, elementInfo.paragraphSpace]);
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
  useEffect(() => {
    if (isEditing) startEditRef.current();
  }, [isEditing]);
  const handleEmptyChange = useCallback((empty: boolean) => {
    if (empty) {
      setEditorEmpty(true);
      setPlaceholderSeeded(false);
      return;
    }
    setEditorEmpty(false);
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
    if (!textBoxLayoutRef.current.fixedHeight && info.height < slot) next.height = slot;
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
  const wasFixedHeightRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const fixed = textBoxLayout.fixedHeight;
    const wasFixed = wasFixedHeightRef.current;
    wasFixedHeightRef.current = fixed;
    if (fixed || wasFixed === undefined) return;
    Promise.resolve().then(() => {
      const info = elementInfoRef.current;
      if (!elementRef.current || info.vertical || info.placeholder) return;
      const realHeight = elementRef.current.offsetHeight;
      if (info.height === realHeight) return;
      if (shouldBlockPlaceholderHeightShrink(info, realHeight, editorEmptyRef.current)) return;
      useSlidesStore.getState().updateElement({
        id: info.id,
        props: { height: realHeight }
      });
    });
  }, [textBoxLayout.fixedHeight]);
  useEffect(() => {
    if (!isHandleElement) return;
    if (!isScaling) {
      const info = elementInfoRef.current;
      const layout = textBoxLayoutRef.current;
      if (!layout.fixedHeight && !info.vertical && realHeightCache.current !== -1) {
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { height: realHeightCache.current }
        });
        realHeightCache.current = -1;
      }
      if (!layout.fixedHeight && info.vertical && realWidthCache.current !== -1) {
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
      if (!elementRef.current) return;
      const info = elementInfoRef.current;
      const layout = textBoxLayoutRef.current;
      if (!layout.fixedHeight && !info.vertical && !info.placeholder && info.height !== elementRef.current.offsetHeight) {
        if (shouldBlockPlaceholderHeightShrink(info, elementRef.current.offsetHeight, editorEmptyRef.current)) return;
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { height: elementRef.current.offsetHeight }
        });
      }
      if (!layout.fixedHeight && info.vertical && info.width !== elementRef.current.offsetWidth) {
        if (info.placeholder && editorEmptyRef.current) return;
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { width: elementRef.current.offsetWidth }
        });
      }
    });
  }, [insetKey]);
  const updateTextElementHeight = useCallback((entries: ResizeObserverEntry[]) => {
    const contentRect = entries[0].contentRect;
    if (!elementRef.current) return;
    const info = elementInfoRef.current;
    const currentInset = info.inset || [10, 10, 10, 10];
    const realHeight = contentRect.height + currentInset[0] + currentInset[2];
    const realWidth = contentRect.width + currentInset[1] + currentInset[3];
    if (shouldBlockPlaceholderHeightShrink(info, realHeight, editorEmptyRef.current)) return;
    const layout = textBoxLayoutRef.current;
    const scaling = useMainStore.getState().isScaling;
    if (info.placeholder && !scaling) return;
    if (!layout.fixedHeight && !info.vertical && info.height !== realHeight) {
      if (!scaling) {
        useSlidesStore.getState().updateElement({
          id: info.id,
          props: { height: realHeight }
        });
      } else realHeightCache.current = realHeight;
    }
    if (!layout.fixedHeight && info.vertical && info.width !== realWidth) {
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
    if (elementInfoRef.current.placeholder) applyPlaceholderPreset();
    return () => {
      if (el) resizeObserver.unobserve(el);
    };
  }, []);
  const updateContent = useCallback((content: string, ignore = false) => {
    useSlidesStore.getState().updateElement({
      id: elementId,
      props: { content }
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
    setLiveContent(html);
  }, [setLiveContent]);
  return <div className={cx('editable-element-text', className, {
    'lock': elementInfo.lock
  })} style={{
    top: elementInfo.top + 'px',
    left: elementInfo.left + 'px',
    width: elementInfo.width + 'px',
    height: elementInfo.height + 'px',
    ...style
  }}><div className={cx('rotate-wrapper')} style={{
      transform: `rotate(${elementInfo.rotate}deg)`
    }}><div className={cx('element-content', {
        'placeholder-element': elementInfo.placeholder,
        'content-title-placeholder': textBoxLayout.flexCenterInLayoutBox,
        'placeholder-top': placeholderVAlign === 'top',
        'show-placeholder': showPlaceholder,
        'editing-empty': isEditingEmpty,
        'is-editing': isEditing || placeholderTextEditing
      })} ref={elementRef} style={{
        width: elementInfo.vertical && !textBoxLayout.fixedHeight ? 'auto' : elementInfo.width + 'px',
        height: !elementInfo.vertical && !textBoxLayout.fixedHeight && !elementInfo.placeholder ? 'auto' : elementInfo.height + 'px',
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
        minHeight: contentTitleLayoutMinHeight ?? placeholderLayoutMinHeight,
        display: textBoxLayout.fixedHeight || textBoxLayout.flexCenterInLayoutBox ? 'flex' : undefined,
        flexDirection: textBoxLayout.fixedHeight || textBoxLayout.flexCenterInLayoutBox ? 'column' : undefined,
        justifyContent: contentBoxJustify,
        overflow: textBoxLayout.fixedHeight || outlineBorderRadius ? 'hidden' : undefined,
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
      }} onDoubleClick={(event) => { event.stopPropagation(); startEdit(); }}><ElementOutline width={elementInfo.width} height={elementInfo.height} outline={elementInfo.outline} /><div className={cx('text-fit-host')} ref={textFitHostRef} data-text-fit-host style={textFitPaintStyle}><div className={cx('text')}><ProsemirrorEditor elementId={elementId} defaultColor={defaultInkColor} defaultFontName={elementInfo.defaultFontName} defaultFontSize={placeholderEditorDefaults.defaultFontSize} defaultAlign={placeholderEditorDefaults.defaultAlign} editable={!elementInfo.lock && !!(isEditing || placeholderTextEditing)} wrapEmptyAs={listPlaceholder ? 'bullet' : undefined} value={elementInfo.content} autoFocus={!!(isEditing || placeholderTextEditing)} ref={prosemirrorEditorRef} onUpdate={handleUpdate} onMouseDown={handleEditorMouseDown} onFocus={handleEditorFocus} onBlur={handleEditorBlur} onEmptyChange={handleEmptyChange} onPlaceholderFill={() => seedPlaceholder(elementInfoRef.current, false)} placeholderFillStyles={elementInfo.placeholder ? placeholderSeed(elementInfo, 'filled', defaultInkColor) : undefined} onDocChange={handleDocChange} onPlaceholderStyle={handlePlaceholderStyle} /></div></div>{}<div className={cx('drag-handler', 'top')} /><div className={cx('drag-handler', 'bottom')} /></div></div></div>;
});
export default TextElement;
