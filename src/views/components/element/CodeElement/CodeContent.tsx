import { bindStyles } from '@/utils/cssm'
import styles from './CodeContent.module.scss'
const cx = bindStyles(styles)
import { memo, useRef, useState, useEffect } from 'react';
import { OverlayScrollbars } from 'overlayscrollbars';
import 'overlayscrollbars/overlayscrollbars.css';

import type { PPTCodeElement } from '@/types/slides';
import { highlightCodeBlock } from '@/utils/codeHighlight';
import { isLightCodeTheme } from '@/configs/code';
import { useI18nContext } from '@/i18n/useI18nContext';
import CodeBlockSkeleton from './CodeBlockSkeleton';

export type ICodeContentProps = {
  elementInfo: PPTCodeElement;
};

const CodeContent = memo((props: ICodeContentProps) => {
  const { elementInfo } = props;
  const { LL } = useI18nContext();
  const LLRef = useRef(LL);
  LLRef.current = LL;
  const [html, setHtml] = useState('');
  const [bg, setBg] = useState(() => isLightCodeTheme(props.elementInfo.theme) ? '#ffffff' : '#0d1117');
  const [fg, setFg] = useState('#e6edf3');
  const [error, setError] = useState('');
  const renderVersion = useRef(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrollbarsRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(null);
  const code = props.elementInfo.code;
  const language = props.elementInfo.language;
  const theme = props.elementInfo.theme;
  const contentStyle = {
    backgroundColor: bg,
    color: fg,
    fontSize: props.elementInfo.fontSize + 'px'
  };

  useEffect(() => {
    const version = ++renderVersion.current;
    void (async () => {
      try {
        const result = await highlightCodeBlock(code, language, theme);
        if (version !== renderVersion.current) return;
        setHtml(result.html);
        setBg(result.bg);
        setFg(result.fg);
        setError('');
      }
      catch (err) {
        if (version !== renderVersion.current) return;
        setHtml('');
        setError(err instanceof Error ? err.message : LLRef.current.components.codeEditor.renderFailed());
      }
    })();
  }, [code, language, theme]);

  useEffect(() => {
    if (!hostRef.current) return;
    scrollbarsRef.current = OverlayScrollbars(hostRef.current, {
      overflow: { x: 'scroll', y: 'scroll' },
      scrollbars: { visibility: 'auto', autoHide: 'leave', autoHideDelay: 600 },
    });
    return () => {
      scrollbarsRef.current?.destroy();
      scrollbarsRef.current = null;
    };
  }, []);

  useEffect(() => {
    scrollbarsRef.current?.update(true);
  }, [html, elementInfo.fontSize, elementInfo.showLineNumbers, elementInfo.width, elementInfo.height]);

  return <div ref={hostRef} className={cx('code-content', { 'line-numbers': elementInfo.showLineNumbers })} style={contentStyle} data-code-scroll>
    {html ? <div className={cx('code-html')} dangerouslySetInnerHTML={{ __html: html }} /> : error ? <div className={cx('code-error')}>{error}</div> : (
      <CodeBlockSkeleton
        code={code}
        fontSize={elementInfo.fontSize}
        showLineNumbers={elementInfo.showLineNumbers}
        theme={theme}
      />
    )}
  </div>;
});
export default CodeContent;
