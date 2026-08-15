import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, useEffect, useRef, memo, createElement, type CSSProperties, type ComponentType } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import { useMainStore } from '@/store'
import { ElementTypes, type PPTElement, type PPTLineElement, type PPTVideoElement, type PPTAudioElement, type PPTShapeElement, type PPTChartElement } from '@/types/slides'
import type { OperateLineHandlers, OperateResizeHandlers } from '@/types/edit'
import { canEditElementText, clicksToEditText, DEBUG_HIT_AREAS, focusElementEditor, hasInteractiveSurface, hitRingLayout, resizeHandleDirectionsFor } from '@/utils/canvasHitTest'
import ImageElementOperate from './ImageElementOperate'
import TextElementOperate from './TextElementOperate'
import ShapeElementOperate from './ShapeElementOperate'
import LineElementOperate from './LineElementOperate'
import TableElementOperate from './TableElementOperate'
import CommonElementOperate from './CommonElementOperate'
import MediaElementOperate from './MediaElementOperate'
import ContextMenuBridge, { type ElementContextmenus } from './ContextMenuBridge'
import { boxGeometryChanged } from './operateCompare'
import { operateMemoEqual } from './operateMemo'

export type IOperateProps = {
  elementInfo: PPTElement
  isSelected: boolean
  isActive: boolean
  isActiveGroupElement: boolean
  isMultiSelect: boolean
  isEditing: boolean
  rotateElement: (e: MouseEvent, element: Exclude<PPTElement, PPTChartElement | PPTLineElement | PPTVideoElement | PPTAudioElement>) => void
  scaleElement: (e: MouseEvent, element: Exclude<PPTElement, PPTLineElement>, command: OperateResizeHandlers) => void
  dragLineElement: (e: MouseEvent, element: PPTLineElement, command: OperateLineHandlers) => void
  moveShapeKeypoint: (e: MouseEvent, element: PPTShapeElement, index: number) => void
  dragElement: (e: MouseEvent | TouchEvent, element: PPTElement) => void
  beginEdit: (elementId: string, caret?: { left: number; top: number }) => void
  openLinkDialog: () => void
  className?: string
  style?: CSSProperties
}

const elementTypeMap = {
  [ElementTypes.IMAGE]: ImageElementOperate,
  [ElementTypes.TEXT]: TextElementOperate,
  [ElementTypes.SHAPE]: ShapeElementOperate,
  [ElementTypes.LINE]: LineElementOperate,
  [ElementTypes.TABLE]: TableElementOperate,
  [ElementTypes.CHART]: CommonElementOperate,
  [ElementTypes.LATEX]: CommonElementOperate,
  [ElementTypes.MERMAID]: CommonElementOperate,
  [ElementTypes.CODE]: CommonElementOperate,
  [ElementTypes.VIDEO]: MediaElementOperate,
  [ElementTypes.AUDIO]: MediaElementOperate,
}

type OperateChromeProps = IOperateProps & {
  rotateElement: IOperateProps['rotateElement']
  scaleElement: IOperateProps['scaleElement']
  dragLineElement: IOperateProps['dragLineElement']
  moveShapeKeypoint: IOperateProps['moveShapeKeypoint']
  dragElement: IOperateProps['dragElement']
  beginEdit: IOperateProps['beginEdit']
  openLinkDialog: IOperateProps['openLinkDialog']
  onContext: (e: React.MouseEvent) => void
}

