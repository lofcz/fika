import { bindStyles } from '@/utils/cssm'
import styles from './HitLayer.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, memo } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import type { PPTElement } from '@/types/slides'
import { clicksToEditText, DEBUG_HIT_AREAS, elementVisualHitRect, focusElementEditor, hasInteractiveSurface, HIT_RING_SIDES, hitLayerSkipRebuild, hitRectClipPath, hitRingLayout, pointInVisualHitRect, type VisualHitRect } from '@/utils/canvasHitTest'
import { queryFika } from '@/utils/portal'
import useElementContextmenu from '@/hooks/useElementContextmenu'

export type IHitLayerProps = {
  elementList: PPTElement[]
  canvasScale: number
  hiddenElementIdList: string[]
  activeElementIdList: string[]
  editingElementId: string | null
  clipingImageElementId: string
  disabled: boolean
  selectElement: (e: MouseEvent | TouchEvent, element: PPTElement, canMove?: boolean, andEdit?: boolean) => void
  beginEdit: (elementId: string, caret?: { left: number; top: number }) => void
  openLinkDialog: () => void
  className?: string
}

function areHitLayerPropsEqual(prev: IHitLayerProps, next: IHitLayerProps) {
  if (prev.className !== next.className) return false
  return hitLayerSkipRebuild(prev, next)
}

