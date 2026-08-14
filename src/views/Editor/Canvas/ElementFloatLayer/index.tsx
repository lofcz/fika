import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useState, useCallback } from 'react'

import { useMainStore, useSlidesStore, selectFormatedAnimations } from '@/store'
import { useToolbarStoreSelect } from '@/views/Editor/Toolbar/common/handleElement'
import { ElementTypes, type PPTElement } from '@/types/slides'
import type useViewportSize from '../hooks/useViewportSize'
import { getElementRange } from '@/utils/element'
import AnimationIndex from './AnimationIndex'
import LinkHandler from './LinkHandler'
import FloatingToolbar from './FloatingToolbar/index'
import { elementListLayoutEqual } from './floatCompare'

export type IElementFloatLayerProps = {
  elementList: PPTElement[]
  canvasRef: HTMLElement | { current?: HTMLElement | null } | null
  viewportStyles: ReturnType<typeof useViewportSize>['viewportStyles']
  openLinkDialog: () => void
}

const FLOAT_LAYER_GAP = 10
const FLOATING_TOOLBAR_HEIGHT = 40
const LINK_HANDLER_HEIGHT = 30
const ROTATE_HANDLER_RESERVED_GAP = 40
const TOOLBAR_ELEMENT_TYPES: string[] = [
  ElementTypes.TEXT,
  ElementTypes.IMAGE,
  ElementTypes.SHAPE,
  ElementTypes.TABLE,
  ElementTypes.LINE,
  ElementTypes.CHART,
  ElementTypes.LATEX,
  ElementTypes.CODE,
]
const ROTATE_HANDLER_ELEMENT_TYPES: string[] = [
  ElementTypes.TEXT,
  ElementTypes.IMAGE,
  ElementTypes.SHAPE,
  ElementTypes.TABLE,
  ElementTypes.LATEX,
  ElementTypes.MERMAID,
  ElementTypes.CODE,
]
const EMPTY_FORMATED_ANIMATIONS: ReturnType<typeof selectFormatedAnimations> = []

function canvasEl(ref: IElementFloatLayerProps['canvasRef']) {
  if (!ref) return null
  if (ref instanceof Element) return ref
  if (typeof ref === 'object' && 'current' in ref) return ref.current ?? null
  return null
}

function formatedAnimationsEqual(
  prev: ReturnType<typeof selectFormatedAnimations>,
  next: ReturnType<typeof selectFormatedAnimations>,
) {
  if (prev === next) return true
  if (prev.length !== next.length) return false
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].autoNext !== next[i].autoNext) return false
    const prevAnims = prev[i].animations
    const nextAnims = next[i].animations
    if (prevAnims.length !== nextAnims.length) return false
    for (let j = 0; j < prevAnims.length; j++) {
      if (prevAnims[j].elId !== nextAnims[j].elId || prevAnims[j].id !== nextAnims[j].id) return false
    }
  }
  return true
}

function viewportStylesEqual(
  prev: IElementFloatLayerProps['viewportStyles'],
  next: IElementFloatLayerProps['viewportStyles'],
) {
  return prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height
}

function floatLayerPropsEqual(prev: IElementFloatLayerProps, next: IElementFloatLayerProps) {
  return (
    prev.openLinkDialog === next.openLinkDialog &&
    prev.canvasRef === next.canvasRef &&
    viewportStylesEqual(prev.viewportStyles, next.viewportStyles) &&
    elementListLayoutEqual(prev.elementList, next.elementList)
  )
}

