import { bindStyles } from '@/utils/cssm'
import styles from './CustomTextarea.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, useRef, useCallback, memo, useEffect, useLayoutEffect } from 'react';

import { pasteCustomClipboardString, pasteExcelClipboardString, pasteHTMLTableClipboardString } from '@/utils/clipboard';

export type ICustomTextareaProps = {
  value?: string;
  className?: string;
  style?: CSSProperties;
} & {
  onUpdateValue?: (payload: string) => void;
  onInsertExcelData?: (payload: string[][]) => void;
};

const CustomTextarea = memo((props: ICustomTextareaProps) => {
  const value = props.value ?? '';
  const textareaRef = useRef<HTMLDivElement | null>(null);
  const isFocusRef = useRef(false);
  const valueRef = useRef(value);
  const onUpdateValueRef = useRef(props.onUpdateValue);
  const onInsertExcelDataRef = useRef(props.onInsertExcelData);
  valueRef.current = value;
  onUpdateValueRef.current = props.onUpdateValue;
  onInsertExcelDataRef.current = props.onInsertExcelData;

  const syncDom = useCallback((next: string) => {
    const el = textareaRef.current;
    if (!el) return;
    if (isFocusRef.current || document.activeElement === el) return;
    if (el.innerHTML !== next) el.innerHTML = next;
  }, []);

  const setTextareaRef = useCallback((el: HTMLDivElement | null) => {
    textareaRef.current = el;
    if (!el) return;
    syncDom(valueRef.current);
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
    if (textareaRef.current) textareaRef.current.onpaste = null;
  }, []);

  useEffect(() => () => {
    if (textareaRef.current) textareaRef.current.onpaste = null;
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