const OperateChrome = memo((props: OperateChromeProps) => {
  const { isMultiSelect, isActive, className, style, onContext } = props
  const canvasScale = useMainStore(s => s.canvasScale)
  const currentOperateComponent = elementTypeMap[props.elementInfo.type] || null
  const rotate = 'rotate' in props.elementInfo ? props.elementInfo.rotate : 0
  const height = 'height' in props.elementInfo ? props.elementInfo.height : 0
  const scaleWidth = props.elementInfo.width * canvasScale
  const scaleHeight = height * canvasScale
  const debugHitAreas = DEBUG_HIT_AREAS
  const handleDirections = resizeHandleDirectionsFor(props.elementInfo)
  const ring = hitRingLayout(scaleWidth, scaleHeight, { clearResizeHandles: handleDirections })
  const borderStyle = (side: 'top' | 'bottom' | 'left' | 'right') => ring.sides[side]
  const editSurfaceStyle = { inset: ring.inset }

  const showBorderDrag = (() => {
    if (!props.isSelected || props.elementInfo.lock) return false
    if (props.isMultiSelect) return false
    return hasInteractiveSurface(props.elementInfo)
  })()
  const showBodyDrag = (() => {
    if (!props.isSelected || props.isEditing || props.elementInfo.lock) return false
    if (props.elementInfo.type === 'line') return false
    if (hasInteractiveSurface(props.elementInfo) && !props.isMultiSelect) return false
    return true
  })()
  const showEditSurface = (() => {
    if (!props.isSelected || props.isEditing || props.isMultiSelect) return false
    if (props.elementInfo.lock) return false
    return clicksToEditText(props.elementInfo)
  })()
  const isMediaElement = props.elementInfo.type === 'video' || props.elementInfo.type === 'audio'

  const boxRef = useRef<{ element: PPTElement; scale: number; selected: boolean; media: boolean; display: CSSProperties['display']; style: CSSProperties } | null>(null)
  const display = style?.display
  const prevBox = boxRef.current
  const geometryDirty = !prevBox
    || prevBox.scale !== canvasScale
    || prevBox.selected !== props.isSelected
    || prevBox.media !== isMediaElement
    || prevBox.display !== display
    || boxGeometryChanged(prevBox.element, props.elementInfo)
  if (geometryDirty) {
    const operateStyle: CSSProperties = {
      top: props.elementInfo.top * canvasScale + 'px',
      left: props.elementInfo.left * canvasScale + 'px',
      transform: `rotate(${rotate}deg)`,
      transformOrigin: `${scaleWidth / 2}px ${scaleHeight / 2}px`,
      ...style,
    }
    if ((props.isSelected || isMediaElement) && props.elementInfo.type !== 'line') {
      operateStyle.width = scaleWidth + 'px'
      operateStyle.height = scaleHeight + 'px'
    }
    boxRef.current = {
      element: props.elementInfo,
      scale: canvasScale,
      selected: props.isSelected,
      media: isMediaElement,
      display,
      style: operateStyle,
    }
  }
  const operateStyle = boxRef.current!.style

  const onBorderDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    props.dragElement(e.nativeEvent, props.elementInfo)
  }
  const onEditSurfaceMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    props.beginEdit(props.elementInfo.id, { left: e.clientX, top: e.clientY })
  }
  const onBodyDblclick = (e: React.MouseEvent) => {
    if (canEditElementText(props.elementInfo.type)) {
      props.beginEdit(props.elementInfo.id, { left: e.clientX, top: e.clientY })
      return
    }
    focusElementEditor(props.elementInfo.id)
  }

  return (
    <div id={`operate-element-${props.elementInfo.id}`} className={cx('operate', { 'multi-select': isMultiSelect && !isActive }, className)} style={operateStyle} onContextMenu={onContext}>
      {showBorderDrag ? (
        <>
          <div className={cx('operate-drag-border top', { 'debug-hit': debugHitAreas })} style={borderStyle('top')} onContextMenu={onContext} onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopPropagation(); onBorderDrag(e) }} />
          <div className={cx('operate-drag-border bottom', { 'debug-hit': debugHitAreas })} style={borderStyle('bottom')} onContextMenu={onContext} onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopPropagation(); onBorderDrag(e) }} />
          <div className={cx('operate-drag-border left', { 'debug-hit': debugHitAreas })} style={borderStyle('left')} onContextMenu={onContext} onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopPropagation(); onBorderDrag(e) }} />
          <div className={cx('operate-drag-border right', { 'debug-hit': debugHitAreas })} style={borderStyle('right')} onContextMenu={onContext} onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopPropagation(); onBorderDrag(e) }} />
        </>
      ) : null}
      {showBodyDrag ? (
        <div className={cx('operate-drag-body', { 'debug-hit': debugHitAreas })} onContextMenu={onContext} onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopPropagation(); onBorderDrag(e) }} onDoubleClick={e => { e.stopPropagation(); onBodyDblclick(e) }} />
      ) : null}
      {showEditSurface ? (
        <div className={cx('operate-edit-surface', { 'debug-hit-edit': debugHitAreas })} style={editSurfaceStyle} onContextMenu={onContext} onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopPropagation(); onEditSurfaceMouseDown(e) }} />
      ) : null}
      {props.isSelected || isMediaElement ? (
        <div className={cx('operate-handlers')}>
          {currentOperateComponent ? createElement(currentOperateComponent as ComponentType<any>, {
            elementInfo: props.elementInfo,
            handlerVisible: props.isSelected && !props.elementInfo.lock && (props.isActiveGroupElement || !props.isMultiSelect),
            rotateElement: props.rotateElement,
            scaleElement: props.scaleElement,
            dragLineElement: props.dragLineElement,
            moveShapeKeypoint: props.moveShapeKeypoint,
          }) : null}
        </div>
      ) : null}
    </div>
  )
}, operateMemoEqual)

