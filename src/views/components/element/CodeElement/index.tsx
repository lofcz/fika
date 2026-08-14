import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react';
import { nativePointerEvent, type ReactPointerEvent } from '@/utils/canvasPointer';

import { openContextmenu } from '@/utils/openContextmenu';
import type { PPTCodeElement } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import emitter, { EmitterEvents } from '@/utils/emitter';
import CodeContent from './CodeContent';

export type ICodeElementProps = {
  elementInfo: PPTCodeElement;
  selectElement: (e: MouseEvent | TouchEvent, element: PPTCodeElement, canMove?: boolean) => void;
  contextmenus: () => ContextmenuItem[] | null;
};

const CodeElement = memo((props: ICodeElementProps) => {
  const { elementInfo, contextmenus } = props;

  const handleSelectElement = useCallback((e: ReactPointerEvent) => {
    if (props.elementInfo.lock) return;
    e.stopPropagation();
    props.selectElement(nativePointerEvent(e), props.elementInfo);
  }, [props.elementInfo, props.selectElement]);

  const openEditor = useCallback(() => {
    if (props.elementInfo.lock) return;
    emitter.emit(EmitterEvents.OPEN_CODE_EDITOR, props.elementInfo.id);
  }, [props.elementInfo.lock, props.elementInfo.id]);

  return <div
    className={cx('editable-element-code', { lock: elementInfo.lock })}
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
        onDoubleClick={() => { openEditor(); }}
      >
        <CodeContent elementInfo={elementInfo} />
      </div>
    </div>
  </div>;
});
export default CodeElement;
