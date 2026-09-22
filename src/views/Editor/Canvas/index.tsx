import { recordRender } from '@/utils/renderMetrics'
import MynaFrameTitles from '@/views/Myna/MynaFrameTitles'
import { frameDomClip } from '@/utils/frameDomClip'
import MynaPageCanvas, { useMynaPageOrigin } from '@/views/Myna/MynaPageCanvas'
import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import { useMainStore, useSlidesStore, useKeyboardStore, selectCurrentSlide, selectCtrlOrShiftKeyActive } from '@/store'
import { useToolbarStoreSelect } from '@/views/Editor/Toolbar/common/handleElement'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import type { PPTElement, PPTShapeElement } from '@/types/slides'
import type { AlignmentLineProps, CreateCustomShapeData } from '@/types/edit'
import { SlideScaleContext } from '@/types/injectKey'
import { removeAllRanges } from '@/utils/selection'
import { clientToCanvas } from '@/utils/canvasPointer'
import { clicksToEditText, collectVisualHitPlan, focusElementEditor, hasInteractiveSurface, hitTestOperateTarget, hitTestVisualRects, pointInAnyVisualHitRect, pointInVisualHitRect, resizeHandleDirectionsFor, retryPendingCaret, type ClientCoords, type VisualHitRect } from '@/utils/canvasHitTest'
import { layerStackAtPoint, nextSelectableLayer, type LayerStackEntry } from '@/utils/layerStack'
import { drainCommitQueue, registerAfterCommitDrain } from '@/utils/commitQueue'
import { richTextAttrsFromElement } from '@/utils/prosemirror/richTextAttrsFromElement'
import { KEYS } from '@/configs/hotkey'
import { getElementRange } from '@/utils/element'
import { boxesNear, buildSnapIndex } from '@/utils/spatial'
import { collectCtrlMeasures, snapQueryPad, unionBoxes } from '@/utils/snap'
import useViewportSize from './hooks/useViewportSize'
import useOperateChrome from './hooks/useOperateChrome'
import useMouseSelection from './hooks/useMouseSelection'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useDrop from './hooks/useDrop'
import useRotateElement from './hooks/useRotateElement'
import useRotateGroupElement from './hooks/useRotateGroupElement'
import useScaleElement from './hooks/useScaleElement'
import useSelectAndMoveElement from './hooks/useSelectElement'
import useDragElement from './hooks/useDragElement'
import useDragLineElement from './hooks/useDragLineElement'
import useMoveShapeKeypoint from './hooks/useMoveShapeKeypoint'
import useInsertFromCreateSelection from './hooks/useInsertFromCreateSelection'
import useDeleteElement from '@/hooks/useDeleteElement'
import useCopyAndPasteElement from '@/hooks/useCopyAndPasteElement'
import useSelectElement from '@/hooks/useSelectElement'
import useScaleCanvas from '@/hooks/useScaleCanvas'
import { wheelDeltaToZoom } from '@/utils/canvasZoom'
import useScreening from '@/hooks/useScreening'
import useSlideHandler from '@/hooks/useSlideHandler'
import useCreateElement, { takePendingCreatedTextId } from '@/hooks/useCreateElement'
import EditableElement from './EditableElement'
import MouseSelection from './MouseSelection'
import ViewportBackground from './ViewportBackground'
import SlideSkeleton from '@/views/components/SlideSkeleton'
import AiRevealBadge from './AiRevealBadge'
import ElementFloatLayer from './ElementFloatLayer/index'
import AlignmentLine from './AlignmentLine'
import Ruler from './Ruler'
import MynaRulers from './MynaRulers'
import type { MynaViewState } from '@/views/Myna/viewStore'
import CanvasScrollbars from './CanvasScrollbars'
import ElementCreateSelection from './ElementCreateSelection'
import ShapeCreateCanvas from './ShapeCreateCanvas'
import MultiSelectOperate from './Operate/MultiSelectOperate'
import Operate from './Operate/index'
import HitLayer from './HitLayer'
import LayerStackPanel from './LayerStackPanel'
import LinkDialog from './LinkDialog'
import Modal from '@/components/Modal'
import { fillPhotoFrame } from '@/views/Myna/photoFrames'
import { loadPhotoFrameImage } from '@/views/Myna/photoFrameUpload'
import { photoFrameLabels } from '@/views/Myna/photoFrameLabels'
import { getFikaLocale } from '@/i18n/locale'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'
import { classifyElementListSync, patchEditingElementChrome, snapSlideElements, slideElementsSnapEqual } from './elementListSync'

const WHEEL_PAGE_STEP = 100