OperateChrome.displayName = 'OperateChrome'

const latestOperateProps = new Map<string, IOperateProps>()

function readOperate(id: string) {
  return latestOperateProps.get(id)
}

function operateLatestEqual(prev: IOperateProps, next: IOperateProps) {
  latestOperateProps.set(next.elementInfo.id, next)
  return operateMemoEqual(prev, next)
}

const Operate = memo((props: IOperateProps) => {
  const id = props.elementInfo.id
  latestOperateProps.set(id, props)
  useEffect(() => () => { latestOperateProps.delete(id) }, [id])
  const contextmenusRef = useRef<ElementContextmenus | null>(null)

  const rotateElement = useCallback<IOperateProps['rotateElement']>((e, element) => {
    const latest = readOperate(id)
    if (!latest) return
    latest.rotateElement(e, latest.elementInfo as typeof element)
  }, [id])
  const scaleElement = useCallback<IOperateProps['scaleElement']>((e, _element, command) => {
    const latest = readOperate(id)
    if (!latest) return
    latest.scaleElement(e, latest.elementInfo as Exclude<PPTElement, PPTLineElement>, command)
  }, [id])
  const dragLineElement = useCallback<IOperateProps['dragLineElement']>((e, _element, command) => {
    const latest = readOperate(id)
    if (!latest) return
    latest.dragLineElement(e, latest.elementInfo as PPTLineElement, command)
  }, [id])
  const moveShapeKeypoint = useCallback<IOperateProps['moveShapeKeypoint']>((e, _element, index) => {
    const latest = readOperate(id)
    if (!latest) return
    latest.moveShapeKeypoint(e, latest.elementInfo as PPTShapeElement, index)
  }, [id])
  const dragElement = useCallback<IOperateProps['dragElement']>((e, _element) => {
    const latest = readOperate(id)
    if (!latest) return
    latest.dragElement(e, latest.elementInfo)
  }, [id])
  const beginEdit = useCallback<IOperateProps['beginEdit']>((elementId, caret) => {
    readOperate(id)?.beginEdit(elementId, caret)
  }, [id])
  const openLinkDialog = useCallback(() => {
    readOperate(id)?.openLinkDialog()
  }, [id])
  const onContext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const menus = contextmenusRef.current
    const latest = readOperate(id)
    if (!menus || !latest) return
    openContextmenu(e, () => menus(latest.elementInfo, latest.isMultiSelect))
  }, [id])

  return (
    <>
      <ContextMenuBridge openLinkDialog={openLinkDialog} menuRef={contextmenusRef} />
      <OperateChrome
        {...props}
        rotateElement={rotateElement}
        scaleElement={scaleElement}
        dragLineElement={dragLineElement}
        moveShapeKeypoint={moveShapeKeypoint}
        dragElement={dragElement}
        beginEdit={beginEdit}
        openLinkDialog={openLinkDialog}
        onContext={onContext}
      />
    </>
  )
}, operateLatestEqual)

Operate.displayName = 'Operate'

export default Operate
