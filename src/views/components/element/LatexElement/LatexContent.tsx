import { bindStyles } from '@/utils/cssm'
import styles from './LatexContent.module.scss'
const cx = bindStyles(styles)
import { useRef, memo, useState, useEffect } from 'react';

import type { PPTLatexElement } from '@/types/slides';
import { LATEX_ELEMENT_FONT_SIZE, ensureMathliveReady, mathReady, renderLatexElementHtml } from '@/utils/math';
import useLiveBoxFit from '@/views/components/element/hooks/useLiveBoxFit';

export type ILatexContentProps = {
  elementInfo: PPTLatexElement;
};

const LatexContent = memo((props: ILatexContentProps) => {
  const { elementInfo } = props;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState('');
  const [mathLiveReady, setMathLiveReady] = useState(mathReady.value);
  const latex = elementInfo.latex;

  useLiveBoxFit(stageRef, {
    width: elementInfo.width,
    height: elementInfo.height,
    contentKey: `${mathLiveReady ? '1' : '0'}\0${latex}\0${html}`,
  });

  const paint = () => {
    setHtml(renderLatexElementHtml(latex));
  };

  useEffect(() => {
    paint();
    if (!mathReady.value) {
      void ensureMathliveReady().then(() => setMathLiveReady(true));
    }
    else setMathLiveReady(true);
  }, [latex, mathLiveReady]);

  useEffect(() => {
    void (async () => {
      await ensureMathliveReady();
      setMathLiveReady(true);
      try {
        await document.fonts.ready;
      }
      catch {  }
      paint();
    })();
  }, []);

  return <div className={cx('latex-content')} style={{ color: elementInfo.color }}>
    <div
      className={cx('latex-stage')}
      ref={stageRef}
      style={{ fontSize: LATEX_ELEMENT_FONT_SIZE + 'px' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  </div>;
});
export default LatexContent;
