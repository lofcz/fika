import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './SlideCodePanel.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useCallback, memo, useState, useEffect, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';

import { debounce } from '@/utils/debounce';
import { isEqual } from '@/utils/object';
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store';
import { validateSlide } from '@/views/Editor/slideValidator';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
import { copyText } from '@/utils/clipboard';
import message from '@/utils/message';
import { useI18nContext } from '@/i18n/useI18nContext';
import { findElementRange, parseAndFormatJSON } from './slideCodeUtils';
type CodeMirrorModule = typeof import('./slideCodeMirror');
type EditorViewInstance = InstanceType<CodeMirrorModule['EditorView']>;
type HighlightEffect = ReturnType<typeof import('./slideCodeMirror').StateEffect.define<import('./slideCodeMirror').ElementHighlightRange | null>>;
type Extension = import('@codemirror/state').Extension;
export type ISlideCodePanelProps = {
  height: number;
  className?: string;
  style?: CSSProperties;
} & {
  onUpdateHeight?: (payload: number) => void;
  onClose?: () => void;
};
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 480;
const MIN_CANVAS_HEIGHT = 160;
const SlideCodePanel = memo((props: ISlideCodePanelProps) => {
  const {
    LL
  } = useI18nContext();
  const currentSlide = useSlidesStore(selectCurrentSlide);
  const slideIndex = useSlidesStore(s => s.slideIndex);
  const activeElementIdList = useMainStore(s => s.activeElementIdList);
  const {
    addHistorySnapshot
  } = useHistorySnapshot();
  const panelRef = useRef<HTMLElement>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const [codeText, setCodeText] = useState('');
  const [syncState, setSyncState] = useState<'synced' | 'dirty' | 'error'>('synced');
  const [validationMessage, setValidationMessage] = useState('');
  const [highlightedElementId, setHighlightedElementId] = useState('');
  const editorViewRef = useRef<EditorViewInstance | null>(null);
  const cmRef = useRef<CodeMirrorModule | null>(null);
  const setElementHighlightEffectRef = useRef<HighlightEffect | null>(null);
  const elementHighlightFieldRef = useRef<Extension | null>(null);
  const applyingCodeToStoreRef = useRef(false);
  const updatingEditorProgrammaticallyRef = useRef(false);
  const cmLoadPromiseRef = useRef<Promise<CodeMirrorModule> | null>(null);
  const removeResizeListenersRef = useRef<(() => void) | null>(null);
  const syncStatusText = (() => {
    const t = LL.editor.slideCodePanel;
    if (syncState === 'error') return t.error();
    if (syncState === 'dirty') return t.dirty();
    return t.synced();
  })();
  const ensureCodeMirror = () => {
    if (cmRef.current) return Promise.resolve(cmRef.current);
    if (!cmLoadPromiseRef.current) {
      cmLoadPromiseRef.current = import('./slideCodeMirror').then(mod => {
        cmRef.current = mod;
        setElementHighlightEffectRef.current = mod.StateEffect.define<{
          from: number;
          to: number;
        } | null>();
        elementHighlightFieldRef.current = mod.createElementHighlightField(setElementHighlightEffectRef.current);
        return mod;
      });
    }
    return cmLoadPromiseRef.current;
  };
  const clearElementHighlight = useCallback(() => {
    setHighlightedElementId('');
    if (!editorViewRef.current || !setElementHighlightEffectRef.current) return;
    editorViewRef.current.dispatch({
      effects: setElementHighlightEffectRef.current.of(null)
    });
  }, [highlightedElementId]);
  const markCodeAsChanged = useCallback(() => {
    setHighlightedElementId('');
    setSyncState('dirty');
    setValidationMessage('');
    scheduleApplyCode();
  }, [highlightedElementId, syncState, validationMessage]);
  const handleEditorUpdate = useCallback((update: {
    docChanged: boolean;
    state: {
      doc: {
        toString: () => string;
      };
    };
  }) => {
    if (!update.docChanged || updatingEditorProgrammaticallyRef.current) return;
    setCodeText(update.state.doc.toString());
    markCodeAsChanged();
  }, [codeText, markCodeAsChanged]);
  const handleFocus = useCallback(() => useMainStore.getState().setDisableHotkeysState(true), []);
  const handleBlur = useCallback(() => {
    useMainStore.getState().setDisableHotkeysState(false);
    scheduleApplyCode.cancel();
    if (syncState === 'dirty') applyCodeToSlide();
  }, [syncState]);
  const createEditorState = useCallback((doc: string) => {
    const cm = cmRef.current;
    const elementHighlightField = elementHighlightFieldRef.current;
    if (!cm || !elementHighlightField) throw new Error('CodeMirror is not loaded');
    return cm.EditorState.create({
      doc,
      extensions: [cm.keymap.of([{
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          scheduleApplyCode.cancel();
          applyCodeToSlide();
          return true;
        }
      }, {
        key: 'Shift-Alt-f',
        preventDefault: true,
        run: () => {
          formatJSON();
          return true;
        }
      }, cm.indentWithTab]), cm.basicSetup, cm.json(), cm.EditorState.tabSize.of(2), cm.indentUnit.of('  '), elementHighlightField, cm.EditorView.updateListener.of(handleEditorUpdate), cm.EditorView.domEventHandlers({
        focus: () => {
          handleFocus();
          return false;
        },
        blur: () => {
          handleBlur();
          return false;
        }
      }), cm.EditorView.contentAttributes.of({
        'aria-label': LL.editor.slideCodePanel.ariaLabel(),
        'aria-multiline': 'true',
        'autocapitalize': 'off',
        'autocomplete': 'off',
        'spellcheck': 'false'
      }), cm.EditorView.theme({
        '&': {
          height: '100%',
          backgroundColor: '#f8f9fb',
          color: '#383a42',
          fontSize: '12px'
        },
        '&.cm-focused': {
          outline: 'none'
        },
        '.cm-scroller': {
          fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace",
          lineHeight: '1.55'
        },
        '.cm-content': {
          minHeight: '100%',
          padding: '10px 0',
          caretColor: '#333'
        },
        '.cm-line': {
          padding: '0 12px 0 8px'
        },
        '.cm-gutters': {
          borderRight: '1px solid #e6e6e6',
          backgroundColor: '#f8f9fb',
          color: '#999'
        },
        '.cm-activeLine, .cm-activeLineGutter': {
          backgroundColor: 'rgba(24, 24, 27, 0.05)'
        },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
          backgroundColor: 'rgba(24, 24, 27, 0.14) !important'
        },
        '.cm-foldPlaceholder': {
          border: '1px solid #d9d9d9',
          backgroundColor: '#fff',
          color: '#777'
        },
        '.cm-element-highlight': {
          borderRadius: '2px',
          backgroundColor: 'rgba(24, 24, 27, 0.12)',
          boxShadow: '0 0 0 1px rgba(24, 24, 27, 0.28)'
        }
      })]
    });
  }, [handleEditorUpdate, handleFocus, handleBlur, LL?.editor?.slideCodePanel]);
  const replaceEditorText = useCallback((text: string, resetState = false) => {
    setCodeText(text);
    const editorView = editorViewRef.current;
    const cm = cmRef.current;
    if (!editorView || !cm) return;
    updatingEditorProgrammaticallyRef.current = true;
    try {
      if (resetState) {
        editorView.setState(createEditorState(text));
        return;
      }
      const currentText = editorView.state.doc.toString();
      if (currentText === text) return;
      const selection = editorView.state.selection.main;
      editorView.dispatch({
        changes: {
          from: 0,
          to: currentText.length,
          insert: text
        },
        selection: {
          anchor: Math.min(selection.anchor, text.length),
          head: Math.min(selection.head, text.length)
        },
        annotations: cm.Transaction.addToHistory.of(false)
      });
    } finally {
      updatingEditorProgrammaticallyRef.current = false;
    }
  }, [codeText, createEditorState]);
  const focusElementCode = useCallback(async (elementId: string) => {
    setHighlightedElementId(elementId);
    await ensureCodeMirror();
    await ensureEditorMounted();
    const range = findElementRange(codeText, elementId);
    const editorView = editorViewRef.current;
    const cm = cmRef.current;
    const setElementHighlightEffect = setElementHighlightEffectRef.current;
    if (!range || !editorView || !cm || !setElementHighlightEffect) {
      clearElementHighlight();
      return;
    }
    const line = editorView.state.doc.lineAt(range.start);
    const targetFoldRange = cm.foldable(editorView.state, line.from, line.to);
    const effects: unknown[] = [setElementHighlightEffect.of({
      from: range.start,
      to: range.end
    })];
    cm.foldedRanges(editorView.state).between(0, editorView.state.doc.length, (from, to) => {
      const containsTargetStart = from <= range.start && to >= range.start;
      const isTargetFold = targetFoldRange?.from === from && targetFoldRange.to === to;
      if (containsTargetStart || isTargetFold) effects.push(cm.unfoldEffect.of({
        from,
        to
      }));
    });
    effects.push(cm.EditorView.scrollIntoView(range.start, {
      y: 'center'
    }));
    editorView.dispatch({
      selection: {
        anchor: range.start
      },
      effects: effects as never
    });
  }, [highlightedElementId, codeText, clearElementHighlight]);
  const syncCodeFromStore = useCallback((preserveElementHighlight = true) => {
    replaceEditorText(JSON.stringify(currentSlide, null, 2), true);
    setSyncState('synced');
    setValidationMessage('');
    if (preserveElementHighlight && highlightedElementId) {
      Promise.resolve().then(() => focusElementCode(highlightedElementId));
    } else {
      setHighlightedElementId('');
    }
  }, [replaceEditorText, currentSlide, syncState, validationMessage, highlightedElementId, focusElementCode]);
  function applyCodeToSlide() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(codeText);
    } catch (error) {
      setSyncState('error');
      setValidationMessage(error instanceof Error ? error.message : LL.editor.slideCodePanel.parseFailed());
      return;
    }
    const validation = validateSlide(parsed);
    if (validation.ok === false) {
      setSyncState('error');
      setValidationMessage(validation.message);
      return;
    }
    const slideChanged = !isEqual(currentSlide, validation.slide);
    if (slideChanged) {
      applyingCodeToStoreRef.current = true;
      useSlidesStore.getState().replaceSlide(validation.slide);
      const elementIds = new Set(validation.slide.elements.map(element => element.id));
      const nextActiveElementIds = activeElementIdList.filter(id => elementIds.has(id));
      if (nextActiveElementIds.length !== activeElementIdList.length) {
        useMainStore.getState().setActiveElementIdList(nextActiveElementIds);
      }
      addHistorySnapshot();
    }
    replaceEditorText(JSON.stringify(parsed, null, 2));
    setSyncState('synced');
    setValidationMessage('');
    Promise.resolve().then(() => {
      applyingCodeToStoreRef.current = false;
      if (highlightedElementId) focusElementCode(highlightedElementId);
    });
  }
  const scheduleApplyCode = debounce(applyCodeToSlide, 500, {
    trailing: true
  });
  const formatJSON = useCallback(() => {
    scheduleApplyCode.cancel();
    const result = parseAndFormatJSON(codeText);
    if (result.success === false) {
      setSyncState('error');
      setValidationMessage(result.message);
      message.error(LL.editor.slideCodePanel.formatFailed());
      return;
    }
    replaceEditorText(result.formatted);
    applyCodeToSlide();
  }, [codeText, syncState, validationMessage, LL?.editor?.slideCodePanel, replaceEditorText]);
  const copyJSON = useCallback(async () => {
    try {
      await copyText(codeText);
      message.success(LL.editor.slideCodePanel.copySuccess());
    } catch {
      message.error(LL.editor.slideCodePanel.copyFailed());
    }
  }, [codeText, LL?.editor?.slideCodePanel]);
  const resize = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    const startPageY = event.pageY;
    const originHeight = props.height;
    const canvas = panelRef.current?.parentElement?.querySelector<HTMLElement>('.center-body');
    const maxHeightByCanvas = originHeight + Math.max(0, (canvas?.offsetHeight || 0) - MIN_CANVAS_HEIGHT);
    const maxHeight = Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, maxHeightByCanvas));
    const handleMousemove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, originHeight - (moveEvent.pageY - startPageY)));
      props.onUpdateHeight?.(nextHeight);
      editorViewRef.current?.requestMeasure();
    };
    const handleMouseup = () => removeResizeListenersRef.current?.();
    removeResizeListenersRef.current?.();
    removeResizeListenersRef.current = () => {
      document.removeEventListener('mousemove', handleMousemove);
      document.removeEventListener('mouseup', handleMouseup);
      removeResizeListenersRef.current = null;
    };
    document.addEventListener('mousemove', handleMousemove);
    document.addEventListener('mouseup', handleMouseup);
  }, [props.height, props.onUpdateHeight]);
  const ensureEditorMounted = useCallback(async () => {
    const mod = await ensureCodeMirror();
    if (editorViewRef.current || !editorHostRef.current) return;
    editorViewRef.current = new mod.EditorView({
      state: createEditorState(codeText || JSON.stringify(currentSlide, null, 2)),
      parent: editorHostRef.current
    });
  }, [createEditorState, codeText, currentSlide]);
  useEffect(() => {
    scheduleApplyCode.cancel();
    syncCodeFromStore(false);
  }, [slideIndex]);
  useEffect(() => {
    if (applyingCodeToStoreRef.current || syncState !== 'synced') return;
    syncCodeFromStore();
  }, [currentSlide]);
  useEffect(() => {
    if (activeElementIdList.length === 1) focusElementCode(activeElementIdList[0]);else clearElementHighlight();
  }, [activeElementIdList]);
  useEffect(() => { Promise.resolve().then(() => editorViewRef.current?.requestMeasure()) }, [props.height]);
  useEffect(() => {
    void (async () => {
      syncCodeFromStore(false);
      await ensureEditorMounted();
    })();
  }, []);
  useEffect(() => () => { (() => {
    scheduleApplyCode.cancel();
    removeResizeListenersRef.current?.();
    editorViewRef.current?.destroy();
    editorViewRef.current = null;
    useMainStore.getState().setDisableHotkeysState(false);
  })() }, []);
  return (
    <section
      className={cx('slide-code-panel', props.className)}
      style={props.style}
      ref={panelRef}
      aria-label={LL.editor.slideCodePanel.ariaLabel()}
    >
      <div className={cx('resize-handler')} onMouseDown={event => resize(event)} />

      <div className={cx('panel-header')}>
        <div className={cx('panel-title')}>
          <Icon icon="code" />
          <span>{LL.editor.slideCodePanel.title({ index: slideIndex + 1 })}</span>
          <span
            className={cx('sync-status', syncState)}
            title={validationMessage}
          >{syncStatusText}</span>
        </div>
        <div className={cx('panel-actions')}>
          <button
            className={cx('action-btn')}
            type="button"
            title={LL.editor.slideCodePanel.formatTooltip()}
            onClick={() => formatJSON()}
          >
            <Icon icon="braces" />
            <span>{LL.editor.slideCodePanel.format()}</span>
          </button>
          <button
            className={cx('action-btn')}
            type="button"
            title={LL.editor.slideCodePanel.copyTooltip()}
            onClick={() => copyJSON()}
          >
            <Icon icon="copy" />
            <span>{LL.editor.slideCodePanel.copy()}</span>
          </button>
          <button
            className={cx('action-btn', 'collapse-btn')}
            type="button"
            title={LL.editor.slideCodePanel.closeTooltip()}
            onClick={() => props.onClose?.()}
          >
            <Icon icon="chevron-down" />
            <span>{LL.editor.slideCodePanel.close()}</span>
          </button>
        </div>
      </div>

      <div className={cx('code-editor')}>
        <div ref={editorHostRef} className={cx('code-editor-host')} />
      </div>
    </section>
  )
})
export default SlideCodePanel