const ElementFloatLayer = memo((props: IElementFloatLayerProps) => {
  const { openLinkDialog } = props
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const activeGroupElementId = useMainStore(s => s.activeGroupElementId)
  const canvasScale = useMainStore(s => s.canvasScale)
  const handleElementId = useMainStore(s => s.handleElementId)
  const hiddenElementIdList = useMainStore(s => s.hiddenElementIdList)
  const showBubbleMenu = useMainStore(s => s.showBubbleMenu)
  const toolbarState = useMainStore(s => s.toolbarState)
  const formatedAnimations = useToolbarStoreSelect(
    () => (toolbarState === 'elAnimation' ? selectFormatedAnimations(useSlidesStore.getState()) : EMPTY_FORMATED_ANIMATIONS),
    formatedAnimationsEqual,
  )
  const [floatingToolbarWidth, setFloatingToolbarWidth] = useState(100)
  const onMeasure = useCallback((value: number) => setFloatingToolbarWidth(value), [])

  const getAnimationIndexList = (element: PPTElement) => {
    const indexList = []
    for (let i = 0; i < formatedAnimations.length; i++) {
      const elIds = formatedAnimations[i].animations.map(item => item.elId)
      if (elIds.includes(element.id)) indexList.push(i)
    }
    return indexList
  }

  const animationIndexItems = (() => {
    const items = []
    for (const element of props.elementList) {
      if (hiddenElementIdList.includes(element.id)) continue
      const animationIndexList = toolbarState === 'elAnimation' ? getAnimationIndexList(element) : []
      if (!animationIndexList.length) continue
      const range = getElementRange(element)
      items.push({
        element,
        range,
        animationIndexList,
      })
    }
    return items
  })()

  const floatingToolbarTarget = (() => {
    if (!showBubbleMenu) return null
    const targetId = activeGroupElementId || (activeElementIdList.length === 1 ? activeElementIdList[0] : '')
    if (!targetId || hiddenElementIdList.includes(targetId)) return null
    const element = props.elementList.find(element => element.id === targetId) || null
    if (!element || !TOOLBAR_ELEMENT_TYPES.includes(element.type)) return null
    return element
  })()

  const floatingToolbar = (() => {
    const element = floatingToolbarTarget
    if (!element) return null
    const range = getElementRange(element)
    const showLinkHandler = handleElementId === element.id && !!element.link
    const canvas = canvasEl(props.canvasRef)
    const canvasWidth = canvas?.clientWidth || 0
    const canvasHeight = canvas?.clientHeight || 0
    const availableTop = -props.viewportStyles.top
    const availableBottom = canvasHeight - props.viewportStyles.top
    const availableLeft = -props.viewportStyles.left
    const availableRight = canvasWidth - props.viewportStyles.left
    const minLeft = availableLeft + FLOAT_LAYER_GAP
    const maxLeft = availableRight - floatingToolbarWidth - FLOAT_LAYER_GAP
    const bottomTop = range.maxY * canvasScale + FLOAT_LAYER_GAP
    const bottomHeight = FLOATING_TOOLBAR_HEIGHT + (showLinkHandler ? FLOAT_LAYER_GAP + LINK_HANDLER_HEIGHT : 0)
    const placement: 'top' | 'bottom' = canvasHeight && bottomTop + bottomHeight > availableBottom ? 'top' : 'bottom'
    const rotateHandlerGap = ROTATE_HANDLER_ELEMENT_TYPES.includes(element.type) ? ROTATE_HANDLER_RESERVED_GAP : FLOAT_LAYER_GAP
    const left = range.minX * canvasScale
    const toolbarLeft = canvasWidth ? (maxLeft < minLeft ? minLeft : Math.min(Math.max(left, minLeft), maxLeft)) : left
    const top = placement === 'bottom' ? bottomTop : range.minY * canvasScale - rotateHandlerGap - FLOATING_TOOLBAR_HEIGHT
    const toolbarTop = Math.max(availableTop + FLOAT_LAYER_GAP, top)
    return {
      element,
      range,
      placement,
      toolbarStyle: {
        left: toolbarLeft + 'px',
        top: toolbarTop + 'px',
      },
    }
  })()

  const linkHandler = (() => {
    const element = handleElementId ? props.elementList.find(item => item.id === handleElementId) || null : null
    if (!element || !element.link || hiddenElementIdList.includes(element.id)) return null
    const range = getElementRange(element)
    const canvasWidth = canvasEl(props.canvasRef)?.clientWidth || 0
    const availableLeft = -props.viewportStyles.left
    const availableRight = canvasWidth - props.viewportStyles.left
    const minLeft = availableLeft + FLOAT_LAYER_GAP
    const maxLeft = availableRight - floatingToolbarWidth - FLOAT_LAYER_GAP
    const left = range.minX * canvasScale
    const toolbarLeft = canvasWidth ? (maxLeft < minLeft ? minLeft : Math.min(Math.max(left, minLeft), maxLeft)) : left
    const toolbarBottom = floatingToolbar && floatingToolbar.element.id === element.id && floatingToolbar.placement === 'bottom'
    const top = range.maxY * canvasScale + FLOAT_LAYER_GAP + (toolbarBottom ? FLOATING_TOOLBAR_HEIGHT + FLOAT_LAYER_GAP : 0)
    return {
      element,
      handlerStyle: {
        left: toolbarLeft + 'px',
        top: top + 'px',
      },
    }
  })()

  return (
    <div className={cx('element-float-layer')}>
      {animationIndexItems.map(item => (
        <AnimationIndex
          key={item.element.id}
          elementInfo={item.element}
          range={item.range}
          indexList={item.animationIndexList}
        />
      ))}
      {floatingToolbar ? (
        <FloatingToolbar
          key={floatingToolbar.element.id}
          elementInfo={floatingToolbar.element}
          toolbarStyle={floatingToolbar.toolbarStyle}
          onMeasure={onMeasure}
        />
      ) : null}
      {linkHandler ? (
        <LinkHandler
          elementInfo={linkHandler.element}
          handlerStyle={linkHandler.handlerStyle}
          openLinkDialog={openLinkDialog}
        />
      ) : null}
    </div>
  )
}, floatLayerPropsEqual)

ElementFloatLayer.displayName = 'ElementFloatLayer'

export default ElementFloatLayer
