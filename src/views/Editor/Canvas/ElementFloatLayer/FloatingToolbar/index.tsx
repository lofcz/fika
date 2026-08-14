import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useEffect, type ComponentType } from 'react'

import { ElementTypes, type PPTElement } from '@/types/slides'
import TextToolbar from './TextToolbar'
import ImageToolbar from './ImageToolbar'
import ShapeToolbar from './ShapeToolbar'
import TableToolbar from './TableToolbar'
import LineToolbar from './LineToolbar'
import LatexToolbar from './LatexToolbar'
import CodeToolbar from './CodeToolbar'
import ChartToolbar from './ChartToolbar'
import { sameOffsetStyle } from '../floatCompare'

export type IFloatingToolbarProps = {
  elementInfo: PPTElement
  toolbarStyle: Record<string, string>
  onMeasure?: (width: number) => void
}

const TOOLBAR_COMPONENT_MAP: Partial<Record<ElementTypes, ComponentType<any>>> = {
  [ElementTypes.TEXT]: TextToolbar,
  [ElementTypes.IMAGE]: ImageToolbar,
  [ElementTypes.SHAPE]: ShapeToolbar,
  [ElementTypes.TABLE]: TableToolbar,
  [ElementTypes.LINE]: LineToolbar,
  [ElementTypes.CHART]: ChartToolbar,
  [ElementTypes.LATEX]: LatexToolbar,
  [ElementTypes.CODE]: CodeToolbar,
}

function floatingToolbarEqual(prev: IFloatingToolbarProps, next: IFloatingToolbarProps) {
  return (
    prev.elementInfo.id === next.elementInfo.id &&
    prev.elementInfo.type === next.elementInfo.type &&
    sameOffsetStyle(prev.toolbarStyle, next.toolbarStyle)
  )
}

const FloatingToolbar = memo((props: IFloatingToolbarProps) => {
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const onMeasureRef = useRef(props.onMeasure)
  onMeasureRef.current = props.onMeasure

  const measureToolbar = useCallback(() => {
    Promise.resolve().then(() => {
      if (toolbarRef.current) onMeasureRef.current?.(toolbarRef.current.clientWidth)
    })
  }, [])

  const Toolbar = TOOLBAR_COMPONENT_MAP[props.elementInfo.type]

  useEffect(() => {
    measureToolbar()
  }, [measureToolbar])

  return (
    <div
      ref={toolbarRef}
      className={cx('floating-toolbar')}
      style={props.toolbarStyle}
      onMouseDown={event => { event.stopPropagation() }}
    >
      {Toolbar ? <Toolbar elementInfo={props.elementInfo} onResize={measureToolbar} /> : null}
    </div>
  )
}, floatingToolbarEqual)

FloatingToolbar.displayName = 'FloatingToolbar'

export default FloatingToolbar