const OPERATE_CHROME_SELECTOR = [
  '.operate-drag-border',
  '.operate-drag-body',
  '.operate-edit-surface',
  '.resize-handler',
  '.rotate-handler',
  '.border-line',
  '.multi-select-operate',
  '.operate-keypoint-handler',
  '.operate-resize-handler',
  '.operate-rotate-handler',
  '.element-float-layer',
  '.floating-toolbar',
  '.link-handler',
  '.ProseMirror',
  '.is-editing',
  '.media-player-host',
  '.scrollbar-track',
  '.scrollbar-thumb',
  '.ruler',
].join(',')

const isOperateChromeTarget = (target: EventTarget | null) => (
  target instanceof Element && !!target.closest(OPERATE_CHROME_SELECTOR)
)

/**
 * Full-box surfaces of a selected element's operate chrome. They physically
 * cover the hit layer, so shift/ctrl selection-toggle clicks aimed at other
 * elements under or over the selected box must be arbitrated by z-order
 * instead of being absorbed by the chrome. Handles/toolbars keep priority.
 */
const SELECTION_TOGGLE_SURFACE_SELECTOR = [
  '.operate-drag-border',
  '.operate-drag-body',
  '.operate-edit-surface',
].join(',')

const isSelectionToggleSurface = (target: EventTarget | null) => (
  target instanceof Element && target.matches(SELECTION_TOGGLE_SURFACE_SELECTOR)
)

const HIDDEN_STYLE: CSSProperties = { display: 'none' }

const cloneElements = (elements: PPTElement[]): PPTElement[] => elements.slice()

type LayerStackState = {
  /** Canvas-root-relative anchor of the probed point, in px. */
  anchor: { x: number; y: number }
  entries: LayerStackEntry[]
  activeIndex: number
}

/** Alt+Click within this distance still counts as a click, not a drag. */
const LAYER_CYCLE_CLICK_SLOP_PX = 4

const findViewportWrapper = (from: EventTarget | null, canvas: HTMLElement | null): HTMLElement | null => {
  if (from instanceof Element) {
    const closest = from.closest('.viewport-wrapper')
    if (closest instanceof HTMLElement) return closest
  }
  const scoped = canvas?.querySelector('.viewport-wrapper')
  return scoped instanceof HTMLElement ? scoped : null
}

