import { bindStyles } from '@/utils/cssm'
import { createPortal } from 'react-dom'
import styles from './ProsemirrorEditor.module.scss'
const cx = bindStyles(styles)
import { forwardRef, useImperativeHandle, useRef, useMemo, useCallback, memo, useState, useEffect, useLayoutEffect, type HTMLAttributes, type MutableRefObject, type MouseEvent as ReactMouseEvent } from 'react';

import { debounce } from '@/utils/debounce';
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store';
import { richTextAttrsFromElement } from '@/utils/prosemirror/richTextAttrsFromElement';
import type { EditorView } from 'prosemirror-view';
import type { Mark, Node as ProsemirrorNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { toggleMark, wrapIn, lift } from 'prosemirror-commands';
import { initProsemirrorEditor, createDocument, normalizeFittedFontSizes } from '@/utils/prosemirror';
import { clearPendingCaret, consumePendingCaret, registerEditorView, unregisterEditorView } from '@/utils/prosemirror/caret';
import { commitLiveEditorToStore, resolveEditorMountHtml, richTextHtmlLooksEmpty } from '@/utils/prosemirror/commitEditor';
import { registerCommitFlusher } from '@/utils/commitQueue';
import { isActiveOfParentNodeType, findNodesWithSameMark, getMarkAttrs, getTextAttrs, autoSelectAll, addMark, markActive, getFontsize, rememberTextSelection, forgetTextSelection, restoreTextSelection, resolveRememberedRange, richTextHtmlEqual } from '@/utils/prosemirror/utils';
import emitter, { EmitterEvents, type RichTextAction, type RichTextCommand, type ApplyInlineMathPayload } from '@/utils/emitter';
import { alignmentCommand } from '@/utils/prosemirror/commands/setTextAlign';
import { indentCommand, textIndentCommand } from '@/utils/prosemirror/commands/setTextIndent';
import { toggleList } from '@/utils/prosemirror/commands/toggleList';
import { setListStyle } from '@/utils/prosemirror/commands/setListStyle';
import { replaceText } from '@/utils/prosemirror/commands/replaceText';
import { applyPlaceholderStyles, type PlaceholderStyleOptions, type EmptyPlaceholderStylePatch, isEmptyEditorDoc, setStoredMark, clearStoredMark, readEmptyPlaceholderPatch } from '@/utils/prosemirror/commands/applyPlaceholderStyles';
import { insertTextAsBulletList, wrapEmptyInBulletList } from '@/utils/prosemirror/commands/wrapEmptyBulletList';
import type { TextFormatPainterKeys } from '@/types/edit';
import type { TextAlign } from '@/types/slides';
import message from '@/utils/message';
import { KEYS } from '@/configs/hotkey';
import { useI18nContext } from '@/i18n/useI18nContext';
import { resolveFikaPortalTarget } from '@/utils/portal';
import { followHyperlinkModifier, hyperlinkAnchorFromEvent, hyperlinkTooltipFromAnchor, isFollowHyperlinkClick, isSafeHyperlinkHref, openHyperlink, type HyperlinkHoverTooltip } from '@/utils/hyperlinkFollow';
import { ensureMathliveReady, htmlContainsMath } from '@/utils/math';

type HostFallthrough = Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'onFocus' | 'onBlur' | 'onMouseDown' | 'children' | 'dangerouslySetInnerHTML'>;

export type IProsemirrorEditorProps = {
  elementId: string;
  defaultColor: string;
  defaultFontName: string;
  defaultFontSize?: string;
  defaultAlign?: TextAlign;
  value: string;
  editable?: boolean;
  autoFocus?: boolean;
  wrapEmptyAs?: 'bullet';
  placeholderFillStyles?: PlaceholderStyleOptions | null;
  className?: string;
} & {
  onUpdate?: (payload: {
    value: string;
    ignore: boolean;
  }) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onMouseDown?: (payload: MouseEvent) => void;
  onEmptyChange?: (empty: boolean) => void;
  onPlaceholderFill?: () => void;
  onDocChange?: (html: string) => void;
  onPlaceholderStyle?: (payload: EmptyPlaceholderStylePatch) => void;
} & HostFallthrough;

export type ProsemirrorEditorHandle = {
  focus: () => void;
  seedPlaceholderStyles: (options: PlaceholderStyleOptions, phase?: 'empty' | 'filled') => void;
  ensureBulletList: () => void;
};

type EditorCallbackRefs = {
  onUpdate?: IProsemirrorEditorProps['onUpdate'];
  onFocus?: IProsemirrorEditorProps['onFocus'];
  onBlur?: IProsemirrorEditorProps['onBlur'];
  onMouseDown?: IProsemirrorEditorProps['onMouseDown'];
  onEmptyChange?: IProsemirrorEditorProps['onEmptyChange'];
  onPlaceholderFill?: IProsemirrorEditorProps['onPlaceholderFill'];
  onDocChange?: IProsemirrorEditorProps['onDocChange'];
  onPlaceholderStyle?: IProsemirrorEditorProps['onPlaceholderStyle'];
};

type IProsemirrorEditorViewProps = {
  elementId: string;
  defaultColor: string;
  defaultFontName: string;
  defaultFontSize?: string;
  defaultAlign?: TextAlign;
  value: string;
  editable: boolean;
  autoFocus: boolean;
  wrapEmptyAs?: 'bullet';
  placeholderFillStyles?: PlaceholderStyleOptions | null;
  className?: string;
  hostAttrs: HostFallthrough;
  callbacksRef: MutableRefObject<EditorCallbackRefs>;
};

const NAV_KEYS = new Set<string>([KEYS.UP, KEYS.DOWN, KEYS.LEFT, KEYS.RIGHT, KEYS.PAGEUP, KEYS.PAGEDOWN, 'HOME', 'END']);

function hostAttrsEqual(prev: HostFallthrough, next: HostFallthrough) {
  if (prev === next) return true;
  const prevKeys = Object.keys(prev) as (keyof HostFallthrough)[];
  const nextKeys = Object.keys(next) as (keyof HostFallthrough)[];
  if (prevKeys.length !== nextKeys.length) return false;
  return prevKeys.every(key => prev[key] === next[key]);
}

function editorViewPropsEqual(prev: IProsemirrorEditorViewProps, next: IProsemirrorEditorViewProps) {
  return prev.elementId === next.elementId &&
    prev.defaultColor === next.defaultColor &&
    prev.defaultFontName === next.defaultFontName &&
    prev.defaultFontSize === next.defaultFontSize &&
    prev.defaultAlign === next.defaultAlign &&
    prev.value === next.value &&
    prev.editable === next.editable &&
    prev.autoFocus === next.autoFocus &&
    prev.wrapEmptyAs === next.wrapEmptyAs &&
    prev.className === next.className &&
    hostAttrsEqual(prev.hostAttrs, next.hostAttrs) &&
    prev.callbacksRef === next.callbacksRef;
}

const ProsemirrorEditorView = memo(forwardRef<ProsemirrorEditorHandle, IProsemirrorEditorViewProps>((vrProps, expose) => {
  'use no memo';
  const {
    LL
  } = useI18nContext();
  const {
    elementId,
    defaultColor,
    defaultFontName,
    defaultFontSize,
    defaultAlign,
    value,
    editable,
    autoFocus,
    wrapEmptyAs,
    placeholderFillStyles,
    className,
    hostAttrs,
    callbacksRef
  } = vrProps;
  const textFormatPainter = useMainStore(s => s.textFormatPainter);
  const editorViewRef = useRef<HTMLDivElement | null>(null);
  const editorView = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const elementIdRef = useRef(elementId);
  elementIdRef.current = elementId;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const autoFocusRef = useRef(autoFocus);
  autoFocusRef.current = autoFocus;
  const wrapEmptyAsRef = useRef(wrapEmptyAs);
  wrapEmptyAsRef.current = wrapEmptyAs;
  const placeholderFillStylesRef = useRef(placeholderFillStyles);
  placeholderFillStylesRef.current = placeholderFillStyles;
  const defaultColorRef = useRef(defaultColor);
  defaultColorRef.current = defaultColor;
  const defaultFontNameRef = useRef(defaultFontName);
  defaultFontNameRef.current = defaultFontName;
  const defaultFontSizeRef = useRef(defaultFontSize);
  defaultFontSizeRef.current = defaultFontSize;
  const defaultAlignRef = useRef(defaultAlign);
  defaultAlignRef.current = defaultAlign;
  const llRef = useRef(LL);
  llRef.current = LL;
  const [linkTooltip, setLinkTooltip] = useState<HyperlinkHoverTooltip | null>(null);
  const [linkTooltipPortal, setLinkTooltipPortal] = useState<HTMLElement | null>(null);
  const followModifier = followHyperlinkModifier();
  const followLinkRest = (() => {
    const hint = LL.canvas.link.followLink({
      modifier: followModifier
    });
    return hint.replace(followModifier, '').replace(/^[,\s]+/, '').trim();
  })();
  const hideLinkTooltip = useCallback(() => {
    setLinkTooltip(null);
  }, []);
  const updateLinkTooltip = useCallback((event: MouseEvent) => {
    const anchor = hyperlinkAnchorFromEvent(event);
    if (!anchor) {
      hideLinkTooltip();
      return false;
    }
    setLinkTooltip(hyperlinkTooltipFromAnchor(anchor));
    return false;
  }, [hideLinkTooltip]);

  const emitEmptyState = useCallback(() => {
    if (!editorView.current) return;
    callbacksRef.current.onEmptyChange?.(editorView.current.state.doc.textContent.trim().length === 0);
  }, [callbacksRef]);

  const docChangeRaf = useRef(0);
  const emitDocChange = useCallback(() => {
    if (docChangeRaf.current || typeof requestAnimationFrame === 'undefined') return;
    docChangeRaf.current = requestAnimationFrame(() => {
      docChangeRaf.current = 0;
      if (editorView.current) callbacksRef.current.onDocChange?.(editorView.current.dom.innerHTML);
    });
  }, [callbacksRef]);

  const handleInput = useMemo(() => debounce(function (isHanldeHistory = false) {
    if (!editorView.current) return;
    if (valueRef.current.replace(/ style=\"\"/g, '') === editorView.current.dom.innerHTML.replace(/ style=\"\"/g, '')) return;
    callbacksRef.current.onUpdate?.({
      value: normalizeFittedFontSizes(editorView.current.dom.innerHTML),
      ignore: isHanldeHistory
    });
  }, 300, {
    trailing: true
  }), [callbacksRef]);
  const readTextAttrs = () => getTextAttrs(editorView.current!, {
    color: defaultColorRef.current,
    fontname: defaultFontNameRef.current,
    ...(defaultFontSizeRef.current ? {
      fontsize: defaultFontSizeRef.current
    } : {}),
    ...(defaultAlignRef.current ? {
      align: defaultAlignRef.current
    } : {})
  });
  const syncRichTextAttrsFromView = () => {
    if (!editorView.current) return;
    if (useMainStore.getState().handleElementId !== elementIdRef.current) return;
    const view = editorView.current;
    if (isEmptyEditorDoc(view)) {
      const el = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === elementIdRef.current);
      const attrs = el ? richTextAttrsFromElement(el) : null;
      if (attrs) useMainStore.getState().setRichtextAttrs(attrs);
      return;
    }
    useMainStore.getState().setRichtextAttrs(readTextAttrs());
  };
  const handleFocus = useCallback(() => {
    if (!editorView.current) return;
    const main = useMainStore.getState();
    if (!main.disableHotkeys) main.setDisableHotkeysState(true);
    syncRichTextAttrsFromView();
    if (wrapEmptyAsRef.current === 'bullet' && editorView.current.state.doc.textContent.trim().length === 0) {
      wrapEmptyInBulletList(editorView.current);
    }
    callbacksRef.current.onFocus?.();
  }, [callbacksRef]);
  const handleBlur = useCallback(() => {
    if (!editorView.current) return;
    hideLinkTooltip();
    rememberTextSelection(editorView.current);
    useMainStore.getState().setDisableHotkeysState(false);
    if (
      isEmptyEditorDoc(editorView.current)
      && richTextHtmlLooksEmpty(editorView.current.dom.innerHTML)
    ) {
      handleInput.cancel();
      if (wrapEmptyAsRef.current === 'bullet') {
        wrapEmptyInBulletList(editorView.current);
      }
      else {
        const {
          doc,
          tr
        } = editorView.current.state;
        if (doc.content.size > 0) {
          editorView.current.dispatch(tr.replaceRangeWith(0, doc.content.size, createDocument('')));
        }
      }
      callbacksRef.current.onUpdate?.({
        value: '',
        ignore: true
      });
    } else {
      handleInput.flush();
    }
    emitEmptyState();
    callbacksRef.current.onBlur?.();
  }, [callbacksRef, hideLinkTooltip, handleInput, emitEmptyState]);
  const handleClick = useMemo(() => debounce(function () {
    syncRichTextAttrsFromView();
  }, 30, {
    trailing: true
  }), []);
  const handleKeydown = useCallback((_view: EditorView, e: KeyboardEvent) => {
    const {
      ctrlKey,
      shiftKey,
      metaKey
    } = e;
    const ctrlActive = ctrlKey || metaKey;
    const key = e.key.toUpperCase();
    const isHanldeHistory = ctrlActive && (key === KEYS.Z || key === KEYS.Y);
    if (!NAV_KEYS.has(key)) handleInput(isHanldeHistory);
    handleClick();
  }, [handleInput, handleClick]);
  const handleHostMouseDown = useCallback(($event: ReactMouseEvent<HTMLDivElement>) => {
    callbacksRef.current.onMouseDown?.($event.nativeEvent);
  }, [callbacksRef]);

  const skipValueWatchRef = useRef(true);
  useEffect(() => {
    if (htmlContainsMath(value)) void ensureMathliveReady().catch(() => {});
  }, [value]);
  useEffect(() => {
    if (skipValueWatchRef.current) {
      skipValueWatchRef.current = false;
      return;
    }
    if (!editorView.current) return;
    if (richTextHtmlEqual(editorView.current.dom.innerHTML, value)) return;
    if (editorView.current.hasFocus()) return;
    if (isEmptyEditorDoc(editorView.current) && richTextHtmlLooksEmpty(value)) {
      if (wrapEmptyAsRef.current === 'bullet') wrapEmptyInBulletList(editorView.current);
      return;
    }
    if (!isEmptyEditorDoc(editorView.current) && richTextHtmlLooksEmpty(value)) return;
    if (!editorView.current.state.selection.empty) return;
    const storedMarks = editorView.current.state.storedMarks;
    const keepStored = isEmptyEditorDoc(editorView.current) && !!storedMarks?.length;
    const range = resolveRememberedRange(editorView.current) ?? {
      from: editorView.current.state.selection.from,
      to: editorView.current.state.selection.to
    };
    const {
      doc,
      tr
    } = editorView.current.state;
    let next = tr.replaceRangeWith(0, doc.content.size, createDocument(value));
    const size = next.doc.content.size;
    const nextFrom = Math.max(0, Math.min(range.from, size));
    const nextTo = Math.max(0, Math.min(range.to, size));
    if (nextTo > nextFrom) {
      try {
        next = next.setSelection(TextSelection.create(next.doc, nextFrom, nextTo));
      } catch {}
    }
    editorView.current.dispatch(next);
    if (keepStored && isEmptyEditorDoc(editorView.current) && storedMarks) {
      editorView.current.dispatch(editorView.current.state.tr.setStoredMarks(storedMarks));
    }
  }, [value]);

  useLayoutEffect(() => {
    if (!editorView.current) return;
    editorView.current.setProps({
      editable: () => editableRef.current
    });
  }, [editable]);

  const focus = useCallback(() => {
    if (!editorView.current) return;
    editorView.current.focus();
    consumePendingCaret(elementIdRef.current, editorView.current);
  }, []);
  const seedPlaceholderStyles = useCallback((options: PlaceholderStyleOptions, phase?: 'empty' | 'filled') => {
    if (!editorView.current) return;
    try {
      const empty = isEmptyEditorDoc(editorView.current);
      if (phase === 'empty' && !empty) return;
      applyPlaceholderStyles(editorView.current, options, phase);
      if (!empty) handleInput();
      handleClick();
    }
    catch {}
  }, [handleInput, handleClick]);
  const ensureBulletList = useCallback(() => {
    if (!editorView.current) return;
    wrapEmptyInBulletList(editorView.current);
  }, []);
  const applyMark = (mark: Mark) => {
    if (isEmptyEditorDoc(editorView.current)) {
      setStoredMark(editorView.current, mark);
      return;
    }
    autoSelectAll(editorView.current);
    addMark(editorView.current, mark);
  };
  useImperativeHandle(expose, () => ({
    focus,
    seedPlaceholderStyles,
    ensureBulletList
  }), [focus, seedPlaceholderStyles, ensureBulletList]);

  const execCommand = useCallback(({
    target,
    action
  }: RichTextCommand) => {
    if (!target && useMainStore.getState().handleElementId !== elementIdRef.current) return;
    if (target && target !== elementIdRef.current) return;
    const actions = 'command' in action ? [action] : action;
    restoreTextSelection(editorView.current);
    for (const item of actions) {
      if (item.command === 'fontname' && item.value !== undefined) {
        const mark = editorView.current.state.schema.marks.fontname.create({
          fontname: item.value
        });
        applyMark(mark);
        if (item.value && !document.fonts.check(`16px ${item.value}`)) {
          message.warning(llRef.current.editor.richText.fontPendingDownload());
        }
      } else if (item.command === 'fontsize' && item.value) {
        const mark = editorView.current.state.schema.marks.fontsize.create({
          fontsize: item.value
        });
        applyMark(mark);
        if (!isEmptyEditorDoc(editorView.current)) setListStyle(editorView.current, {
          key: 'fontsize',
          value: item.value
        });
      } else if (item.command === 'fontsize-add') {
        const step = item.value ? +item.value : 2;
        const fontsize = getFontsize(editorView.current) + step + 'px';
        const mark = editorView.current.state.schema.marks.fontsize.create({
          fontsize
        });
        applyMark(mark);
        if (!isEmptyEditorDoc(editorView.current)) setListStyle(editorView.current, {
          key: 'fontsize',
          value: fontsize
        });
      } else if (item.command === 'fontsize-reduce') {
        const step = item.value ? +item.value : 2;
        let fontsize = getFontsize(editorView.current) - step;
        if (fontsize < 12) fontsize = 12;
        const mark = editorView.current.state.schema.marks.fontsize.create({
          fontsize: fontsize + 'px'
        });
        applyMark(mark);
        if (!isEmptyEditorDoc(editorView.current)) setListStyle(editorView.current, {
          key: 'fontsize',
          value: fontsize + 'px'
        });
      } else if (item.command === 'color') {
        if (!item.value || item.value === '#00000000' || item.value === 'transparent') {
          if (isEmptyEditorDoc(editorView.current)) {
            clearStoredMark(editorView.current, editorView.current.state.schema.marks.forecolor);
          } else {
            autoSelectAll(editorView.current);
            const {
              $from,
              $to
            } = editorView.current.state.selection;
            editorView.current.dispatch(editorView.current.state.tr.removeMark($from.pos, $to.pos, editorView.current.state.schema.marks.forecolor));
            setListStyle(editorView.current, {
              key: 'color',
              value: ''
            });
          }
        } else {
          applyMark(editorView.current.state.schema.marks.forecolor.create({
            color: item.value
          }));
          if (!isEmptyEditorDoc(editorView.current)) setListStyle(editorView.current, {
            key: 'color',
            value: item.value
          });
        }
      } else if (item.command === 'backcolor') {
        if (!item.value || item.value === '#00000000' || item.value === 'transparent') {
          if (isEmptyEditorDoc(editorView.current)) {
            clearStoredMark(editorView.current, editorView.current.state.schema.marks.backcolor);
          } else {
            autoSelectAll(editorView.current);
            const {
              $from,
              $to
            } = editorView.current.state.selection;
            editorView.current.dispatch(editorView.current.state.tr.removeMark($from.pos, $to.pos, editorView.current.state.schema.marks.backcolor));
          }
        } else {
          applyMark(editorView.current.state.schema.marks.backcolor.create({
            backcolor: item.value
          }));
        }
      } else if (item.command === 'bold') {
        restoreTextSelection(editorView.current);
        toggleMark(editorView.current.state.schema.marks.strong)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'em') {
        restoreTextSelection(editorView.current);
        toggleMark(editorView.current.state.schema.marks.em)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'underline') {
        restoreTextSelection(editorView.current);
        toggleMark(editorView.current.state.schema.marks.underline)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'strikethrough') {
        restoreTextSelection(editorView.current);
        toggleMark(editorView.current.state.schema.marks.strikethrough)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'subscript') {
        toggleMark(editorView.current.state.schema.marks.subscript)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'superscript') {
        toggleMark(editorView.current.state.schema.marks.superscript)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'blockquote') {
        const isBlockquote = isActiveOfParentNodeType('blockquote', editorView.current.state);
        if (isBlockquote) lift(editorView.current.state, editorView.current.dispatch);else wrapIn(editorView.current.state.schema.nodes.blockquote)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'code') {
        toggleMark(editorView.current.state.schema.marks.code)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'align' && item.value) {
        alignmentCommand(editorView.current, item.value);
      } else if (item.command === 'indent' && item.value) {
        indentCommand(editorView.current, +item.value);
      } else if (item.command === 'textIndent' && item.value) {
        textIndentCommand(editorView.current, +item.value);
      } else if (item.command === 'bulletList') {
        const listStyleType = item.value || '';
        const {
          bullet_list: bulletList,
          list_item: listItem
        } = editorView.current.state.schema.nodes;
        const attrs = useMainStore.getState().richTextAttrs;
        const textStyle = {
          color: attrs.color,
          fontsize: attrs.fontsize
        };
        toggleList(bulletList, listItem, listStyleType, textStyle)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'orderedList') {
        const listStyleType = item.value || '';
        const {
          ordered_list: orderedList,
          list_item: listItem
        } = editorView.current.state.schema.nodes;
        const attrs = useMainStore.getState().richTextAttrs;
        const textStyle = {
          color: attrs.color,
          fontsize: attrs.fontsize
        };
        toggleList(orderedList, listItem, listStyleType, textStyle)(editorView.current.state, editorView.current.dispatch);
      } else if (item.command === 'clear') {
        if (isEmptyEditorDoc(editorView.current)) {
          editorView.current.dispatch(editorView.current.state.tr.setStoredMarks([]));
        } else {
          autoSelectAll(editorView.current);
          const {
            $from,
            $to
          } = editorView.current.state.selection;
          editorView.current.dispatch(editorView.current.state.tr.removeMark($from.pos, $to.pos));
          setListStyle(editorView.current, [{
            key: 'fontsize',
            value: ''
          }, {
            key: 'color',
            value: ''
          }]);
        }
      } else if (item.command === 'link') {
        const markType = editorView.current.state.schema.marks.link;
        const {
          from,
          to
        } = editorView.current.state.selection;
        const result = findNodesWithSameMark(editorView.current.state.doc, from, to, markType);
        if (result) {
          if (item.value) {
            const mark = editorView.current.state.schema.marks.link.create({
              href: item.value,
              title: item.value
            });
            addMark(editorView.current, mark, {
              from: result.from.pos,
              to: result.to.pos + 1
            });
          } else editorView.current.dispatch(editorView.current.state.tr.removeMark(result.from.pos, result.to.pos + 1, markType));
        } else if (markActive(editorView.current.state, markType)) {
          if (item.value) {
            const mark = editorView.current.state.schema.marks.link.create({
              href: item.value,
              title: item.value
            });
            addMark(editorView.current, mark);
          } else toggleMark(markType)(editorView.current.state, editorView.current.dispatch);
        } else if (item.value) {
          autoSelectAll(editorView.current);
          toggleMark(markType, {
            href: item.value,
            title: item.value
          })(editorView.current.state, editorView.current.dispatch);
        }
      } else if (item.command === 'insert' && item.value) {
        editorView.current.dispatch(editorView.current.state.tr.insertText(item.value));
      } else if (item.command === 'replace' && item.value) {
        replaceText(editorView.current, item.value);
      }
    }
    if (isEmptyEditorDoc(editorView.current)) {
      callbacksRef.current.onPlaceholderStyle?.(readEmptyPlaceholderPatch(editorView.current));
    }
    editorView.current.focus();
    handleInput();
    handleClick();
  }, [callbacksRef, handleInput, handleClick]);

  const handleDoubleClickOn = useCallback((_view: EditorView, _pos: number, node: ProsemirrorNode, nodePos: number) => {
    if (node.type.name !== 'math') return false;
    emitter.emit(EmitterEvents.OPEN_INLINE_MATH_EDITOR, {
      elementId: elementIdRef.current,
      pos: nodePos,
      latex: node.attrs.latex as string,
      display: !!node.attrs.display
    });
    return true;
  }, []);

  const applyInlineMath = useCallback(({
    elementId: targetId,
    pos,
    latex,
    html,
    display
  }: ApplyInlineMathPayload) => {
    if (targetId !== elementIdRef.current || !editorView.current) return;
    const node = editorView.current.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'math') return;
    const tr = editorView.current.state.tr.setNodeMarkup(pos, undefined, {
      latex,
      html,
      display
    });
    editorView.current.dispatch(tr);
    handleInput();
    handleInput.flush();
  }, [handleInput]);

  const pointerSelecting = useRef(false);
  const pointerSelectRelease = useRef<(() => void) | null>(null);
  const clearPointerSelectRelease = useCallback(() => {
    if (!pointerSelectRelease.current) return;
    window.removeEventListener('mouseup', pointerSelectRelease.current, true);
    pointerSelectRelease.current = null;
  }, []);
  const maybeRevealForTextRange = useCallback((view?: EditorView) => {
    const state = view?.state ?? editorView.current?.state;
    if (!state || state.selection.empty) return;
    useMainStore.getState().revealRightPanelForTextRange();
  }, []);
  const beginPointerSelect = useCallback(() => {
    pointerSelecting.current = true;
    clearPointerSelectRelease();
    pointerSelectRelease.current = () => {
      pointerSelecting.current = false;
      clearPointerSelectRelease();
      maybeRevealForTextRange();
    };
    window.addEventListener('mouseup', pointerSelectRelease.current, true);
  }, [clearPointerSelectRelease, maybeRevealForTextRange]);

  const handleMouseup = useCallback(() => {
    pointerSelecting.current = false;
    clearPointerSelectRelease();
    maybeRevealForTextRange();
    const painter = useMainStore.getState().textFormatPainter;
    if (!painter) return;
    const {
      keep,
      ...newProps
    } = painter;
    const actions: RichTextAction[] = [{
      command: 'clear'
    }];
    for (const key of Object.keys(newProps) as TextFormatPainterKeys[]) {
      const command = key;
      const value = painter[key];
      if (value === true) actions.push({
        command
      });else if (value) actions.push({
        command,
        value
      });
    }
    execCommand({
      action: actions
    });
    if (!keep) useMainStore.getState().setTextFormatPainter(null);
  }, [execCommand, clearPointerSelectRelease, maybeRevealForTextRange]);

  const handleFocusRef = useRef(handleFocus);
  handleFocusRef.current = handleFocus;
  const handleBlurRef = useRef(handleBlur);
  handleBlurRef.current = handleBlur;
  const handleKeydownRef = useRef(handleKeydown);
  handleKeydownRef.current = handleKeydown;
  const handleClickRef = useRef(handleClick);
  handleClickRef.current = handleClick;
  const handleMouseupRef = useRef(handleMouseup);
  handleMouseupRef.current = handleMouseup;
  const updateLinkTooltipRef = useRef(updateLinkTooltip);
  updateLinkTooltipRef.current = updateLinkTooltip;
  const hideLinkTooltipRef = useRef(hideLinkTooltip);
  hideLinkTooltipRef.current = hideLinkTooltip;
  const handleDoubleClickOnRef = useRef(handleDoubleClickOn);
  handleDoubleClickOnRef.current = handleDoubleClickOn;
  const emitEmptyStateRef = useRef(emitEmptyState);
  emitEmptyStateRef.current = emitEmptyState;
  const emitDocChangeRef = useRef(emitDocChange);
  emitDocChangeRef.current = emitDocChange;
  const syncRichTextAttrsRef = useRef(syncRichTextAttrsFromView);
  syncRichTextAttrsRef.current = syncRichTextAttrsFromView;
  const handleInputRef = useRef(handleInput);
  handleInputRef.current = handleInput;
  const persistLiveEditor = () => {
    handleInputRef.current.flush();
    if (editorView.current) commitLiveEditorToStore(elementIdRef.current);
  };
  const hideLinkTooltipStableRef = useRef(hideLinkTooltip);
  hideLinkTooltipStableRef.current = hideLinkTooltip;
  const beginPointerSelectRef = useRef(beginPointerSelect);
  beginPointerSelectRef.current = beginPointerSelect;
  const maybeRevealForTextRangeRef = useRef(maybeRevealForTextRange);
  maybeRevealForTextRangeRef.current = maybeRevealForTextRange;
  const clearPointerSelectReleaseRef = useRef(clearPointerSelectRelease);
  clearPointerSelectReleaseRef.current = clearPointerSelectRelease;

  useLayoutEffect(() => {
    const mountEl = editorViewRef.current;
    if (!mountEl || editorView.current) return;
    const view = initProsemirrorEditor(mountEl, resolveEditorMountHtml(elementIdRef.current, valueRef.current), {
      handleDOMEvents: {
        focus: () => handleFocusRef.current(),
        blur: () => handleBlurRef.current(),
        keydown: (nextView, event) => handleKeydownRef.current(nextView, event),
        click: (_view: EditorView, event: MouseEvent) => {
          const anchor = hyperlinkAnchorFromEvent(event);
          if (anchor) {
            event.preventDefault();
            if (isFollowHyperlinkClick(event) && isSafeHyperlinkHref(anchor.href)) {
              openHyperlink(anchor.href);
              return true;
            }
          }
          handleClickRef.current();
          return false;
        },
        mouseover: (_view: EditorView, event: MouseEvent) => updateLinkTooltipRef.current(event),
        mouseout: (_view: EditorView, event: MouseEvent) => {
          const next = event.relatedTarget;
          const anchor = hyperlinkAnchorFromEvent(event);
          if (anchor && next instanceof Node && anchor.contains(next)) return false;
          hideLinkTooltipRef.current();
          return false;
        },
        mouseup: () => handleMouseupRef.current(),
        mousedown: (view: EditorView, event: MouseEvent) => {
          beginPointerSelectRef.current();
          forgetTextSelection(view);
          clearPendingCaret();
          const anchor = hyperlinkAnchorFromEvent(event);
          if (anchor && isFollowHyperlinkClick(event)) {
            event.preventDefault();
            return true;
          }
          return false;
        }
      },
      handleDoubleClickOn: (view, pos, node, nodePos) => handleDoubleClickOnRef.current(view, pos, node, nodePos),
      handleTextInput: (view, _from, _to, text) => {
        if (wrapEmptyAsRef.current !== 'bullet') return false;
        return insertTextAsBulletList(view, text);
      },
      editable: () => editableRef.current,
      dispatchTransaction(tr) {
        const current = editorView.current;
        if (!current) return;
        const wasEmpty = current.state.doc.textContent.trim().length === 0;
        const newState = current.state.apply(tr);
        current.updateState(newState);
        rememberTextSelection(current);
        if (wasEmpty && newState.doc.textContent.trim().length > 0) {
          callbacksRef.current.onPlaceholderFill?.();
        }
        emitEmptyStateRef.current();
        if (tr.docChanged) {
          emitDocChangeRef.current();
          commitLiveEditorToStore(elementIdRef.current, { history: false });
          handleInputRef.current();
        }
        if (!newState.selection.empty && !pointerSelecting.current) maybeRevealForTextRangeRef.current(current);
      }
    }, {
      getPlaceholderFill: () => placeholderFillStylesRef.current ?? null
    });
    editorView.current = view;
    (view.dom as HTMLElement & { __pmView?: EditorView }).__pmView = view;
    registerEditorView(elementIdRef.current, view);
    setLinkTooltipPortal(resolveFikaPortalTarget(mountEl));
    if (wrapEmptyAsRef.current === 'bullet' && view.state.doc.textContent.trim().length === 0) {
      wrapEmptyInBulletList(view);
    }
    // Editors that mount because their element was just selected (shape text)
    // missed the panel's SYNC_RICH_TEXT_ATTRS_TO_STORE emit — catch up now.
    if (useMainStore.getState().handleElementId === elementIdRef.current) {
      syncRichTextAttrsRef.current();
    }
    if (autoFocusRef.current) {
      view.focus();
      consumePendingCaret(elementIdRef.current, view);
    }
    emitEmptyStateRef.current();
    const unreg = registerCommitFlusher(persistLiveEditor);
    return () => {
      if (docChangeRaf.current) cancelAnimationFrame(docChangeRaf.current);
      const current = editorView.current;
      persistLiveEditor();
      unreg();
      if (current) {
        unregisterEditorView(elementIdRef.current, current);
        current.destroy();
        editorView.current = null;
      }
      hideLinkTooltipStableRef.current();
      clearPointerSelectReleaseRef.current();
    };
  }, []);
  const syncAttrsToStore = useCallback(() => {
    syncRichTextAttrsFromView();
  }, []);
  useLayoutEffect(() => {
    emitter.on(EmitterEvents.RICH_TEXT_COMMAND, execCommand);
    emitter.on(EmitterEvents.SYNC_RICH_TEXT_ATTRS_TO_STORE, syncAttrsToStore);
    emitter.on(EmitterEvents.APPLY_INLINE_MATH, applyInlineMath);
    return () => {
      emitter.off(EmitterEvents.RICH_TEXT_COMMAND, execCommand);
      emitter.off(EmitterEvents.SYNC_RICH_TEXT_ATTRS_TO_STORE, syncAttrsToStore);
      emitter.off(EmitterEvents.APPLY_INLINE_MATH, applyInlineMath);
    };
  }, [execCommand, syncAttrsToStore, applyInlineMath]);
  return <><div {...hostAttrs} className={cx('prosemirror-editor', className, {
      'format-painter': textFormatPainter
    })} ref={editorViewRef} onMouseDown={handleHostMouseDown} />{linkTooltip && linkTooltipPortal ? createPortal(<div className={cx("hyperlink-hover-tooltip")} role='tooltip' style={{
        left: linkTooltip.left + 'px',
        top: linkTooltip.top + 'px'
      }}><div className={cx("hyperlink-hover-tooltip__url")}>{linkTooltip.href}</div><div className={cx("hyperlink-hover-tooltip__hint")}><kbd className={cx("hyperlink-hover-tooltip__key")}>{followModifier}</kbd><span>{followLinkRest}</span></div></div>, linkTooltipPortal) : null}</>;
}), editorViewPropsEqual);

const ProsemirrorEditor = forwardRef<ProsemirrorEditorHandle, IProsemirrorEditorProps>((vrProps, expose) => {
  'use no memo';
  const {
    elementId,
    defaultColor,
    defaultFontName,
    defaultFontSize,
    defaultAlign,
    value,
    editable,
    autoFocus,
    wrapEmptyAs,
    placeholderFillStyles,
    className,
    onUpdate,
    onFocus,
    onBlur,
    onMouseDown,
    onEmptyChange,
    onPlaceholderFill,
    onDocChange,
    onPlaceholderStyle,
    ...hostAttrs
  } = vrProps;
  const callbacksRef = useRef<EditorCallbackRefs>({});
  callbacksRef.current = {
    onUpdate,
    onFocus,
    onBlur,
    onMouseDown,
    onEmptyChange,
    onPlaceholderFill,
    onDocChange,
    onPlaceholderStyle
  };
  return <ProsemirrorEditorView ref={expose} elementId={elementId} defaultColor={defaultColor} defaultFontName={defaultFontName} defaultFontSize={defaultFontSize} defaultAlign={defaultAlign} value={value} editable={editable ?? false} autoFocus={autoFocus ?? false} wrapEmptyAs={wrapEmptyAs} placeholderFillStyles={placeholderFillStyles} className={className} hostAttrs={hostAttrs} callbacksRef={callbacksRef} />;
});
export default ProsemirrorEditor;