const HitLayer = memo((props: IHitLayerProps) => {
  const { disabled, className } = props
  const hitSourceRef = useRef({
    elementList: props.elementList,
    canvasScale: props.canvasScale,
    hiddenElementIdList: props.hiddenElementIdList,
    activeElementIdList: props.activeElementIdList,
    editingElementId: props.editingElementId,
    clipingImageElementId: props.clipingImageElementId,
    disabled: props.disabled,
  })
  const hitInput = {
    elementList: props.elementList,
    canvasScale: props.canvasScale,
    hiddenElementIdList: props.hiddenElementIdList,
    activeElementIdList: props.activeElementIdList,
    editingElementId: props.editingElementId,
    clipingImageElementId: props.clipingImageElementId,
    disabled: props.disabled,
  }
  if (!hitLayerSkipRebuild(hitSourceRef.current, hitInput)) hitSourceRef.current = hitInput
  const hitSource = hitSourceRef.current

  const hiddenSet = useMemo(() => new Set(hitSource.hiddenElementIdList), [hitSource.hiddenElementIdList])
  const selectedIdSet = useMemo(() => new Set(hitSource.activeElementIdList), [hitSource.activeElementIdList])
  const debugHitAreas = DEBUG_HIT_AREAS
  const hitRingSides = HIT_RING_SIDES
  const hitLayerRef = useRef<HTMLDivElement | null>(null)

  const hitRects = useMemo(() => {
    if (hitSource.disabled) return []
    const rects = []
    for (let i = 0; i < hitSource.elementList.length; i++) {
      const element = hitSource.elementList[i]
      if (hiddenSet.has(element.id)) continue
      if (element.id === hitSource.editingElementId) continue
      if (element.id === hitSource.clipingImageElementId) continue
      if (selectedIdSet.has(element.id) && element.type !== 'line') continue
      rects.push(elementVisualHitRect(element, hitSource.canvasScale, i + 1))
    }
    return rects
  }, [hitSource, hiddenSet, selectedIdSet])

  const occluderRects = useMemo(() => {
    if (hitSource.disabled || hitSource.activeElementIdList.length !== 1) return []
    const rects: VisualHitRect[] = []
    for (let i = 0; i < hitSource.elementList.length; i++) {
      const element = hitSource.elementList[i]
      if (!selectedIdSet.has(element.id)) continue
      if (element.type !== 'video' && element.type !== 'audio') continue
      if (hiddenSet.has(element.id)) continue
      rects.push(elementVisualHitRect(element, hitSource.canvasScale, i + 1))
    }
    return rects
  }, [hitSource, selectedIdSet, hiddenSet])

  const elementById = (id: string) => props.elementList.find(el => el.id === id)
  const { contextmenus: contextmenusFor } = useElementContextmenu(props.openLinkDialog)

  const contextmenusForRect = (id: string) => {
    const element = elementById(id)
    if (!element) return null
    if (!element.lock && !selectedIdSet.has(id)) {
      props.selectElement(new MouseEvent('contextmenu'), element, false)
    }
    return contextmenusFor(element, props.activeElementIdList.length > 1)
  }

  const hasRing = (id: string) => {
    const element = elementById(id)
    return !!element && hasInteractiveSurface(element)
  }
  const isMedia = (id: string) => {
    const element = elementById(id)
    return element?.type === 'video' || element?.type === 'audio'
  }

  const rectBoxStyle = (rect: VisualHitRect) => {
    const style: Record<string, string> = {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      zIndex: String(rect.zIndex),
    }
    if (rect.rotate) style.transform = `rotate(${rect.rotate}deg)`
    const clipPath = hitRectClipPath(rect, occluderRects)
    if (clipPath) style.clipPath = clipPath
    return style
  }

  const ringFor = (rect: VisualHitRect) => hitRingLayout(rect.width, rect.height)

  const isOccludedBySelectedMedia = (e: MouseEvent) => {
    const layer = hitLayerRef.current
    if (!layer) return false
    const bounds = layer.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    return occluderRects.some(hole => pointInVisualHitRect(x, y, hole))
  }

  const retargetToSelectedMedia = (e: MouseEvent) => {
    const layer = hitLayerRef.current
    if (!layer) return
    const bounds = layer.getBoundingClientRect()
    const occluder = occluderRects.find(hole => pointInVisualHitRect(e.clientX - bounds.left, e.clientY - bounds.top, hole))
    if (!occluder) return
    const root = queryFika(`#editable-element-${occluder.id}`)
    if (!(root instanceof HTMLElement)) return
    const retargetingTokens = cx('retargeting').split(/\s+/).filter(Boolean)
    layer.classList.add(...retargetingTokens)
    try {
      const target = document.elementsFromPoint(e.clientX, e.clientY).find(el => root.contains(el))
      if (!(target instanceof HTMLElement)) return
      const opts: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        detail: e.detail,
        screenX: e.screenX,
        screenY: e.screenY,
        clientX: e.clientX,
        clientY: e.clientY,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        button: e.button,
        buttons: e.buttons,
      }
      target.dispatchEvent(new MouseEvent(e.type, opts))
      if (e.type === 'mousedown') target.dispatchEvent(new MouseEvent('click', { ...opts, detail: 1 }))
    }
    finally {
      layer.classList.remove(...retargetingTokens)
    }
  }

  const stopHitEvent = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.nativeEvent.stopPropagation()
  }

  const onBorderMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    const element = elementById(id)
    if (!element || element.lock) return
    const native = e.nativeEvent
    const rect = hitRects.find(item => item.id === id)
    if (rect && isOccludedBySelectedMedia(native)) {
      stopHitEvent(e)
      retargetToSelectedMedia(native)
      return
    }
    stopHitEvent(e)
    props.selectElement(native, element, true)
  }

  const onInteriorMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    const element = elementById(id)
    if (!element || element.lock) return
    const native = e.nativeEvent
    const rect = hitRects.find(item => item.id === id)
    if (rect && isOccludedBySelectedMedia(native)) {
      stopHitEvent(e)
      retargetToSelectedMedia(native)
      return
    }
    stopHitEvent(e)
    const edit = clicksToEditText(element)
    props.selectElement(native, element, false, edit)
    if (edit) props.beginEdit(id, { left: e.clientX, top: e.clientY })
  }

  const onBodyMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    const element = elementById(id)
    if (!element || element.lock) return
    const native = e.nativeEvent
    const rect = hitRects.find(item => item.id === id)
    if (rect && isOccludedBySelectedMedia(native)) {
      stopHitEvent(e)
      retargetToSelectedMedia(native)
      return
    }
    stopHitEvent(e)
    props.selectElement(native, element, true)
  }

  const onBodyDblclick = (e: React.MouseEvent, id: string) => {
    const element = elementById(id)
    if (!element || element.lock) return
    const native = e.nativeEvent
    const rect = hitRects.find(item => item.id === id)
    if (rect && isOccludedBySelectedMedia(native)) {
      stopHitEvent(e)
      retargetToSelectedMedia(native)
      return
    }
    stopHitEvent(e)
    if (clicksToEditText(element)) {
      props.beginEdit(id, { left: e.clientX, top: e.clientY })
      return
    }
    focusElementEditor(id)
  }

  return (
    <div ref={hitLayerRef} className={cx('hit-layer', { disabled }, className)}>
      {hitRects.map(rect => !hasRing(rect.id) ? (
        <div
          key={rect.id}
          className={cx('hit-rect', { 'debug-hit': debugHitAreas })}
          style={rectBoxStyle(rect)}
          onMouseDown={e => onBodyMouseDown(e, rect.id)}
          onDoubleClick={e => onBodyDblclick(e, rect.id)}
          onContextMenu={e => {
            e.stopPropagation()
            e.preventDefault()
            openContextmenu(e, () => contextmenusForRect(rect.id))
          }}
        />
      ) : (
        <div key={rect.id} className={cx('hit-rect-wrap')} style={rectBoxStyle(rect)}>
          {hitRingSides.map(side => (
            <div
              key={side}
              className={cx('hit-border', { 'debug-hit': debugHitAreas })}
              style={ringFor(rect).sides[side]}
              onMouseDown={e => onBorderMouseDown(e, rect.id)}
              onContextMenu={e => {
                e.stopPropagation()
                e.preventDefault()
                openContextmenu(e, () => contextmenusForRect(rect.id))
              }}
            />
          ))}
          <div
            className={cx('hit-edit', { 'debug-hit-edit': debugHitAreas, 'hit-play': isMedia(rect.id) })}
            style={{ inset: ringFor(rect).inset }}
            onMouseDown={e => onInteriorMouseDown(e, rect.id)}
            onContextMenu={e => {
              e.stopPropagation()
              e.preventDefault()
              openContextmenu(e, () => contextmenusForRect(rect.id))
            }}
          />
        </div>
      ))}
    </div>
  )
}, areHitLayerPropsEqual)

HitLayer.displayName = 'HitLayer'

export default HitLayer
