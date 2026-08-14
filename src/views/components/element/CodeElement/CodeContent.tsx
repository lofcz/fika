import { bindStyles } from '@/utils/cssm'
import styles from './CodeContent.module.scss'
const cx = bindStyles(styles)
import { memo, useRef, useState, useEffect } from 'react';

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

  return <div className={cx('code-content', { 'line-numbers': elementInfo.showLineNumbers })} style={contentStyle}>
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
