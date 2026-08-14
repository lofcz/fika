import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import { useMainStore, useSlidesStore, useKeyboardStore, selectCurrentSlide, selectCtrlOrShiftKeyActive } from '@/store'
import { useToolbarStoreSelect } from '@/views/Editor/Toolbar/common/handleElement'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import type { PPTElement, PPTShapeElement, Slide } from '@/types/slides'
import type { AlignmentLineProps, CreateCustomShapeData } from '@/types/edit'
import { SlideScaleContext } from '@/types/injectKey'
import { removeAllRanges } from '@/utils/selection'
import { clientToCanvas } from '@/utils/canvasPointer'
import { clicksToEditText, elementVisualHitRect, focusElementEditor, hasInteractiveSurface, hitTestOperateTarget, hitTestVisualRects, pointInVisualHitRect, retryPendingCaret, type ClientCoords, type VisualHitRect } from '@/utils/canvasHitTest'
import { getEditorView } from '@/utils/prosemirror/caret'
import { commitLiveEditorToStore } from '@/utils/prosemirror/commitEditor'
import { richTextAttrsFromElement } from '@/utils/prosemirror/richTextAttrsFromElement'
import { KEYS } from '@/configs/hotkey'
import { getElementRange } from '@/utils/element'
import { collectCtrlMeasures, unionBoxes } from '@/utils/snap'
import useViewportSize from './hooks/useViewportSize'
import useOperateChrome from './hooks/useOperateChrome'
import useMouseSelection from './hooks/useMouseSelection'
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
import ElementFloatLayer from './ElementFloatLayer/index'
import AlignmentLine from './AlignmentLine'
import Ruler from './Ruler'
import CanvasScrollbars from './CanvasScrollbars'
import ElementCreateSelection from './ElementCreateSelection'
import ShapeCreateCanvas from './ShapeCreateCanvas'
import MultiSelectOperate from './Operate/MultiSelectOperate'
import Operate from './Operate/index'
import HitLayer from './HitLayer'
import LinkDialog from './LinkDialog'
import Modal from '@/components/Modal'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'

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

const HIDDEN_STYLE: CSSProperties = { display: 'none' }

const cloneElements = (elements: PPTElement[]): PPTElement[] => (
  JSON.parse(JSON.stringify(elements))
)

const shallowChangedKeys = (prev: object, next: object): string[] => {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const changed: string[] = []
  for (const key of keys) {
    if ((prev as Record<string, unknown>)[key] !== (next as Record<string, unknown>)[key]) {
      changed.push(key)
    }
  }
  return changed
}

const isShapeTextContentOnly = (prev: PPTElement, next: PPTElement): boolean => {
  const prevText = 'text' in prev ? prev.text : undefined
  const nextText = 'text' in next ? next.text : undefined
  if (!nextText) return false
  if (!prevText) return true
  return shallowChangedKeys(prevText, nextText).every(key => key === 'content')
}

const isContentLikeKey = (key: string, prev: PPTElement, next: PPTElement): boolean => {
  if (key === 'content' || key === 'data') return true
  if (key === 'text') return isShapeTextContentOnly(prev, next)
  return false
}

const isChromeSizeKey = (key: string) => key === 'height' || key === 'width'

type ElementListSyncAction = 'replace' | 'skip' | 'patch-chrome'

const classifyElementListSync = (
  prev: Slide | undefined,
  next: Slide | undefined,
  editingId: string,
): ElementListSyncAction => {
  if (!next) return 'replace'
  if (!prev || prev.id !== next.id) return 'replace'
  if (prev.elements === next.elements) return 'skip'
  if (prev.elements.length !== next.elements.length) return 'replace'

  let changedIndex = -1
  for (let i = 0; i < next.elements.length; i++) {
    if (prev.elements[i].id !== next.elements[i].id) return 'replace'
    if (prev.elements[i] !== next.elements[i]) {
      if (changedIndex !== -1) return 'replace'
      changedIndex = i
    }
  }
  if (changedIndex === -1) return 'skip'

  const prevEl = prev.elements[changedIndex]
  const nextEl = next.elements[changedIndex]
  if (!editingId || nextEl.id !== editingId) return 'replace'

  const keys = shallowChangedKeys(prevEl, nextEl)
  if (keys.length === 0) return 'skip'
  if (keys.every(key => isContentLikeKey(key, prevEl, nextEl))) return 'skip'
  if (keys.every(key => isChromeSizeKey(key) || isContentLikeKey(key, prevEl, nextEl))) return 'patch-chrome'
  return 'replace'
}

