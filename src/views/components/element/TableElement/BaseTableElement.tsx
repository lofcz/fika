import { bindStyles } from '@/utils/cssm'
import styles from './BaseTableElement.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react';
import type { PPTTableElement } from '@/types/slides';
import StaticTable from './StaticTable';

export type IBaseTableElementProps = {
  elementInfo: PPTTableElement;
};

const BaseTableElement = memo((props: IBaseTableElementProps) => {
  const { elementInfo } = props;
  return <div
    className={cx('base-element-table')}
    style={{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px'
    }}
  >
    <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
      <div className={cx('element-content')}>
        <StaticTable
          data={elementInfo.data}
          width={elementInfo.width}
          cellMinHeight={elementInfo.cellMinHeight}
          colWidths={elementInfo.colWidths}
          outline={elementInfo.outline}
          theme={elementInfo.theme}
        />
      </div>
    </div>
  </div>;
});
export default BaseTableElement;
