import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect, useLayoutEffect, type CSSProperties, type ElementRef, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';

import { openContextmenu } from '@/utils/openContextmenu';
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store';
import type { PPTShapeElement, ShapeText } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import useElementOutline from '@/views/components/element/hooks/useElementOutline';
import useElementShadow from '@/views/components/element/hooks/useElementShadow';
import useElementFlip from '@/views/components/element/hooks/useElementFlip';
import useElementFill from '@/views/components/element/hooks/useElementFill';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
import { resolveElementDefaultFontColor, resolveLiveTextPaint } from '@/utils/textContrast';
import { resolveShapePaintPath } from '@/utils/elementOutline'
import { serializeRichTextHtml } from '@/utils/prosemirror';
import GradientDefs from './GradientDefs';
import PatternDefs from './PatternDefs';
import ProsemirrorEditor from '@/views/components/element/ProsemirrorEditor';
import { areShapeElementPropsEqual, editingShapeIds } from './shapePaintEqual';
import { useAutoShapeTextHeight } from '@/views/components/element/hooks/useAutoShapeTextHeight';
import useTextFit from '@/views/components/element/hooks/useTextFit';
import { shapeTextLocksSize } from '@/utils/textBoxLock';
import { syncShapePaint } from '@/utils/liveElementSize';
export type IShapeElementProps = {
  elementInfo: PPTShapeElement;
  selectElement: (e: MouseEvent | TouchEvent, element: PPTShapeElement, canMove?: boolean) => void;
  contextmenus: () => ContextmenuItem[] | null;
  isEditing?: boolean;
};

const readStoreShape = (id: string): PPTShapeElement | undefined => {
  const el = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === id);
  return el?.type === 'shape' ? el : undefined;
};

const defaultShapeText = (elementInfo: PPTShapeElement, theme: { fontName: string; fontColor: string; backgroundColor: string }): ShapeText => ({
  content: '',
  align: 'middle',
  defaultFontName: theme.fontName,
  defaultColor: resolveElementDefaultFontColor(theme.fontColor, {
    fill: elementInfo.fill,
    background: selectCurrentSlide(useSlidesStore.getState())?.background,
    fallbackSurface: theme.backgroundColor
  })
});

