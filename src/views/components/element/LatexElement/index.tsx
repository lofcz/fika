import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react';
import { nativePointerEvent, type ReactPointerEvent } from '@/utils/canvasPointer';

import { openContextmenu } from '@/utils/openContextmenu';
import type { PPTLatexElement } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import emitter, { EmitterEvents } from '@/utils/emitter';
import LatexContent from './LatexContent';

export type ILatexElementProps = {
  elementInfo: PPTLatexElement;
  selectElement: (e: MouseEvent | TouchEvent, element: PPTLatexElement, canMove?: boolean) => void;
  contextmenus: () => ContextmenuItem[] | null;
};

const LatexElement = memo((props: ILatexElementProps) => {
  const { elementInfo, contextmenus } = props;

  const handleSelectElement = useCallback((e: ReactPointerEvent) => {
    if (props.elementInfo.lock) return;
    e.stopPropagation();
    props.selectElement(nativePointerEvent(e), props.elementInfo);
  }, [props.elementInfo, props.selectElement]);

  const openLatexEditor = useCallback(() => {
    if (props.elementInfo.lock) return;
    emitter.emit(EmitterEvents.OPEN_LATEX_EDITOR);
  }, [props.elementInfo.lock]);

  return <div
    className={cx('editable-element-latex', { lock: elementInfo.lock })}
    style={{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px'
    }}
  >
    <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
      <div
        className={cx('element-content')}
        onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openContextmenu(event, contextmenus); }}
        onMouseDown={$event => { handleSelectElement($event); }}
        onTouchStart={$event => { handleSelectElement($event); }}
        onDoubleClick={event => { event.stopPropagation(); openLatexEditor(); }}
      >
        <LatexContent elementInfo={elementInfo} />
      </div>
    </div>
  </div>;
});
export default LatexElement;
