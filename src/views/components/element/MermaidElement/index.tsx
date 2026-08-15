import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react';
import { nativePointerEvent, type ReactPointerEvent } from '@/utils/canvasPointer';

import { openContextmenu } from '@/utils/openContextmenu';
import type { PPTMermaidElement } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import emitter, { EmitterEvents } from '@/utils/emitter';
import MermaidContent from './MermaidContent';

export type IMermaidElementProps = {
  elementInfo: PPTMermaidElement;
  selectElement: (e: MouseEvent | TouchEvent, element: PPTMermaidElement, canMove?: boolean) => void;
  contextmenus: () => ContextmenuItem[] | null;
};

const MermaidElement = memo((props: IMermaidElementProps) => {
  const { elementInfo, contextmenus } = props;

  const handleSelectElement = useCallback((e: ReactPointerEvent) => {
    if (props.elementInfo.lock) return;
    e.stopPropagation();
    props.selectElement(nativePointerEvent(e), props.elementInfo);
  }, [props.elementInfo, props.selectElement]);

  const openEditor = useCallback(() => {
    if (props.elementInfo.lock) return;
    emitter.emit(EmitterEvents.OPEN_MERMAID_EDITOR, props.elementInfo.id);
  }, [props.elementInfo.lock, props.elementInfo.id]);

  return <div
    className={cx('editable-element-mermaid', { lock: elementInfo.lock })}
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
        data-live-box
        style={{ width: elementInfo.width + 'px', height: elementInfo.height + 'px' }}
        onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openContextmenu(event, contextmenus); }}
        onMouseDown={$event => { handleSelectElement($event); }}
        onTouchStart={$event => { handleSelectElement($event); }}
        onDoubleClick={() => { openEditor(); }}
      >
        <MermaidContent elementInfo={elementInfo} />
      </div>
    </div>
  </div>;
});
export default MermaidElement;
