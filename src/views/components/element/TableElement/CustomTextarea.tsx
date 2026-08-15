import { bindStyles } from '@/utils/cssm'
import styles from './CustomTextarea.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, useRef, useCallback, memo, useLayoutEffect } from 'react';

import { pasteCustomClipboardString, pasteExcelClipboardString, pasteHTMLTableClipboardString } from '@/utils/clipboard';
import { editorHtmlLooksEmpty } from '@/utils/prosemirror/commitPolicy';

export type TableCellCommitSource = 'blur' | 'unmount';

export type ICustomTextareaProps = {
  value?: string;
  className?: string;
  style?: CSSProperties;
} & {
  onUpdateValue?: (payload: string) => void;
  onCommitValue?: (payload: string, source?: TableCellCommitSource) => void;
  onInsertExcelData?: (payload: string[][]) => void;
};

const CustomTextarea = memo((props: ICustomTextareaProps) => {
  const value = props.value ?? '';
  const textareaRef = useRef<HTMLDivElement | null>(null);
  const isFocusRef = useRef(false);
  const valueRef = useRef(value);
  const onUpdateValueRef = useRef(props.onUpdateValue);
  const onCommitValueRef = useRef(props.onCommitValue);
  const onInsertExcelDataRef = useRef(props.onInsertExcelData);
  valueRef.current = value;
  onUpdateValueRef.current = props.onUpdateValue;
  onCommitValueRef.current = props.onCommitValue;
  onInsertExcelDataRef.current = props.onInsertExcelData;

  const syncDom = useCallback((next: string) => {
    const el = textareaRef.current;
    if (!el) return;
    if (isFocusRef.current || document.activeElement === el) return;
    if (editorHtmlLooksEmpty(next) && !editorHtmlLooksEmpty(el.innerHTML)) return;
    if (el.innerHTML !== next) el.innerHTML = next;
  }, []);

  const setTextareaRef = useCallback((el: HTMLDivElement | null) => {
    textareaRef.current = el;
    if (!el) return;
    syncDom(valueRef.current);
    return () => {
      el.onpaste = null;
      onCommitValueRef.current?.(el.innerHTML, 'unmount');
      if (textareaRef.current === el) textareaRef.current = null;
    };
  }, [syncDom]);

  useLayoutEffect(() => {
    syncDom(value);
  }, [value, syncDom]);

  const handleInput = useCallback(() => {
    if (!textareaRef.current) return;
    onUpdateValueRef.current?.(textareaRef.current.innerHTML);
  }, []);

  const handleFocus = useCallback(() => {
    isFocusRef.current = true;
    if (!textareaRef.current) return;
    textareaRef.current.onpaste = (e: ClipboardEvent) => {
      e.preventDefault();
      if (!e.clipboardData) return;
      const clipboardDataFirstItem = e.clipboardData.items[0];
      if (clipboardDataFirstItem && clipboardDataFirstItem.kind === 'string') {
        if (clipboardDataFirstItem.type === 'text/plain') {
          clipboardDataFirstItem.getAsString(text => {
            const clipboardData = pasteCustomClipboardString(text);
            if (typeof clipboardData === 'object') return;
            const excelData = pasteExcelClipboardString(text);
            if (excelData) {
              onInsertExcelDataRef.current?.(excelData);
              if (textareaRef.current) textareaRef.current.innerHTML = excelData[0][0];
              return;
            }
            document.execCommand('insertText', false, text);
          });
        }
        else if (clipboardDataFirstItem.type === 'text/html') {
          clipboardDataFirstItem.getAsString(html => {
            const htmlData = pasteHTMLTableClipboardString(html);
            if (htmlData) {
              onInsertExcelDataRef.current?.(htmlData);
              if (textareaRef.current) textareaRef.current.innerHTML = htmlData[0][0];
            }
          });
        }
      }
    };
  }, []);

  const handleBlur = useCallback(() => {
    isFocusRef.current = false;
    const el = textareaRef.current;
    if (!el) return;
    el.onpaste = null;
    onCommitValueRef.current?.(el.innerHTML, 'blur');
  }, []);

  return <div
    className={cx('custom-textarea', props.className)}
    style={props.style}
    ref={setTextareaRef}
    contentEditable
    suppressContentEditableWarning
    onFocus={handleFocus}
    onBlur={handleBlur}
    onInput={handleInput}
  />;
});
export default CustomTextarea;
