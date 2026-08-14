import { bindStyles } from '@/utils/cssm'
import styles from './BaseLatexElement.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react';
import type { PPTLatexElement } from '@/types/slides';
import LatexContent from './LatexContent';

export type IBaseLatexElementProps = {
  elementInfo: PPTLatexElement;
};

const BaseLatexElement = memo((props: IBaseLatexElementProps) => {
  const { elementInfo } = props;
  return <div
    className={cx('base-element-latex')}
    style={{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px'
    }}
  >
    <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
      <LatexContent elementInfo={elementInfo} />
    </div>
  </div>;
});
export default BaseLatexElement;