const Canvas = memo(({ className, style, allowOverflow = false, mynaView }: { className?: string; style?: CSSProperties; allowOverflow?: boolean; mynaView?: MynaViewState }) => {
  recordRender('Canvas')
  const { LL } = useI18nContext()
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const activeGroupElementId = useMainStore(s => s.activeGroupElementId)
  const handleElementId = useMainStore(s => s.handleElementId)
  const hiddenElementIdList = useMainStore(s => s.hiddenElementIdList)
  const showRuler = useMainStore(s => s.showRuler)
  const creatingElement = useMainStore(s => s.creatingElement)
  const creatingCustomShape = useMainStore(s => s.creatingCustomShape)
  const canvasScale = useMainStore(s => s.canvasScale)
  const clipingImageElementId = useMainStore(s => s.clipingImageElementId)
  const editingElementId = useMainStore(s => s.editingElementId)
  const currentSnap = useToolbarStoreSelect(
    () => snapSlideElements(selectCurrentSlide(useSlidesStore.getState())),
    (prev, next) => slideElementsSnapEqual(prev, next, useMainStore.getState().editingElementId),
  )
  const currentSlide = currentSnap
    ? selectCurrentSlide(useSlidesStore.getState())
    : undefined
  const skeletonSlide = useSlidesStore(s => !!selectCurrentSlide(s)?.skeleton)
  const readOnly = useMainStore(s => s.readOnly)
  const spaceKeyState = useKeyboardStore(s => s.spaceKeyState)
  const ctrlKeyState = useKeyboardStore(s => s.ctrlKeyState)
  const gesturingState = useMainStore(s => s.isGesturing)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const { operateLineColor, operateLineHalo } = useOperateChrome()

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [alignmentLines, setAlignmentLines] = useState<AlignmentLineProps[]>([])

  const beginEdit = useCallback((elementId: string, caret?: ClientCoords) => {
    const main = useMainStore.getState()
    if (!elementId) {
      drainCommitQueue()
      return
    }
    if (main.editingElementId && main.editingElementId !== elementId) drainCommitQueue()
    const slide = selectCurrentSlide(useSlidesStore.getState())
    const el = slide?.elements.find(item => item.id === elementId)
    const attrs = el ? richTextAttrsFromElement(el) : null
    if (main.editingElementId !== elementId || !main.disableHotkeys) {
      useMainStore.setState({
        editingElementId: elementId,
        disableHotkeys: true,
        ...(attrs ? { richTextAttrs: attrs } : {}),
      })
    }
    else if (attrs) {
      main.setRichtextAttrs(attrs)
    }
    Promise.resolve().then(() => {
      focusElementEditor(elementId, caret)
      requestAnimationFrame(() => retryPendingCaret(elementId))
    })
  }, [])

  const [linkDialogVisible, setLinkDialogVisible] = useState(false)
  const openLinkDialog = useCallback(() => setLinkDialogVisible(true), [])

  const skipHandleElementMount = useRef(true)
  useEffect(() => {
    if (skipHandleElementMount.current) {
      skipHandleElementMount.current = false
      return
    }
    useMainStore.getState().setActiveGroupElementId('')
  }, [handleElementId])

  const [elementList, setElementList] = useState<PPTElement[]>(() => (
    currentSlide ? cloneElements(currentSlide.elements) : []
  ))
  const prevSlideRef = useRef(currentSnap)

  const syncElementListFromStore = useCallback(() => {
    const storeSlide = selectCurrentSlide(useSlidesStore.getState())
    prevSlideRef.current = snapSlideElements(storeSlide)
    setElementList(storeSlide ? cloneElements(storeSlide.elements) : [])
  }, [])

  useEffect(() => registerAfterCommitDrain(syncElementListFromStore), [syncElementListFromStore])

  const liveSnap = currentSnap
  const prevSnap = prevSlideRef.current
  if (prevSnap?.id !== liveSnap?.id) {
    prevSlideRef.current = liveSnap
    setElementList(currentSlide ? cloneElements(currentSlide.elements) : [])
  }
  else if (prevSnap?.elements !== liveSnap?.elements) {
    const liveSlide = currentSlide
    const prevSlide = liveSlide
      ? { ...liveSlide, elements: prevSnap.elements }
      : undefined
    prevSlideRef.current = liveSnap
    const liveEditingId = useMainStore.getState().editingElementId
    const action = classifyElementListSync(prevSlide, liveSlide, liveEditingId)
    if (action === 'replace') {
      setElementList(liveSlide ? cloneElements(liveSlide.elements) : [])
    }
    else if (action === 'patch-chrome' && liveSlide && liveEditingId) {
      const storeEl = liveSlide.elements.find(el => el.id === liveEditingId)
      if (storeEl) setElementList(list => patchEditingElementChrome(list, storeEl))
    }
  }

  useEffect(() => {
    if (editingElementId && !activeElementIdList.includes(editingElementId)) {
      drainCommitQueue()
    }
  }, [activeElementIdList, editingElementId])

  useEffect(() => {
    const id = takePendingCreatedTextId()
    if (id) beginEdit(id)
  }, [activeElementIdList, beginEdit])

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { dragViewport, panViewport, rebaseViewport, viewportStyles } = useViewportSize(canvasRef)
  useMynaPageOrigin(!!mynaView, rebaseViewport, viewportStyles, canvasRef)

  const { addHistorySnapshot } = useHistorySnapshot()
  useDrop(canvasRef, event => {
    const file = event.dataTransfer?.files[0]
    if (!file || !viewportRef.current || readOnly) return false
    const point = clientToCanvas(event, viewportRef.current, canvasScale)
    const state = useSlidesStore.getState()
    const page = state.slides[state.slideIndex]
    const target = layerStackAtPoint(page.elements, 1, useMainStore.getState().hiddenElementIdList, point.x, point.y)[0]?.element
    if (target?.type !== 'image' || !target.photoFrame) return false
    event.preventDefault(); event.stopPropagation()
    if (target.lock) return true
    void loadPhotoFrameImage(file).then(({ src, width, height }) => {
      const store = useSlidesStore.getState()
      const latest = store.slides.find(slide => slide.id === page.id)?.elements.find(element => element.id === target.id)
      if (useMainStore.getState().readOnly || latest?.type !== 'image' || !latest.photoFrame || latest.lock || latest.src !== target.src) return
      drainCommitQueue()
      store.updateElement({ id: latest.id, slideId: page.id, props: fillPhotoFrame(latest, src, width, height) })
      addHistorySnapshot()
    }).catch(() => message.error((photoFrameLabels[getFikaLocale()] || photoFrameLabels.en).error))
    return true
  })

  const { mouseSelection, mouseSelectionVisible, updateMouseSelection } = useMouseSelection(elementList, viewportRef)
  const { dragElement } = useDragElement(elementList, setElementList, alignmentLines, setAlignmentLines, canvasScale, mynaView)
  const { dragLineElement } = useDragLineElement(elementList, setElementList)
  const { selectElement } = useSelectAndMoveElement(elementList, dragElement)
  const { scaleElement, scaleMultiElement } = useScaleElement(elementList, setElementList, canvasScale)
  const { rotateElement } = useRotateElement(elementList, setElementList, viewportRef, canvasScale)
  const { rotateGroupElement } = useRotateGroupElement(elementList, setElementList, viewportRef, canvasScale)
  const { moveShapeKeypoint } = useMoveShapeKeypoint(elementList, setElementList, canvasScale)
  const { selectAllElements } = useSelectElement()
  const { deleteAllElements } = useDeleteElement()
  const { pasteElement } = useCopyAndPasteElement()
  const { enterScreeningFromStart } = useScreening()
  const { updateSlideIndex } = useSlideHandler()
  const { createTextElement, createShapeElement } = useCreateElement()

  useEffect(() => {
    if (useMainStore.getState().activeElementIdList.length) {
      Promise.resolve().then(() => useMainStore.getState().setActiveElementIdList([]))
    }
  }, [])

  const [layerStack, setLayerStack] = useState<LayerStackState | null>(null)
  const layerStackRef = useRef(layerStack)
  layerStackRef.current = layerStack
  const closeLayerStack = useCallback(() => setLayerStack(null), [])

  const currentSlideId = currentSlide?.id
  useEffect(() => {
    setLayerStack(null)
  }, [currentSlideId, canvasScale])

  const applyLayerStackSelection = useCallback((entry: LayerStackEntry, memberIds: string[]) => {
    const main = useMainStore.getState()
    if (main.editingElementId) drainCommitQueue()
    const attrs = richTextAttrsFromElement(entry.element)
    useMainStore.setState({
      editorAreaFocus: true,
      activeElementIdList: memberIds,
      handleElementId: entry.element.id,
      ...(attrs ? { richTextAttrs: attrs } : {}),
    })
  }, [])

  /**
   * Alt+Click layer cycling: each clean click advances the selection one
   * layer down the stack under the pointer (wrapping), and anchors the layer
   * picker there. Owns the whole gesture so operate chrome, the hit layer,
   * and blank-click flows never react to alt-modified clicks.
   */
  const handleLayerCycleMouseDown = useCallback((e: ReactMouseEvent): boolean => {
    if (!(e.altKey || useKeyboardStore.getState().altKeyState)) return false
    if (useKeyboardStore.getState().spaceKeyState) return false
    if (e.target instanceof Element && e.target.closest('.ProseMirror, .is-editing')) return false
    const main = useMainStore.getState()
    if (main.creatingElement || main.creatingCustomShape) return false
    const wrapper = findViewportWrapper(e.target, canvasRef.current)
    if (!wrapper) return false
    const bounds = wrapper.getBoundingClientRect()
    const entries = layerStackAtPoint(
      elementList,
      main.canvasScale,
      main.hiddenElementIdList,
      e.clientX - bounds.left,
      e.clientY - bounds.top,
    )
    if (!entries.length) {
      if (layerStackRef.current) setLayerStack(null)
      return false
    }
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const onUp = (up: MouseEvent) => {
      document.removeEventListener('mouseup', onUp, true)
      if (Math.abs(up.clientX - startX) > LAYER_CYCLE_CLICK_SLOP_PX || Math.abs(up.clientY - startY) > LAYER_CYCLE_CLICK_SLOP_PX) return
      const canvasBounds = canvasRef.current?.getBoundingClientRect()
      if (!canvasBounds) return
      const activeIds = useMainStore.getState().activeElementIdList
      const currentIndex = entries.findIndex(entry => !entry.locked && entry.memberIds.some(id => activeIds.includes(id)))
      const nextIndex = nextSelectableLayer(entries, currentIndex)
      if (nextIndex < 0) return
      applyLayerStackSelection(entries[nextIndex], [...entries[nextIndex].memberIds])
      setLayerStack({
        anchor: { x: startX - canvasBounds.left, y: startY - canvasBounds.top },
        entries,
        activeIndex: nextIndex,
      })
    }
    document.addEventListener('mouseup', onUp, true)
    return true
  }, [elementList, applyLayerStackSelection])

  const pickLayerStackEntry = useCallback((index: number) => {
    const stack = layerStackRef.current
    if (!stack) return
    const entry = stack.entries[index]
    if (!entry || entry.locked) return
    const liveIds = new Set(elementList.map(element => element.id))
    const memberIds = entry.memberIds.filter(id => liveIds.has(id))
    if (!memberIds.length || !liveIds.has(entry.element.id)) return
    applyLayerStackSelection(entry, memberIds)
    setLayerStack({ ...stack, activeIndex: index })
  }, [elementList, applyLayerStackSelection])

  const handleCanvasHitSelect = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return
    if (handleLayerCycleMouseDown(e)) return
    const keyboard = useKeyboardStore.getState()
    const toggleModifier = e.shiftKey || e.ctrlKey || e.metaKey || selectCtrlOrShiftKeyActive(keyboard)
    if (isOperateChromeTarget(e.target) && !(toggleModifier && isSelectionToggleSurface(e.target))) return
    if (e.target instanceof Element && e.target.closest('.hit-rect, .hit-border, .hit-edit')) return
    if (keyboard.spaceKeyState) return
    const main = useMainStore.getState()
    if (main.creatingElement || main.creatingCustomShape) return

    const wrapper = findViewportWrapper(e.target, canvasRef.current)
    if (!wrapper) return

    const { hitRects, occluderRects } = collectVisualHitPlan({
      elementList,
      canvasScale: main.canvasScale,
      hiddenElementIdList: main.hiddenElementIdList,
      activeElementIdList: main.activeElementIdList,
      editingElementId,
      clipingImageElementId: main.clipingImageElementId,
    })
    const byId = new Map(elementList.map(element => [element.id, element]))

    const bounds = wrapper.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    let topOccluder: VisualHitRect | null = null
    for (const rect of occluderRects) {
      const occluded = byId.get(rect.id)
      const target = occluded
        ? hitTestOperateTarget(x, y, rect, {
          interactive: hasInteractiveSurface(occluded),
          handles: resizeHandleDirectionsFor(occluded),
        })
        : null
      if (!target && !pointInVisualHitRect(x, y, rect)) continue
      if (!topOccluder || rect.zIndex > topOccluder.zIndex) topOccluder = rect
    }
    const hit = hitTestVisualRects(hitRects, x, y)
    if (!toggleModifier) {
      if (topOccluder) {
        const occluded = byId.get(topOccluder.id)
        if (occluded && !occluded.lock) {
          const target = hitTestOperateTarget(x, y, topOccluder, {
            interactive: hasInteractiveSurface(occluded),
            handles: resizeHandleDirectionsFor(occluded),
          })
          if (target === 'move') {
            e.stopPropagation()
            e.nativeEvent.stopPropagation()
            selectElement(e.nativeEvent, occluded, true)
          }
        }
        return
      }
    }
    else if (topOccluder && (!hit || topOccluder.zIndex > hit.zIndex)) {
      // Toggle click on the selected element the user sees at this point:
      // route it to selectElement so its shift/ctrl branches deselect it.
      if (topOccluder.id === editingElementId || topOccluder.id === main.clipingImageElementId) return
      const occludedElement = byId.get(topOccluder.id)
      if (!occludedElement || occludedElement.lock) return
      e.stopPropagation()
      e.nativeEvent.stopPropagation()
      selectElement(e.nativeEvent, occludedElement, true)
      return
    }
    if (!hit) return
    const element = byId.get(hit.id)
    if (!element || element.lock) return

    e.stopPropagation()
    e.nativeEvent.stopPropagation()

    let canMove = true
    if (!toggleModifier && hasInteractiveSurface(element)) {
      canMove = hitTestOperateTarget(x, y, hit, { interactive: true }) !== 'edit'
    }
    const edit = !canMove && clicksToEditText(element)
    selectElement(e.nativeEvent, element, canMove, edit)
    if (edit) beginEdit(element.id, { left: e.clientX, top: e.clientY })
  }, [elementList, editingElementId, selectElement, beginEdit, handleLayerCycleMouseDown])

  const handleClickBlankArea = useCallback((e: MouseEvent) => {
    if (isOperateChromeTarget(e.target)) return
    if (e.target instanceof Element && e.target.closest('.hit-rect, .hit-border, .hit-edit')) return

    const wrapper = findViewportWrapper(e.target, canvasRef.current)
    if (wrapper) {
      const main = useMainStore.getState()
      const { occluderRects } = collectVisualHitPlan({
        elementList,
        canvasScale: main.canvasScale,
        hiddenElementIdList: main.hiddenElementIdList,
        activeElementIdList: main.activeElementIdList,
        editingElementId: main.editingElementId,
        clipingImageElementId: main.clipingImageElementId,
      })
      const bounds = wrapper.getBoundingClientRect()
      if (pointInAnyVisualHitRect(e.clientX - bounds.left, e.clientY - bounds.top, occluderRects)) return
    }

    drainCommitQueue()
    const main = useMainStore.getState()
    const keyboard = useKeyboardStore.getState()
    if (!selectCtrlOrShiftKeyActive(keyboard) && main.activeElementIdList.length) main.setActiveElementIdList([])
    if (!keyboard.spaceKeyState) updateMouseSelection(e)
    else dragViewport(e)
    if (!main.editorAreaFocus) main.setEditorareaFocus(true)
    if (main.textFormatPainter) main.setTextFormatPainter(null)
    removeAllRanges()
  }, [elementList, updateMouseSelection, dragViewport])

  const handleDblClick = useCallback((e: MouseEvent) => {
    const main = useMainStore.getState()
    if (main.activeElementIdList.length || main.creatingElement || main.creatingCustomShape) return
    if (!viewportRef.current) return
    const scale = main.canvasScale
    const { x: left, y: top } = clientToCanvas(e, viewportRef.current, scale)
    createTextElement({
      left,
      top,
      width: 200 / scale,
      height: 0,
    })
  }, [createTextElement])

  useEffect(() => () => {
    const main = useMainStore.getState()
    if (main.textFormatPainter) main.setTextFormatPainter(null)
  }, [])

  const removeEditorAreaFocus = useCallback(() => {
    const main = useMainStore.getState()
    if (main.editorAreaFocus) main.setEditorareaFocus(false)
  }, [])
  useClickOutside(canvasRef, removeEditorAreaFocus)

  const { applyCanvasZoomDelta } = useScaleCanvas()
  const wheelPageAccumRef = useRef(0)
  const wheelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMousewheelCanvas = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const lineHeight = 33
    const deltaPx = e.deltaMode === 1 ? e.deltaY * lineHeight : e.deltaY

    if (e.ctrlKey || e.metaKey || useKeyboardStore.getState().ctrlKeyState) {
      applyCanvasZoomDelta(wheelDeltaToZoom(deltaPx))
      if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current)
      wheelResetTimerRef.current = setTimeout(() => {
        wheelPageAccumRef.current = 0
      }, 200)
      return
    }
    if (mynaView) { panViewport(-e.deltaX, -deltaPx); return }
    wheelPageAccumRef.current += deltaPx
    while (wheelPageAccumRef.current >= WHEEL_PAGE_STEP) {
      wheelPageAccumRef.current -= WHEEL_PAGE_STEP
      updateSlideIndex(KEYS.DOWN)
    }
    while (wheelPageAccumRef.current <= -WHEEL_PAGE_STEP) {
      wheelPageAccumRef.current += WHEEL_PAGE_STEP
      updateSlideIndex(KEYS.UP)
    }
    if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current)
    wheelResetTimerRef.current = setTimeout(() => {
      wheelPageAccumRef.current = 0
    }, 200)
  }, [applyCanvasZoomDelta, updateSlideIndex, mynaView, panViewport])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => handleMousewheelCanvas(e)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [handleMousewheelCanvas])

  const toggleRuler = useCallback(() => {
    if (mynaView) { mynaView.setPreference('showRulers', !mynaView.showRulers); return }
    const main = useMainStore.getState()
    main.setRulerState(!main.showRuler)
  }, [mynaView])

  const toggleBubbleMenu = useCallback(() => {
    const main = useMainStore.getState()
    const next = !main.showBubbleMenu
    main.setBubbleMenuState(next)
    message.success(next ? LL.canvas.bubbleMenuEnabled() : LL.canvas.bubbleMenuDisabled())
  }, [LL])

  const toggleOpenPanelOnTextSelection = useCallback(() => {
    const main = useMainStore.getState()
    const next = !main.openPanelOnTextSelection
    main.setOpenPanelOnTextSelection(next)
    message.success(
      next
        ? LL.canvas.openPanelOnTextSelectionEnabled()
        : LL.canvas.openPanelOnTextSelectionDisabled(),
    )
  }, [LL])

  const { insertElementFromCreateSelection, formatCreateSelection } = useInsertFromCreateSelection(viewportRef)

  const insertCustomShape = useCallback((items: CreateCustomShapeData[]) => {
    for (const data of items) {
      const { start, end, path, viewBox } = data
      const position = formatCreateSelection({ start, end })
      if (!position) continue
      const supplement: Partial<PPTShapeElement> = {}
      if (data.fill) supplement.fill = data.fill
      if (data.gradient) supplement.gradient = data.gradient
      if (data.outline) supplement.outline = data.outline
      if (data.groupId) supplement.groupId = data.groupId
      createShapeElement(position, { path, viewBox }, supplement)
    }
    useMainStore.getState().setCreatingCustomShapeState(null)
  }, [formatCreateSelection, createShapeElement])

  const contextmenus = useCallback((): ContextmenuItem[] => {
    const main = useMainStore.getState()
    const gridSize = mynaView ? (mynaView.showGrid ? mynaView.gridSize : 0) : main.gridLineSize
    const setGridSize = (size: number) => {
      if (mynaView) {
        mynaView.setPreference('showGrid', size > 0)
        if (size > 0) mynaView.setPreference('gridSize', size)
      } else main.setGridLineSize(size)
    }
    return [
      {
        text: LL.canvas.contextMenu.paste(),
        subText: 'Ctrl + V',
        handler: pasteElement,
      },
      {
        text: LL.canvas.contextMenu.selectAll(),
        subText: 'Ctrl + A',
        handler: selectAllElements,
      },
      {
        text: LL.canvas.contextMenu.ruler(),
        subText: (mynaView ? mynaView.showRulers : main.showRuler) ? '√' : '',
        handler: toggleRuler,
      },
      {
        text: LL.canvas.contextMenu.gridLines(),
        subText: mynaView ? (mynaView.showGrid ? '√' : '') : 'Alt',
        handler: () => setGridSize(gridSize ? 0 : 50),
        children: [
          {
            text: LL.canvas.contextMenu.gridNone(),
            subText: gridSize === 0 ? '√' : '',
            handler: () => setGridSize(0),
          },
          {
            text: LL.canvas.contextMenu.gridSmall(),
            subText: gridSize === 25 ? '√' : '',
            handler: () => setGridSize(25),
          },
          {
            text: LL.canvas.contextMenu.gridMedium(),
            subText: gridSize === 50 ? '√' : '',
            handler: () => setGridSize(50),
          },
          {
            text: LL.canvas.contextMenu.gridLarge(),
            subText: gridSize === 100 ? '√' : '',
            handler: () => setGridSize(100),
          },
        ],
      },
      {
        text: LL.canvas.contextMenu.resetCurrentSlide(),
        handler: deleteAllElements,
      },
      {
        text: LL.canvas.contextMenu.bubbleMenu(),
        subText: main.showBubbleMenu ? '√' : '',
        handler: toggleBubbleMenu,
      },
      {
        text: LL.canvas.contextMenu.openPanelOnTextSelection(),
        subText: main.openPanelOnTextSelection ? '√' : '',
        handler: toggleOpenPanelOnTextSelection,
      },
      { divider: true },
      {
        text: LL.canvas.contextMenu.slideShow(),
        subText: 'F5',
        handler: enterScreeningFromStart,
      },
    ]
  }, [LL, mynaView, pasteElement, selectAllElements, toggleRuler, deleteAllElements, toggleBubbleMenu, toggleOpenPanelOnTextSelection, enterScreeningFromStart])

  const displayAlignmentLines = useMemo(() => {
    if (gesturingState) return alignmentLines
    const snapGuides = alignmentLines.filter(line => line.kind !== 'measure')
    if (!ctrlKeyState || !activeElementIdList.length) return snapGuides
    const selected = new Set(activeElementIdList)
    const moving = unionBoxes(elementList.filter(el => selected.has(el.id)).map(getElementRange))
    if (!moving) return snapGuides
    const others = elementList.filter(el => !selected.has(el.id)).map(getElementRange)
    const nearby = others.length ? boxesNear(buildSnapIndex(others), moving, snapQueryPad()) : []
    const measures = collectCtrlMeasures(
      moving,
      nearby,
      { width: viewportSize, height: viewportSize * viewportRatio },
      snapGuides,
    )
    return measures.length ? [...snapGuides, ...measures] : snapGuides
  }, [ctrlKeyState, gesturingState, activeElementIdList, alignmentLines, elementList, viewportSize, viewportRatio])

  return (
    <SlideScaleContext.Provider value={canvasScale}>
      <div
        className={[cx('canvas'), className].filter(Boolean).join(' ')}
        ref={canvasRef}
        data-fika-canvas
        tabIndex={-1}
        style={{ '--operate-line': operateLineColor, '--operate-line-halo': operateLineHalo, ...style } as CSSProperties}
        onMouseDownCapture={e => {
          // Navigation takes priority over page activation and editing, including
          // page chrome and view-only canvases. Stop React's child handlers too.
          if (e.button === 1) {
            e.preventDefault()
            e.stopPropagation()
            dragViewport(e.nativeEvent)
            return
          }
          if (readOnly || (e.target instanceof Element && e.target.closest('[data-myna-rulers], [data-myna-page-chrome], [data-myna-frame-title]'))) return
          handleCanvasHitSelect(e)
        }}
        onMouseDown={e => {
          if (readOnly) {
            // View-only: the canvas still takes focus (wheel paging, zoom
            // shortcuts) and pans with Space, but never selects or edits.
            const main = useMainStore.getState()
            if (!main.editorAreaFocus) main.setEditorareaFocus(true)
            if (useKeyboardStore.getState().spaceKeyState) dragViewport(e.nativeEvent)
            return
          }
          handleClickBlankArea(e.nativeEvent)
        }}
        onDoubleClick={e => { if (!readOnly) handleDblClick(e.nativeEvent) }}
        onContextMenu={e => {
          e.preventDefault()
          e.stopPropagation()
          if (!readOnly) openContextmenu(e, contextmenus)
        }}
      >
        {mynaView && <MynaPageCanvas left={viewportStyles.left} top={viewportStyles.top} canvasWidth={canvasRef.current?.clientWidth || 0} canvasHeight={canvasRef.current?.clientHeight || 0} />}
        {creatingElement ? <ElementCreateSelection onCreated={data => insertElementFromCreateSelection(data)} /> : null}
        {creatingCustomShape ? <ShapeCreateCanvas mode={creatingCustomShape ?? 'polygon'} onCreated={data => insertCustomShape(data)} /> : null}
        <div
          className={cx('viewport-wrapper')}
          style={{
            zIndex: mynaView ? 2 : undefined,
            width: viewportStyles.width * canvasScale + 'px',
            height: viewportStyles.height * canvasScale + 'px',
            left: viewportStyles.left + 'px',
            top: viewportStyles.top + 'px',
          }}
        >
          <ViewportBackground showGrid={!mynaView} />
          {mynaView && <MynaFrameTitles elements={elementList} scale={canvasScale} drag={dragElement} />}
          {skeletonSlide ? <SlideSkeleton className={cx('skeleton')} shield /> : null}
          <div className={cx('operates')}>
            {displayAlignmentLines.map((line, index) => (
              <AlignmentLine
                key={index}
                type={line.type}
                axis={line.axis}
                length={line.length}
                kind={line.kind}
                marks={line.marks}
                label={line.label}
                canvasScale={canvasScale}
              />
            ))}
            {activeElementIdList.length > 1 ? (
              <MultiSelectOperate
                elementList={elementList}
                scaleMultiElement={scaleMultiElement}
                rotateGroupElement={rotateGroupElement}
                dragElement={dragElement}
                openLinkDialog={openLinkDialog}
              />
            ) : null}
            {elementList.map(element => (
              <Operate
                key={element.id}
                elementInfo={element}
                isSelected={activeElementIdList.includes(element.id)}
                isActive={handleElementId === element.id}
                isActiveGroupElement={activeGroupElementId === element.id}
                isMultiSelect={activeElementIdList.length > 1}
                isEditing={editingElementId === element.id}
                rotateElement={rotateElement}
                scaleElement={scaleElement}
                dragLineElement={dragLineElement}
                moveShapeKeypoint={moveShapeKeypoint}
                dragElement={dragElement}
                beginEdit={beginEdit}
                openLinkDialog={openLinkDialog}
                style={hiddenElementIdList.includes(element.id) ? HIDDEN_STYLE : undefined}
              />
            ))}
            <ElementFloatLayer
              elementList={elementList}
              canvasRef={canvasRef}
              viewportStyles={viewportStyles}
              openLinkDialog={openLinkDialog}
            />
            <AiRevealBadge canvasRef={canvasRef} />
          </div>
          <div className={cx('viewport-clip', { 'viewport-overflow': allowOverflow || !!mynaView })}>
            <div className={cx('viewport')} ref={viewportRef} style={{ transform: `scale(${canvasScale})` }}>
              {elementList.map((element, index) => (
                <EditableElement
                  key={element.id}
                  elementInfo={element}
                  elementIndex={index + 1}
                  isMultiSelect={activeElementIdList.length > 1}
                  isEditing={editingElementId === element.id || clipingImageElementId === element.id}
                  selectElement={selectElement}
                  openLinkDialog={openLinkDialog}
                  style={hiddenElementIdList.includes(element.id) ? HIDDEN_STYLE : frameDomClip(element, elementList)}
                />
              ))}
            </div>
          </div>
          <HitLayer
            elementList={elementList}
            canvasScale={canvasScale}
            hiddenElementIdList={hiddenElementIdList}
            activeElementIdList={activeElementIdList}
            editingElementId={editingElementId}
            clipingImageElementId={clipingImageElementId}
            disabled={!!creatingElement || !!creatingCustomShape || skeletonSlide || readOnly}
            selectElement={selectElement}
            beginEdit={beginEdit}
            openLinkDialog={openLinkDialog}
          />
          {mouseSelectionVisible ? (
            <MouseSelection
              top={mouseSelection.top}
              left={mouseSelection.left}
              width={mouseSelection.width}
              height={mouseSelection.height}
            />
          ) : null}
        </div>
        {layerStack ? (
          <LayerStackPanel
            anchor={layerStack.anchor}
            entries={layerStack.entries}
            activeIndex={layerStack.activeIndex}
            onPick={pickLayerStackEntry}
            onClose={closeLayerStack}
          />
        ) : null}
        {spaceKeyState ? <div className={cx('drag-mask')} style={mynaView ? { zIndex: 20 } : undefined} /> : null}
        <CanvasScrollbars canvasRef={canvasRef} viewportStyles={viewportStyles} canvasScale={canvasScale} pan={panViewport} />
        {mynaView ? <MynaRulers canvasRef={canvasRef} viewportStyles={viewportStyles} elementList={elementList} view={mynaView} /> : showRuler ? <Ruler viewportStyles={viewportStyles} elementList={elementList} /> : null}
        <Modal visible={linkDialogVisible} onUpdateVisible={(value: boolean) => setLinkDialogVisible(value)} width={540}>
          <LinkDialog onClose={() => setLinkDialogVisible(false)} />
        </Modal>
      </div>
    </SlideScaleContext.Provider>
  )
})

export default Canvas
