import type { PPTElement } from '@/types/slides'
import { useMainStore } from '@/store'
import { isFrame, frameAncestors } from '@/utils/nestedFrames'
import { drainCommitQueue } from '@/utils/commitQueue'
import styles from './frameTitles.module.scss'
export default function MynaFrameTitles({ elements, scale, drag }: { elements: PPTElement[]; scale: number; drag: (event: MouseEvent | TouchEvent, element: PPTElement) => void }) {
  const readOnly = useMainStore(s => s.readOnly)
  const hidden = useMainStore(s => s.hiddenElementIdList)
  const selected = useMainStore(s => s.activeElementIdList)
  return <>{elements.filter(isFrame).filter(frame => (scale >= .55 || selected.includes(frame.id))).filter(frame => !hidden.includes(frame.id) && !frameAncestors(frame, elements).some(parent => hidden.includes(parent.id))).map(frame => <button key={frame.id} id={`myna-frame-title-${frame.id}`} data-myna-frame-title={frame.id} className={styles.title} style={{ left: frame.left * scale, top: frame.top * scale - 25 - frameAncestors(frame, elements).filter(parent => Math.abs(parent.top - frame.top) * scale < 25).length * 25 }} aria-pressed={selected.includes(frame.id)} onMouseDown={event => {
    event.stopPropagation(); if (event.button !== 0 || readOnly || frame.lock || frameAncestors(frame, elements).some(parent => parent.lock)) return
    drainCommitQueue(); useMainStore.getState().setActiveElementIdList([frame.id]); drag(event.nativeEvent, frame)
  }} onClick={event => { if (event.detail === 0 && !readOnly && !frame.lock && !frameAncestors(frame, elements).some(parent => parent.lock)) useMainStore.getState().setActiveElementIdList([frame.id]) }} onDoubleClick={event => event.stopPropagation()}>{frame.name || frame.id}</button>)}</>
}
