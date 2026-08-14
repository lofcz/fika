import { bindStyles } from '@/utils/cssm'
import styles from './MermaidContent.module.scss'
const cx = bindStyles(styles)
import { memo, useRef, useState, useEffect } from 'react';

import type { PPTMermaidElement } from '@/types/slides';
import { renderMermaid } from '@/utils/mermaid';
import { useI18nContext } from '@/i18n/useI18nContext';

export type IMermaidContentProps = {
  elementInfo: PPTMermaidElement;
};

const MermaidContent = memo((props: IMermaidContentProps) => {
  const { LL } = useI18nContext();
  const LLRef = useRef(LL);
  LLRef.current = LL;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const renderVersion = useRef(0);
  const code = props.elementInfo.code;
  const idRef = useRef(props.elementInfo.id);
  idRef.current = props.elementInfo.id;

  useEffect(() => {
    const version = ++renderVersion.current;
    void (async () => {
      try {
        const result = await renderMermaid(code, idRef.current);
        if (version !== renderVersion.current) return;
        setSvg(result);
        setError('');
      }
      catch (err) {
        if (version !== renderVersion.current) return;
        setSvg('');
        setError(err instanceof Error ? err.message : LLRef.current.components.mermaidEditor.renderFailed());
      }
    })();
  }, [code]);

  return <div className={cx('mermaid-content')}>
    {svg ? <div className={cx('mermaid-svg')} dangerouslySetInnerHTML={{ __html: svg }} /> : error ? <div className={cx('mermaid-error')}>{error}</div> : null}
  </div>;
});
export default MermaidContent;