const ShapeElement = memo((props: IShapeElementProps) => {
  const { elementInfo, contextmenus, isEditing } = props;
  const theme = useSlidesStore(s => s.theme);
  const handleElementId = useMainStore(s => s.handleElementId);
  const shapeFormatPainter = useMainStore(s => s.shapeFormatPainter);
  const { addHistorySnapshot } = useHistorySnapshot();
  const [editable, setEditable] = useState(false);
  const elementInfoRef = useRef(elementInfo);
  elementInfoRef.current = elementInfo;
  const selectElementRef = useRef(props.selectElement);
  selectElementRef.current = props.selectElement;
  const contextmenusRef = useRef(contextmenus);
  contextmenusRef.current = contextmenus;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const handleSelectElement = useCallback((e: ReactMouseEvent | ReactTouchEvent | MouseEvent | TouchEvent, canMove = true) => {
    const info = elementInfoRef.current;
    if (info.lock) return;
    e.stopPropagation();
    if (editableRef.current && !canMove) return;
    selectElementRef.current(e as MouseEvent | TouchEvent, info, canMove);
  }, []);
  const execFormatPainter = useCallback(() => {
    const painter = useMainStore.getState().shapeFormatPainter;
    if (!painter) return;
    const { keep, ...newProps } = painter;
    useSlidesStore.getState().updateElement({
      id: elementInfoRef.current.id,
      props: newProps
    });
    addHistorySnapshot();
    if (!keep) useMainStore.getState().setShapeFormatPainter(null);
  }, [addHistorySnapshot]);
  const { fill } = useElementFill(elementInfo, 'editable');
  const { outlineWidth, outlineColor, strokeDashArray } = useElementOutline(elementInfo.outline);
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const { flipStyle } = useElementFlip(elementInfo.flipH, elementInfo.flipV);
  const stopEdit = useCallback(() => {
    editingShapeIds.delete(elementInfoRef.current.id);
    if (editableRef.current) setEditable(false);
  }, []);
  useEffect(() => {
    if (handleElementId !== elementInfo.id) stopEdit();
  }, [handleElementId, elementInfo.id, stopEdit]);
  const slide = selectCurrentSlide(useSlidesStore.getState());
  const painted = resolveLiveTextPaint(
    (elementInfo.text?.defaultColor || theme.fontColor),
    (elementInfo.text?.content || ''),
    {
      element: elementInfo,
      elements: slide?.elements,
      fill: elementInfo.fill,
      background: slide?.background,
      fallbackSurface: theme.backgroundColor,
      themeFontColor: theme.fontColor,
    },
  );
  const text: ShapeText = elementInfo.text
    ? { ...elementInfo.text, defaultColor: painted.ink }
    : defaultShapeText(elementInfo, theme);
  const liveContentRef = useRef(text.content);
  const prevContentRef = useRef(text.content);
  if (!editable && text.content !== prevContentRef.current) {
    liveContentRef.current = text.content;
  }
  prevContentRef.current = text.content;
  const editorValueRef = useRef(text.content);
  if (!editable) editorValueRef.current = liveContentRef.current || text.content;
  const staticContent = serializeRichTextHtml(painted.html);
  const inset = text.inset || [10, 10, 10, 10];
  const lockedText = shapeTextLocksSize(text);
  const textFitHostRef = useRef<HTMLDivElement | null>(null);
  const textHostRef = useAutoShapeTextHeight(!lockedText, elementInfo.id, inset, textFitHostRef);
  // Selected shapes host a live (non-editable) editor so panel style commands
  // (font size, presets, bold...) land — same contract as text elements.
  const mountEditor = editable || (!!handleElementId && handleElementId === elementInfo.id && !!text.content);
  const svgRef = useRef<SVGSVGElement | null>(null);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    syncShapePaint(svg, elementInfo.width, elementInfo.height, elementInfo.viewBox);
  }, [elementInfo.width, elementInfo.height, elementInfo.viewBox, elementInfo.path, elementInfo.outline]);
  const { textFitPaintStyle, setLiveContent } = useTextFit(elementInfo, liveContentRef, textFitHostRef);
  const updateText = useCallback((content: string, ignore = false) => {
    const info = elementInfoRef.current;
    liveContentRef.current = content;
    setLiveContent(content);
    const storeText = readStoreShape(info.id)?.text;
    const _text = {
      ...(storeText || info.text || defaultShapeText(info, useSlidesStore.getState().theme)),
      content
    };
    useSlidesStore.getState().updateElement({
      id: info.id,
      props: { text: _text }
    });
    if (!ignore) addHistorySnapshot();
  }, [addHistorySnapshot, setLiveContent]);
  const checkEmptyText = useCallback(() => {
    const info = elementInfoRef.current;
    const currentText = readStoreShape(info.id)?.text || info.text;
    if (!currentText) return;
    const pureText = currentText.content.replace(/<[^>]+>/g, '');
    if (!pureText) {
      useSlidesStore.getState().removeElementProps({
        id: info.id,
        propName: 'text'
      });
      addHistorySnapshot();
    }
  }, [addHistorySnapshot]);
  const handleEditorUpdate = useCallback(({
    value,
    ignore
  }: {
    value: string;
    ignore: boolean;
  }) => updateText(value, ignore), [updateText]);
  const handleEditorMouseDown = useCallback((e: MouseEvent) => {
    handleSelectElement(e, false);
  }, [handleSelectElement]);
  const prosemirrorEditorRef = useRef<ElementRef<typeof ProsemirrorEditor> | null>(null);
  const startEdit = useCallback(() => {
    editingShapeIds.add(elementInfoRef.current.id);
    setEditable(true);
    Promise.resolve().then(() => prosemirrorEditorRef.current && prosemirrorEditorRef.current.focus());
  }, []);
  const startEditRef = useRef(startEdit);
  startEditRef.current = startEdit;
  const skipIsEditingWatch = useRef(true);
  useLayoutEffect(() => {
    if (skipIsEditingWatch.current) {
      skipIsEditingWatch.current = false;
      return;
    }
    if (isEditing) startEditRef.current();
    else if (editableRef.current) stopEdit();
  }, [isEditing, stopEdit]);
  return <div className={cx('editable-element-shape', {
    'lock': elementInfo.lock,
    'format-painter': shapeFormatPainter
  })} style={{
    top: elementInfo.top + 'px',
    left: elementInfo.left + 'px',
    width: elementInfo.width + 'px',
    height: elementInfo.height + 'px'
  }}><div className={cx('rotate-wrapper')} style={{
      transform: `rotate(${elementInfo.rotate}deg)`
    }}><div className={cx('element-content')} data-live-box style={{
        opacity: elementInfo.opacity,
        filter: shadowStyle ? `drop-shadow(${shadowStyle})` : '',
        transform: flipStyle,
        color: text.defaultColor,
        fontFamily: text.defaultFontName
      }} onContextMenu={(event) => { event.stopPropagation(); event.preventDefault(); openContextmenu(event, contextmenusRef.current); }} onMouseDown={($event) => {
        handleSelectElement($event);
      }} onMouseUp={() => {
        execFormatPainter();
      }} onTouchStart={($event) => {
        handleSelectElement($event);
      }} onDoubleClick={() => {
        startEdit();
      }}><svg ref={svgRef} overflow='visible' width={elementInfo.width} height={elementInfo.height}><defs>{elementInfo.pattern ? <PatternDefs id={`editable-pattern-${elementInfo.id}`} src={elementInfo.pattern} /> : elementInfo.gradient ? <GradientDefs id={`editable-gradient-${elementInfo.id}`} type={elementInfo.gradient.type} colors={elementInfo.gradient.colors} rotate={elementInfo.gradient.rotate} /> : null}</defs><g key={`${elementInfo.width}:${elementInfo.height}:${elementInfo.viewBox[0]}:${elementInfo.viewBox[1]}`} transform={`scale(${elementInfo.width / elementInfo.viewBox[0]}, ${elementInfo.height / elementInfo.viewBox[1]}) translate(0,0) matrix(1,0,0,1,0,0)`}><path className={cx('shape-path')} vectorEffect='non-scaling-stroke' strokeLinecap='butt' strokeLinejoin={elementInfo.outline?.radius ? 'round' : 'miter'} strokeMiterlimit='8' d={resolveShapePaintPath(elementInfo)} fill={fill} stroke={outlineColor} strokeWidth={outlineWidth} strokeDasharray={strokeDashArray} /></g></svg><div ref={textHostRef} className={cx('shape-text', [text.align, {
          'editable': editable || text.content
        }])} style={{
          lineHeight: text.lineHeight,
          letterSpacing: (text.wordSpace || 0) + 'px',
          padding: `${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px`,
          overflow: lockedText ? 'hidden' : undefined,
          '--paragraphSpace': `${text.paragraphSpace === undefined ? 5 : text.paragraphSpace}px`
        } as CSSProperties}><div ref={textFitHostRef} data-text-fit-host style={textFitPaintStyle}>{mountEditor ? <ProsemirrorEditor ref={prosemirrorEditorRef} elementId={elementInfo.id} defaultColor={text.defaultColor} defaultFontName={text.defaultFontName} editable={!elementInfo.lock && editable} value={editorValueRef.current} autoFocus={editable} onUpdate={handleEditorUpdate} onBlur={checkEmptyText} onMouseDown={handleEditorMouseDown} /> : text.content ? <div className={cx('prosemirror-editor')}><div className={cx('ProseMirror', 'ProseMirror-static')} dangerouslySetInnerHTML={{ __html: staticContent }} /></div> : null}</div></div></div></div></div>;
}, areShapeElementPropsEqual);
export default ShapeElement;
