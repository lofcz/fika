import { bindStyles } from '@/utils/cssm'
import styles from './BaseCodeElement.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react';
import type { PPTCodeElement } from '@/types/slides';
import CodeContent from './CodeContent';

export type IBaseCodeElementProps = {
  elementInfo: PPTCodeElement;
};

const BaseCodeElement = memo((props: IBaseCodeElementProps) => {
  const { elementInfo } = props;
  return <div
    className={cx('base-element-code')}
    style={{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px'
    }}
  >
    <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
      <CodeContent elementInfo={elementInfo} />
    </div>
  </div>;
});
export default BaseCodeElement;
