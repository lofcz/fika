import { bindStyles } from '@/utils/cssm'
import styles from './BaseMermaidElement.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react';
import type { PPTMermaidElement } from '@/types/slides';
import MermaidContent from './MermaidContent';

export type IBaseMermaidElementProps = {
  elementInfo: PPTMermaidElement;
};

const BaseMermaidElement = memo((props: IBaseMermaidElementProps) => {
  const { elementInfo } = props;
  return <div
    className={cx('base-element-mermaid')}
    style={{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px'
    }}
  >
    <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
      <MermaidContent elementInfo={elementInfo} />
    </div>
  </div>;
});
export default BaseMermaidElement;
