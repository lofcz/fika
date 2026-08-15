import { bindStyles } from '@/utils/cssm'
import styles from './MultiSelectOperate.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, useMemo, useRef } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import { useMainStore, selectHandleElement } from '@/store'
import type { PPTElement } from '@/types/slides'
import { getElementListRange, canRotateGroupElements } from '@/utils/element'
import type { OperateResizeHandlers, MultiSelectRange } from '@/types/edit'
import { DEBUG_HIT_AREAS } from '@/utils/canvasHitTest'
import useCommonOperate from '../hooks/useCommonOperate'
import ResizeHandler from './ResizeHandler'
import BorderLine from './BorderLine'
import RotateHandler from './RotateHandler'
import ContextMenuBridge, { type ElementContextmenus } from './ContextMenuBridge'
import { useLatest } from './useLatest'
import { multiSelectOperateMemoEqual } from './operateMemo'

export type IMultiSelectOperateProps = {
  elementList: PPTElement[]
  scaleMultiElement: (e: MouseEvent, range: MultiSelectRange, command: OperateResizeHandlers) => void
  rotateGroupElement: (e: MouseEvent, elements: PPTElement[]) => void
  dragElement: (e: MouseEvent | TouchEvent, element: PPTElement) => void
  openLinkDialog: () => void
}

type MultiSelectChromeProps = IMultiSelectOperateProps & {
  scaleMultiElement: IMultiSelectOperateProps['scaleMultiElement']
  rotateGroupElement: IMultiSelectOperateProps['rotateGroupElement']
  dragElement: IMultiSelectOperateProps['dragElement']
  onContext: (e: React.MouseEvent) => void
}

const MultiSelectOperateChrome = memo((props: MultiSelectChromeProps) => {
  const propsRef = useLatest(props)
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const activeGroupElementId = useMainStore(s => s.activeGroupElementId)
  const canvasScale = useMainStore(s => s.canvasScale)
  const debugHitAreas = DEBUG_HIT_AREAS

  const localActiveElementList = useMemo(
    () => props.elementList.filter(el => activeElementIdList.includes(el.id)),
    [props.elementList, activeElementIdList],
  )

  const range = useMemo(() => getElementListRange(localActiveElementList), [localActiveElementList])
  const width = (range.maxX - range.minX) * canvasScale
  const height = (range.maxY - range.minY) * canvasScale
  const { resizeHandlers, borderLines } = useCommonOperate()

  const disableResize = localActiveElementList.some(item => {
    if ((item.type === 'image' || item.type === 'shape') && !item.rotate) return false
    return true
  })
  const showRotateHandler = !activeGroupElementId && canRotateGroupElements(localActiveElementList)

  const onBorderDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = localActiveElementList[0]
    if (!target || target.lock) return
    propsRef.current.dragElement(e.nativeEvent, target)
  }

  return (
    <div
      className={cx('multi-select-operate')}
      style={{
        left: range.minX * canvasScale + 'px',
        top: range.minY * canvasScale + 'px',
        width: width + 'px',
        height: height + 'px',
      }}
      onContextMenu={props.onContext}
    >
      <div
        className={cx('operate-drag-body', { 'debug-hit': debugHitAreas })}
        onContextMenu={props.onContext}
        onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopPropagation(); onBorderDrag(e) }}
      />
      {borderLines.map(line => (
        <BorderLine key={line.type} type={line.type} />
      ))}
      <div className={cx('operate-handlers')}>
        {!disableResize ? resizeHandlers.map(point => (
          <ResizeHandler
            key={point.direction}
            type={point.direction}
            onMouseDown={e => {
              propsRef.current.scaleMultiElement(e.nativeEvent, range, point.direction)
            }}
          />
        )) : null}
        {showRotateHandler ? (
          <RotateHandler
            onMouseDown={e => {
              propsRef.current.rotateGroupElement(e.nativeEvent, localActiveElementList)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}, multiSelectOperateMemoEqual)

MultiSelectOperateChrome.displayName = 'MultiSelectOperateChrome'

let latestMultiSelectProps: IMultiSelectOperateProps | null = null

function multiSelectLatestEqual(prev: IMultiSelectOperateProps, next: IMultiSelectOperateProps) {
  latestMultiSelectProps = next
  return multiSelectOperateMemoEqual(prev, next)
}

const MultiSelectOperate = memo((props: IMultiSelectOperateProps) => {
  latestMultiSelectProps = props
  const propsRef = useLatest(props)
  const contextmenusRef = useRef<ElementContextmenus | null>(null)

  const read = () => latestMultiSelectProps || propsRef.current
  const scaleMultiElement = useCallback<IMultiSelectOperateProps['scaleMultiElement']>((e, range, command) => {
    read().scaleMultiElement(e, range, command)
  }, [])
  const rotateGroupElement = useCallback<IMultiSelectOperateProps['rotateGroupElement']>((e, elements) => {
    const latest = read()
    latest.rotateGroupElement(e, elements.map(el => latest.elementList.find(item => item.id === el.id) || el))
  }, [])
  const dragElement = useCallback<IMultiSelectOperateProps['dragElement']>((e, element) => {
    const latest = read()
    latest.dragElement(e, latest.elementList.find(el => el.id === element.id) || element)
  }, [])
  const openLinkDialog = useCallback(() => {
    read().openLinkDialog()
  }, [])
  const onContext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const menus = contextmenusRef.current
    if (!menus) return
    const latest = read()
    const activeIds = useMainStore.getState().activeElementIdList
    const handleElement = selectHandleElement(useMainStore.getState())
    const target = handleElement || latest.elementList.find(el => activeIds.includes(el.id))
    if (!target) return
    openContextmenu(e, () => menus(target, true))
  }, [])

  return (
    <>
      <ContextMenuBridge openLinkDialog={openLinkDialog} menuRef={contextmenusRef} />
      <MultiSelectOperateChrome
        {...props}
        scaleMultiElement={scaleMultiElement}
        rotateGroupElement={rotateGroupElement}
        dragElement={dragElement}
        openLinkDialog={openLinkDialog}
        onContext={onContext}
      />
    </>
  )
}, multiSelectLatestEqual)

MultiSelectOperate.displayName = 'MultiSelectOperate'

export default MultiSelectOperate