const isInPlaceEditingContentPatch = (
  prev: Slide | undefined,
  next: Slide | undefined,
  editingId: string,
) => classifyElementListSync(prev, next, editingId) === 'skip'

const patchEditingElementChrome = (list: PPTElement[], storeEl: PPTElement): PPTElement[] => {
  const index = list.findIndex(el => el.id === storeEl.id)
  if (index < 0) return list
  const el = list[index]
  const nextHeight = 'height' in storeEl ? storeEl.height : undefined
  const prevHeight = 'height' in el ? el.height : undefined
  if (el.width === storeEl.width && prevHeight === nextHeight) return list
  const next = list.slice()
  next[index] = {
    ...el,
    width: storeEl.width,
    ...(nextHeight !== undefined ? { height: nextHeight } : {}),
  } as PPTElement
  return next
}

const findViewportWrapper = (from: EventTarget | null, canvas: HTMLElement | null): HTMLElement | null => {
  if (from instanceof Element) {
    const closest = from.closest('.viewport-wrapper')
    if (closest instanceof HTMLElement) return closest
  }
  const scoped = canvas?.querySelector('.viewport-wrapper')
  return scoped instanceof HTMLElement ? scoped : null
}

const Canvas = memo(({ className, style }: { className?: string; style?: CSSProperties }) => {
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
  const currentSlide = useToolbarStoreSelect(
    () => selectCurrentSlide(useSlidesStore.getState()),
    (prev, next) => isInPlaceEditingContentPatch(prev, next, useMainStore.getState().editingElementId),
  )
  const spaceKeyState = useKeyboardStore(s => s.spaceKeyState)
  const ctrlKeyState = useKeyboardStore(s => s.ctrlKeyState)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const { operateLineColor } = useOperateChrome()

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [alignmentLines, setAlignmentLines] = useState<AlignmentLineProps[]>([])

  const beginEdit = useCallback((elementId: string, caret?: ClientCoords) => {
    const main = useMainStore.getState()
    if (!elementId) {
      if (main.editingElementId) main.setEditingElementId('')
      return
    }
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
  const prevSlideRef = useRef(currentSlide)

  const endEdit = useCallback(() => {
    const editingId = useMainStore.getState().editingElementId
    if (editingId) {
      commitLiveEditorToStore(editingId)
      const view = getEditorView(editingId)
      if (view?.hasFocus()) view.dom.blur()
    }
    const storeSlide = selectCurrentSlide(useSlidesStore.getState())
    prevSlideRef.current = storeSlide
    setElementList(storeSlide ? cloneElements(storeSlide.elements) : [])
    if (!useMainStore.getState().editingElementId) return
    useMainStore.getState().setEditingElementId('')
  }, [])

  const liveSlide = selectCurrentSlide(useSlidesStore.getState())
  if (prevSlideRef.current !== liveSlide) {
    const prevSlide = prevSlideRef.current
    prevSlideRef.current = liveSlide
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
      endEdit()
    }
  }, [activeElementIdList, editingElementId, endEdit])

  useEffect(() => {
    const id = takePendingCreatedTextId()
    if (id) beginEdit(id)
  }, [activeElementIdList, beginEdit])

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { dragViewport, panViewport, viewportStyles } = useViewportSize(canvasRef)

  const handleMousedownCanvasCapture = useCallback((e: MouseEvent) => {
    if (e.button !== 1) return
    e.preventDefault()
    e.stopPropagation()
    dragViewport(e)
  }, [dragViewport])

  useDrop(canvasRef)

  const { mouseSelection, mouseSelectionVisible, updateMouseSelection } = useMouseSelection(elementList, viewportRef)
  const { dragElement } = useDragElement(elementList, setElementList, alignmentLines, setAlignmentLines, canvasScale)
  const { dragLineElement } = useDragLineElement(elementList, setElementList)
  const { selectElement } = useSelectAndMoveElement(elementList, dragElement)
  const { scaleElement, scaleMultiElement } = useScaleElement(elementList, setElementList, alignmentLines, setAlignmentLines, canvasScale)
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

  const handleCanvasHitSelect = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return
    if (isOperateChromeTarget(e.target)) return
    if (e.target instanceof Element && e.target.closest('.hit-rect, .hit-border, .hit-edit')) return
    if (useKeyboardStore.getState().spaceKeyState) return
    const main = useMainStore.getState()
    if (main.creatingElement || main.creatingCustomShape) return

    const wrapper = findViewportWrapper(e.target, canvasRef.current)
    if (!wrapper) return

    const hiddenSet = new Set(main.hiddenElementIdList)
    const selectedSet = new Set(main.activeElementIdList)
    const rects = []
    const occluderRects: VisualHitRect[] = []
    const byId = new Map<string, PPTElement>()
    for (let i = 0; i < elementList.length; i++) {
      const element = elementList[i]
      if (hiddenSet.has(element.id)) continue
      if (element.id === editingElementId) continue
      if (element.id === main.clipingImageElementId) continue
      if (selectedSet.has(element.id) && (element.type === 'video' || element.type === 'audio') && main.activeElementIdList.length === 1) {
        occluderRects.push(elementVisualHitRect(element, main.canvasScale, i + 1))
      }
      if (selectedSet.has(element.id) && element.type !== 'line') continue
      const rect = elementVisualHitRect(element, main.canvasScale, i + 1)
      rects.push(rect)
      byId.set(element.id, element)
    }

    const bounds = wrapper.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    if (occluderRects.some(hole => pointInVisualHitRect(x, y, hole))) return
    const hit = hitTestVisualRects(rects, x, y)
    if (!hit) return
    const element = byId.get(hit.id)
    if (!element || element.lock) return

    e.stopPropagation()
    e.nativeEvent.stopPropagation()

    let canMove = true
    if (hasInteractiveSurface(element)) {
      canMove = hitTestOperateTarget(x, y, hit, { interactive: true }) !== 'edit'
    }
    const edit = !canMove && clicksToEditText(element)
    selectElement(e.nativeEvent, element, canMove, edit)
    if (edit) beginEdit(element.id, { left: e.clientX, top: e.clientY })
  }, [elementList, editingElementId, selectElement, beginEdit])

  const handleClickBlankArea = useCallback((e: MouseEvent) => {
    if (isOperateChromeTarget(e.target)) return
    if (e.target instanceof Element && e.target.closest('.hit-rect, .hit-border, .hit-edit')) return

    endEdit()
    const main = useMainStore.getState()
    const keyboard = useKeyboardStore.getState()
    if (!selectCtrlOrShiftKeyActive(keyboard) && main.activeElementIdList.length) main.setActiveElementIdList([])
    if (!keyboard.spaceKeyState) updateMouseSelection(e)
    else dragViewport(e)
    if (!main.editorAreaFocus) main.setEditorareaFocus(true)
    if (main.textFormatPainter) main.setTextFormatPainter(null)
    removeAllRanges()
  }, [endEdit, updateMouseSelection, dragViewport])

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
  }, [applyCanvasZoomDelta, updateSlideIndex])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => handleMousewheelCanvas(e)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [handleMousewheelCanvas])

  const toggleRuler = useCallback(() => {
    const main = useMainStore.getState()
    main.setRulerState(!main.showRuler)
  }, [])

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
        subText: main.showRuler ? '√' : '',
        handler: toggleRuler,
      },
      {
        text: LL.canvas.contextMenu.gridLines(),
        subText: 'Alt',
        handler: () => useMainStore.getState().setGridLineSize(useMainStore.getState().gridLineSize ? 0 : 50),
        children: [
          {
            text: LL.canvas.contextMenu.gridNone(),
            subText: useMainStore.getState().gridLineSize === 0 ? '√' : '',
            handler: () => useMainStore.getState().setGridLineSize(0),
          },
          {
            text: LL.canvas.contextMenu.gridSmall(),
            subText: useMainStore.getState().gridLineSize === 25 ? '√' : '',
            handler: () => useMainStore.getState().setGridLineSize(25),
          },
          {
            text: LL.canvas.contextMenu.gridMedium(),
            subText: useMainStore.getState().gridLineSize === 50 ? '√' : '',
            handler: () => useMainStore.getState().setGridLineSize(50),
          },
          {
            text: LL.canvas.contextMenu.gridLarge(),
            subText: useMainStore.getState().gridLineSize === 100 ? '√' : '',
            handler: () => useMainStore.getState().setGridLineSize(100),
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
  }, [LL, pasteElement, selectAllElements, toggleRuler, deleteAllElements, toggleBubbleMenu, toggleOpenPanelOnTextSelection, enterScreeningFromStart])

  const displayAlignmentLines = useMemo(() => {
    const snapGuides = alignmentLines.filter(line => line.kind !== 'measure')
    if (!ctrlKeyState || !activeElementIdList.length) return snapGuides
    const selected = new Set(activeElementIdList)
    const moving = unionBoxes(elementList.filter(el => selected.has(el.id)).map(getElementRange))
    if (!moving) return snapGuides
    const others = elementList.filter(el => !selected.has(el.id)).map(getElementRange)
    const measures = collectCtrlMeasures(
      moving,
      others,
      { width: viewportSize, height: viewportSize * viewportRatio },
      snapGuides,
    )
    return measures.length ? [...snapGuides, ...measures] : snapGuides
  }, [ctrlKeyState, activeElementIdList, alignmentLines, elementList, viewportSize, viewportRatio])

  return (
    <SlideScaleContext.Provider value={canvasScale}>
      <div
        className={[cx('canvas'), className].filter(Boolean).join(' ')}
        ref={canvasRef}
        style={{ '--operate-line': operateLineColor, ...style } as CSSProperties}
        onMouseDownCapture={e => {
          handleMousedownCanvasCapture(e.nativeEvent)
          handleCanvasHitSelect(e)
        }}
        onMouseDown={e => handleClickBlankArea(e.nativeEvent)}
        onDoubleClick={e => handleDblClick(e.nativeEvent)}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openContextmenu(e, contextmenus) }}
      >
        {creatingElement ? <ElementCreateSelection onCreated={data => insertElementFromCreateSelection(data)} /> : null}
        {creatingCustomShape ? <ShapeCreateCanvas mode={creatingCustomShape ?? 'polygon'} onCreated={data => insertCustomShape(data)} /> : null}
        <div
          className={cx('viewport-wrapper')}
          style={{
            width: viewportStyles.width * canvasScale + 'px',
            height: viewportStyles.height * canvasScale + 'px',
            left: viewportStyles.left + 'px',
            top: viewportStyles.top + 'px',
          }}
        >
          <ViewportBackground />
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
          </div>
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
                style={hiddenElementIdList.includes(element.id) ? HIDDEN_STYLE : undefined}
              />
            ))}
          </div>
          <HitLayer
            elementList={elementList}
            canvasScale={canvasScale}
            hiddenElementIdList={hiddenElementIdList}
            activeElementIdList={activeElementIdList}
            editingElementId={editingElementId}
            clipingImageElementId={clipingImageElementId}
            disabled={!!creatingElement || !!creatingCustomShape}
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
        {spaceKeyState ? <div className={cx('drag-mask')} /> : null}
        <CanvasScrollbars canvasRef={canvasRef} viewportStyles={viewportStyles} canvasScale={canvasScale} pan={panViewport} />
        {showRuler ? <Ruler viewportStyles={viewportStyles} elementList={elementList} /> : null}
        <Modal visible={linkDialogVisible} onUpdateVisible={(value: boolean) => setLinkDialogVisible(value)} width={540}>
          <LinkDialog onClose={() => setLinkDialogVisible(false)} />
        </Modal>
      </div>
    </SlideScaleContext.Provider>
  )
})

export default Canvas
