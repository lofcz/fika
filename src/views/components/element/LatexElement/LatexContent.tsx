import { bindStyles } from '@/utils/cssm'
import styles from './LatexContent.module.scss'
const cx = bindStyles(styles)
import { useRef, memo, useState, useEffect, useLayoutEffect } from 'react';

import type { PPTLatexElement } from '@/types/slides';
import { LATEX_ELEMENT_FONT_SIZE, ensureMathliveReady, mathReady, renderLatexElementHtml } from '@/utils/math';

export type ILatexContentProps = {
  elementInfo: PPTLatexElement;
};

const LatexContent = memo((props: ILatexContentProps) => {
  const { elementInfo } = props;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState('');
  const [scale, setScale] = useState(1);
  const [mathLiveReady, setMathLiveReady] = useState(mathReady.value);
  const fontSize = LATEX_ELEMENT_FONT_SIZE;
  const latex = props.elementInfo.latex;
  const width = props.elementInfo.width;
  const height = props.elementInfo.height;
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  widthRef.current = width;
  heightRef.current = height;

  const paint = () => {
    setHtml(renderLatexElementHtml(latex));
  };

  const updateScale = () => {
    const el = stageRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w < 1 || h < 1) return;
    const sx = widthRef.current / w;
    const sy = heightRef.current / h;
    setScale(Math.min(sx, sy));
  };

  useEffect(() => {
    paint();
    if (!mathReady.value) {
      void ensureMathliveReady().then(() => setMathLiveReady(true));
    }
    else setMathLiveReady(true);
  }, [latex, mathLiveReady]);

  useLayoutEffect(() => {
    updateScale();
  }, [width, height, html]);

  useEffect(() => {
    void (async () => {
      await ensureMathliveReady();
      setMathLiveReady(true);
      try {
        await document.fonts.ready;
      }
      catch {  }
      paint();
      await Promise.resolve();
      updateScale();
    })();
  }, []);

  return <div className={cx('latex-content')} style={{ color: elementInfo.color }}>
    <div
      className={cx('latex-stage')}
      ref={stageRef}
      style={{ fontSize: fontSize + 'px', transform: `scale(${scale})` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  </div>;
});
export default LatexContent;
