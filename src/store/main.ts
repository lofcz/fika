import { create } from 'zustand'
import { customAlphabet } from 'nanoid'
import { ToolbarStates } from '@/types/toolbar'
import type { CreatingElement, CustomShapeDrawMode, ShapeFormatPainter, TextFormatPainter } from '@/types/edit'
import type { DialogForExportTypes } from '@/types/export'
import { type TextAttrs, defaultRichTextAttrs } from '@/utils/prosemirror/utils'
import { resolveExportDialogType } from '@/configs/exportTabs'
import { selectCurrentSlide, useSlidesStore } from './slides'
import type { PPTElement } from '@/types/slides'

function sameIdList(a: string[], b: string[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export interface MainState {
  activeElementIdList: string[]
  handleElementId: string
  activeGroupElementId: string
  hiddenElementIdList: string[]
  canvasPercentage: number
  canvasScale: number
  canvasDragged: boolean
  thumbnailsFocus: boolean
  editorAreaFocus: boolean
  disableHotkeys: boolean
  gridLineSize: number
  showRuler: boolean
  showBubbleMenu: boolean
  creatingElement: CreatingElement | null
  creatingCustomShape: CustomShapeDrawMode | null
  editingElementId: string
  toolbarState: ToolbarStates
  clipingImageElementId: string
  isScaling: boolean
  isGesturing: boolean
  richTextAttrs: TextAttrs
  selectedTableCells: string[]
  selectedSlidesIndex: number[]
  dialogForExport: DialogForExportTypes
  databaseId: string
  textFormatPainter: TextFormatPainter | null
  shapeFormatPainter: ShapeFormatPainter | null
  showSelectPanel: boolean
  showSearchPanel: boolean
  showNotesPanel: boolean
  showMarkupPanel: boolean
  rightPanelCollapsed: boolean
  rightPanelPinned: 'open' | 'closed' | null
  openPanelOnTextSelection: boolean
}

export interface MainActions {
  setActiveElementIdList: (activeElementIdList: string[]) => void
  setHandleElementId: (handleElementId: string) => void
  setActiveGroupElementId: (activeGroupElementId: string) => void
  setHiddenElementIdList: (hiddenElementIdList: string[]) => void
  setCanvasPercentage: (percentage: number) => void
  setCanvasScale: (scale: number) => void
  setCanvasDragged: (isDragged: boolean) => void
  setThumbnailsFocus: (isFocus: boolean) => void
  setEditorareaFocus: (isFocus: boolean) => void
  setDisableHotkeysState: (disable: boolean) => void
  setGridLineSize: (size: number) => void
  setRulerState: (show: boolean) => void
  setBubbleMenuState: (show: boolean) => void
  setCreatingElement: (element: CreatingElement | null) => void
  setCreatingCustomShapeState: (state: CustomShapeDrawMode | null) => void
  setEditingElementId: (editingElementId: string) => void
  setToolbarState: (toolbarState: ToolbarStates) => void
  setClipingImageElementId: (elId: string) => void
  setRichtextAttrs: (attrs: TextAttrs) => void
  setSelectedTableCells: (cells: string[]) => void
  setScalingState: (isScaling: boolean) => void
  setGesturingState: (isGesturing: boolean) => void
  updateSelectedSlidesIndex: (selectedSlidesIndex: number[]) => void
  setDialogForExport: (type: DialogForExportTypes) => void
  setTextFormatPainter: (textFormatPainter: TextFormatPainter | null) => void
  setShapeFormatPainter: (shapeFormatPainter: ShapeFormatPainter | null) => void
  setSelectPanelState: (show: boolean) => void
  setSearchPanelState: (show: boolean) => void
  setNotesPanelState: (show: boolean) => void
  setMarkupPanelState: (show: boolean) => void
  setRightPanelCollapsed: (collapsed: boolean, pin?: boolean) => void
  toggleRightPanel: () => void
  setOpenPanelOnTextSelection: (on: boolean) => void
  revealRightPanelForTextRange: () => void
  applyRightPanelAuto: (width: number, narrowPx: number) => void
}

export type MainStore = MainState & MainActions

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')
export const databaseId = nanoid(10)

const OPEN_PANEL_ON_TEXT_KEY = 'fika-open-panel-on-text-selection'

const readOpenPanelOnTextSelection = (): boolean => {
  try {
    const raw = localStorage.getItem(OPEN_PANEL_ON_TEXT_KEY)
    if (raw === '0' || raw === 'false') return false
    if (raw === '1' || raw === 'true') return true
  }
  catch {
  }
  return true
}

const writeOpenPanelOnTextSelection = (on: boolean) => {
  try {
    localStorage.setItem(OPEN_PANEL_ON_TEXT_KEY, on ? '1' : '0')
  }
  catch {
  }
}

const EMPTY_ELEMENTS: PPTElement[] = []

export const selectActiveElementList = (state: MainState) => {
  const currentSlide = selectCurrentSlide(useSlidesStore.getState())
  if (!currentSlide?.elements) return EMPTY_ELEMENTS
  return currentSlide.elements.filter(element => state.activeElementIdList.includes(element.id))
}

export const selectHandleElement = (state: MainState) => {
  const currentSlide = selectCurrentSlide(useSlidesStore.getState())
  if (!currentSlide?.elements) return null
  return currentSlide.elements.find(element => state.handleElementId === element.id) || null
}

export const useMainStore = create<MainStore>()((set, get) => ({
  activeElementIdList: [],
  handleElementId: '',
  activeGroupElementId: '',
  hiddenElementIdList: [],
  canvasPercentage: 90,
  canvasScale: 1,
  canvasDragged: false,
  thumbnailsFocus: false,
  editorAreaFocus: false,
  disableHotkeys: false,
  gridLineSize: 0,
  showRuler: false,
  showBubbleMenu: false,
  creatingElement: null,
  creatingCustomShape: null,
  editingElementId: '',
  toolbarState: ToolbarStates.SLIDE_DESIGN,
  clipingImageElementId: '',
  richTextAttrs: defaultRichTextAttrs,
  selectedTableCells: [],
  isScaling: false,
  isGesturing: false,
  selectedSlidesIndex: [],
  dialogForExport: '',
  databaseId,
  textFormatPainter: null,
  shapeFormatPainter: null,
  showSelectPanel: false,
  showSearchPanel: false,
  showNotesPanel: false,
  showMarkupPanel: false,
  rightPanelCollapsed: false,
  rightPanelPinned: null,
  openPanelOnTextSelection: readOpenPanelOnTextSelection(),

  setActiveElementIdList(activeElementIdList) {
    const handleElementId = activeElementIdList.length === 1 ? activeElementIdList[0] : ''
    const prev = get()
    if (prev.handleElementId === handleElementId && sameIdList(prev.activeElementIdList, activeElementIdList)) return
    set({ handleElementId, activeElementIdList })
  },
  setHandleElementId(handleElementId) {
    if (get().handleElementId === handleElementId) return
    set({ handleElementId })
  },
  setActiveGroupElementId(activeGroupElementId) {
    set({ activeGroupElementId })
  },
  setHiddenElementIdList(hiddenElementIdList) {
    set({ hiddenElementIdList })
  },
  setCanvasPercentage(percentage) {
    set({ canvasPercentage: percentage })
  },
  setCanvasScale(scale) {
    set({ canvasScale: scale })
  },
  setCanvasDragged(isDragged) {
    set({ canvasDragged: isDragged })
  },
  setThumbnailsFocus(isFocus) {
    set({ thumbnailsFocus: isFocus })
  },
  setEditorareaFocus(isFocus) {
    if (get().editorAreaFocus === isFocus) return
    set({ editorAreaFocus: isFocus })
  },
  setDisableHotkeysState(disable) {
    if (get().disableHotkeys === disable) return
    set({ disableHotkeys: disable })
  },
  setGridLineSize(size) {
    set({ gridLineSize: size })
  },
  setRulerState(show) {
    set({ showRuler: show })
  },
  setBubbleMenuState(show) {
    set({ showBubbleMenu: show })
  },
  setCreatingElement(element) {
    set({ creatingElement: element })
  },
  setCreatingCustomShapeState(state) {
    set({ creatingCustomShape: state })
  },
  setEditingElementId(editingElementId) {
    if (get().editingElementId === editingElementId) return
    set({ editingElementId })
  },
  setToolbarState(toolbarState) {
    set({ toolbarState })
  },
  setClipingImageElementId(elId) {
    set({ clipingImageElementId: elId })
  },
  setRichtextAttrs(attrs) {
    const prev = get().richTextAttrs
    if (
      prev.bold === attrs.bold
      && prev.em === attrs.em
      && prev.underline === attrs.underline
      && prev.strikethrough === attrs.strikethrough
      && prev.fontsize === attrs.fontsize
      && prev.fontname === attrs.fontname
      && prev.color === attrs.color
      && prev.backcolor === attrs.backcolor
      && prev.align === attrs.align
      && prev.bulletList === attrs.bulletList
      && prev.orderedList === attrs.orderedList
      && prev.blockquote === attrs.blockquote
      && prev.link === attrs.link
      && prev.superscript === attrs.superscript
      && prev.subscript === attrs.subscript
      && prev.code === attrs.code
    ) return
    set({ richTextAttrs: attrs })
  },
  setSelectedTableCells(cells) {
    set({ selectedTableCells: cells })
  },
  setScalingState(isScaling) {
    const prev = get()
    if (prev.isScaling === isScaling && prev.isGesturing === isScaling) return
    set({ isScaling, isGesturing: isScaling })
  },
  setGesturingState(isGesturing) {
    if (get().isGesturing === isGesturing) return
    set({ isGesturing })
  },
  updateSelectedSlidesIndex(selectedSlidesIndex) {
    const prev = get().selectedSlidesIndex
    if (
      prev.length === selectedSlidesIndex.length
      && prev.every((value, index) => value === selectedSlidesIndex[index])
    ) return
    set({ selectedSlidesIndex })
  },
  setDialogForExport(type) {
    set({ dialogForExport: resolveExportDialogType(type) })
  },
  setTextFormatPainter(textFormatPainter) {
    set({ textFormatPainter })
  },
  setShapeFormatPainter(shapeFormatPainter) {
    set({ shapeFormatPainter })
  },
  setSelectPanelState(show) {
    set({ showSelectPanel: show })
  },
  setSearchPanelState(show) {
    set({ showSearchPanel: show })
  },
  setNotesPanelState(show) {
    set({ showNotesPanel: show })
  },
  setMarkupPanelState(show) {
    set({ showMarkupPanel: show })
  },
  setRightPanelCollapsed(collapsed, pin) {
    set({ rightPanelCollapsed: collapsed })
    if (pin) set({ rightPanelPinned: collapsed ? 'closed' : 'open' })
  },
  toggleRightPanel() {
    const rightPanelCollapsed = !get().rightPanelCollapsed
    set({
      rightPanelCollapsed,
      rightPanelPinned: rightPanelCollapsed ? 'closed' : 'open',
    })
  },
  setOpenPanelOnTextSelection(on) {
    set({ openPanelOnTextSelection: on })
    writeOpenPanelOnTextSelection(on)
  },
  revealRightPanelForTextRange() {
    if (!get().openPanelOnTextSelection) return
    if (!get().rightPanelCollapsed) return
    set({ rightPanelCollapsed: false, rightPanelPinned: 'open' })
  },
  applyRightPanelAuto(width, narrowPx) {
    const { rightPanelPinned } = get()
    if (rightPanelPinned) {
      set({ rightPanelCollapsed: rightPanelPinned === 'closed' })
      return
    }
    set({ rightPanelCollapsed: width <= narrowPx })
  },
}))
