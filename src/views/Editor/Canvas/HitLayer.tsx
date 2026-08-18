import { bindStyles } from '@/utils/cssm'
import styles from './HitLayer.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, memo } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import type { PPTElement } from '@/types/slides'
import { clicksToEditText, collectVisualHitPlan, DEBUG_HIT_AREAS, elementHasClickableContent, focusElementEditor, hasInteractiveSurface, HIT_RING_SIDES, hitLayerSkipRebuild, hitRectClipPath, hitRingLayout, occludersAboveRect, pointInAnyVisualHitRect, pointInVisualHitRect, type VisualHitRect } from '@/utils/canvasHitTest'
import { queryFika } from '@/utils/portal'
import { useMainStore } from '@/store'
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

const EMPTY_HIT_RECTS: VisualHitRect[] = []

function areHitLayerPropsEqual(prev: IHitLayerProps, next: IHitLayerProps) {
  if (prev.className !== next.className) return false
  if (useMainStore.getState().isGesturing) return true
  return hitLayerSkipRebuild(prev, next)
}

const HitLayer = memo((props: IHitLayerProps) => {
  const { disabled, className } = props
  const isGesturing = useMainStore(s => s.isGesturing)
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
  if (!isGesturing && !hitLayerSkipRebuild(hitSourceRef.current, hitInput)) hitSourceRef.current = hitInput
  const hitSource = hitSourceRef.current

  const selectedIdSet = useMemo(() => new Set(hitSource.activeElementIdList), [hitSource.activeElementIdList])
  const debugHitAreas = DEBUG_HIT_AREAS
  const hitRingSides = HIT_RING_SIDES
  const hitLayerRef = useRef<HTMLDivElement | null>(null)

  const { hitRects, occluderRects, contentRects } = useMemo(() => {
    if (hitSource.disabled || isGesturing) return { hitRects: EMPTY_HIT_RECTS, occluderRects: EMPTY_HIT_RECTS, contentRects: EMPTY_HIT_RECTS }
    return collectVisualHitPlan(hitSource)
  }, [hitSource, isGesturing])

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
    // Empty placeholder slots are clipped by CONTENT rects (any z-order) —
    // the text the user sees always wins over the dashed frame behind it.
    const clipPath = hitRectClipPath(rect, rect.yieldToContent ? contentRects : occluderRects)
    if (clipPath) style.clipPath = clipPath
    return style
  }

  const ringFor = (rect: VisualHitRect) => hitRingLayout(rect.width, rect.height)

  const occludersOverRect = (rect: VisualHitRect) => occludersAboveRect(rect, occluderRects)

  const isOccludedByHigherSelected = (e: MouseEvent, rect: VisualHitRect) => {
    const layer = hitLayerRef.current
    if (!layer) return false
    const bounds = layer.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    return pointInAnyVisualHitRect(x, y, occludersOverRect(rect))
  }

  const retargetToSelectedMedia = (e: MouseEvent, rect: VisualHitRect) => {
    const layer = hitLayerRef.current
    if (!layer) return
    const bounds = layer.getBoundingClientRect()
    const occluder = occludersOverRect(rect).find(hole => pointInVisualHitRect(e.clientX - bounds.left, e.clientY - bounds.top, hole))
    if (!occluder || !isMedia(occluder.id)) return
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

  const absorbOccludedHit = (e: React.MouseEvent, rect?: VisualHitRect) => {
    if (!rect || !isOccludedByHigherSelected(e.nativeEvent, rect)) return false
    stopHitEvent(e)
    retargetToSelectedMedia(e.nativeEvent, rect)
    return true
  }

  /**
   * The editing (or single-selected) text element left the hit layer, so
   * clicks inside its painted box rely on the store-built occluder hole and
   * operate chrome. When those lag the painted editor (height commit
   * mid-flight, long-lived tab state), a click on the text would resolve to
   * the element underneath and steal the selection. Check the LIVE editor box
   * at event time: if the pointer is physically inside it (and it stacks
   * above the hit rect's element), retarget — editing keeps the caret,
   * selected enters edit at the click point.
   */
  const retargetEditingEditor = (e: React.MouseEvent, rectId: string): boolean => {
    const list = props.elementList
    const guardId = props.editingElementId
      || (props.activeElementIdList.length === 1 ? props.activeElementIdList[0] : null)
    if (!guardId || guardId === rectId) return false
    const guardIndex = list.findIndex(el => el.id === guardId)
    const targetIndex = list.findIndex(el => el.id === rectId)
    if (guardIndex < 0 || targetIndex < 0) return false
    // Empty placeholder slots yield to the live editor regardless of z-order.
    const targetYields = !elementHasClickableContent(list[targetIndex])
    if (guardIndex < targetIndex && !targetYields) return false
    if (!clicksToEditText(list[guardIndex])) return false
    const root = queryFika(`#editable-element-${guardId}`)
    if (!(root instanceof HTMLElement)) return false
    const box = root.querySelector('[data-live-box]') ?? root.firstElementChild
    if (!(box instanceof HTMLElement)) return false
    const r = box.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return false
    // Stop the real event AND its default (default would steal focus from the
    // editor we retarget into).
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent.stopPropagation()
    e.nativeEvent.preventDefault()
    if (props.editingElementId === guardId) {
      const retargetingTokens = cx('retargeting').split(/\s+/).filter(Boolean)
      const layer = hitLayerRef.current
      layer?.classList.add(...retargetingTokens)
      try {
        const target = document.elementsFromPoint(e.clientX, e.clientY).find(el => root.contains(el))
        if (target instanceof HTMLElement) {
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
          if (e.type === 'mousedown') {
            target.dispatchEvent(new MouseEvent('click', { ...opts, detail: 1 }))
            // Synthetic events do not move DOM focus — focus the editor so the
            // caret is live in the retargeted editor.
            const editable = target.closest('.ProseMirror')
            if (editable instanceof HTMLElement) editable.focus()
          }
        }
      }
      finally {
        layer?.classList.remove(...retargetingTokens)
      }
      return true
    }
    // Selected but not editing: enter edit where the user clicked.
    props.beginEdit(guardId, { left: e.clientX, top: e.clientY })
    return true
  }

  const onBorderMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    const element = elementById(id)
    if (!element || element.lock) return
    if (retargetEditingEditor(e, id)) return
    if (absorbOccludedHit(e, hitRects.find(item => item.id === id))) return
    stopHitEvent(e)
    props.selectElement(e.nativeEvent, element, true)
  }

  const onInteriorMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    const element = elementById(id)
    if (!element || element.lock) return
    if (retargetEditingEditor(e, id)) return
    if (absorbOccludedHit(e, hitRects.find(item => item.id === id))) return
    stopHitEvent(e)
    // Shift/ctrl clicks toggle selection membership — never enter text edit.
    const toggleModifier = e.shiftKey || e.ctrlKey || e.metaKey
    const edit = !toggleModifier && clicksToEditText(element)
    props.selectElement(e.nativeEvent, element, toggleModifier, edit)
    if (edit) props.beginEdit(id, { left: e.clientX, top: e.clientY })
  }

  const onBodyMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return
    const element = elementById(id)
    if (!element || element.lock) return
    if (retargetEditingEditor(e, id)) return
    if (absorbOccludedHit(e, hitRects.find(item => item.id === id))) return
    stopHitEvent(e)
    props.selectElement(e.nativeEvent, element, true)
  }

  const onBodyDblclick = (e: React.MouseEvent, id: string) => {
    const element = elementById(id)
    if (!element || element.lock) return
    if (retargetEditingEditor(e, id)) return
    if (absorbOccludedHit(e, hitRects.find(item => item.id === id))) return
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
