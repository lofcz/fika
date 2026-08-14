import { useEffect, useRef } from 'react'
import { useMainStore, useSlidesStore, useKeyboardStore, selectHandleElement, selectCurrentSlide } from '@/store'
import { ElementOrderCommands } from '@/types/edit'
import { KEYS } from '@/configs/hotkey'
import { isTypingTarget } from '@/utils/hotkeyTarget'
import { isAppOwnedEvent } from '@/utils/portal'

import useSlideHandler from './useSlideHandler'
import useLockElement from './useLockElement'
import useDeleteElement from './useDeleteElement'
import useCombineElement from './useCombineElement'
import useCopyAndPasteElement from './useCopyAndPasteElement'
import useSelectElement from './useSelectElement'
import useMoveElement from './useMoveElement'
import useOrderElement from './useOrderElement'
import useHistorySnapshot from './useHistorySnapshot'
import useScreening from './useScreening'
import { resetCanvas, scaleCanvas } from './useScaleCanvas'

export default () => {
  const {
    updateSlideIndex,
    copySlide,
    createSlide,
    deleteSlide,
    cutSlide,
    copyAndPasteSlide,
    selectAllSlide,
  } = useSlideHandler()

  const { combineElements, uncombineElements } = useCombineElement()
  const { deleteElement } = useDeleteElement()
  const { lockElement } = useLockElement()
  const { copyElement, cutElement, quickCopyElement } = useCopyAndPasteElement()
  const { selectAllElements } = useSelectElement()
  const { moveElement } = useMoveElement()
  const { orderElement } = useOrderElement()
  const { redo, undo } = useHistorySnapshot()
  const { enterScreening, enterScreeningFromStart } = useScreening()

  const stableActionsRef = useRef({ redo, undo, enterScreening, enterScreeningFromStart })

  const actionsRef = useRef({
    updateSlideIndex,
    copySlide,
    createSlide,
    deleteSlide,
    cutSlide,
    copyAndPasteSlide,
    selectAllSlide,
    combineElements,
    uncombineElements,
    deleteElement,
    lockElement,
    copyElement,
    cutElement,
    quickCopyElement,
    selectAllElements,
    moveElement,
    orderElement,
  })
  actionsRef.current = {
    updateSlideIndex,
    copySlide,
    createSlide,
    deleteSlide,
    cutSlide,
    copyAndPasteSlide,
    selectAllSlide,
    combineElements,
    uncombineElements,
    deleteElement,
    lockElement,
    copyElement,
    cutElement,
    quickCopyElement,
    selectAllElements,
    moveElement,
    orderElement,
  }

  useEffect(() => {
    const copy = () => {
      const { activeElementIdList, thumbnailsFocus } = useMainStore.getState()
      if (activeElementIdList.length) actionsRef.current.copyElement()
      else if (thumbnailsFocus) actionsRef.current.copySlide()
    }

    const cut = () => {
      const { activeElementIdList, thumbnailsFocus } = useMainStore.getState()
      if (activeElementIdList.length) actionsRef.current.cutElement()
      else if (thumbnailsFocus) actionsRef.current.cutSlide()
    }

    const quickCopy = () => {
      const { activeElementIdList, thumbnailsFocus } = useMainStore.getState()
      if (activeElementIdList.length) actionsRef.current.quickCopyElement()
      else if (thumbnailsFocus) actionsRef.current.copyAndPasteSlide()
    }

    const selectAll = () => {
      const { editorAreaFocus, thumbnailsFocus } = useMainStore.getState()
      if (editorAreaFocus) actionsRef.current.selectAllElements()
      if (thumbnailsFocus) actionsRef.current.selectAllSlide()
    }

    const lock = () => {
      if (!useMainStore.getState().editorAreaFocus) return
      actionsRef.current.lockElement()
    }
    const combine = () => {
      if (!useMainStore.getState().editorAreaFocus) return
      actionsRef.current.combineElements()
    }

    const uncombine = () => {
      if (!useMainStore.getState().editorAreaFocus) return
      actionsRef.current.uncombineElements()
    }

    const remove = () => {
      const { activeElementIdList, thumbnailsFocus } = useMainStore.getState()
      if (activeElementIdList.length) actionsRef.current.deleteElement()
      else if (thumbnailsFocus) actionsRef.current.deleteSlide()
    }

    const move = (key: string) => {
      const { activeElementIdList } = useMainStore.getState()
      if (activeElementIdList.length) actionsRef.current.moveElement(key)
      else if (key === KEYS.UP || key === KEYS.DOWN) actionsRef.current.updateSlideIndex(key)
    }

    const moveSlide = (key: string) => {
      if (key === KEYS.PAGEUP) actionsRef.current.updateSlideIndex(KEYS.UP)
      else if (key === KEYS.PAGEDOWN) actionsRef.current.updateSlideIndex(KEYS.DOWN)
    }

    const order = (command: ElementOrderCommands) => {
      const handleElement = selectHandleElement(useMainStore.getState())
      if (!handleElement) return
      actionsRef.current.orderElement(handleElement, command)
    }

    const create = () => {
      if (!useMainStore.getState().thumbnailsFocus) return
      actionsRef.current.createSlide()
    }

    const tabActiveElement = () => {
      const currentSlide = selectCurrentSlide(useSlidesStore.getState())
      const { handleElementId, setActiveElementIdList } = useMainStore.getState()
      if (!currentSlide?.elements.length) return
      if (!handleElementId) {
        const firstElement = currentSlide.elements[0]
        setActiveElementIdList([firstElement.id])
        return
      }
      const currentIndex = currentSlide.elements.findIndex(el => el.id === handleElementId)
      const nextIndex = currentIndex >= currentSlide.elements.length - 1 ? 0 : currentIndex + 1
      const nextElementId = currentSlide.elements[nextIndex].id

      setActiveElementIdList([nextElementId])
    }

    const clearAllModifiers = () => {
      const keyboardStore = useKeyboardStore.getState()
      if (keyboardStore.ctrlKeyState) keyboardStore.setCtrlKeyState(false)
      if (keyboardStore.shiftKeyState) keyboardStore.setShiftKeyState(false)
      if (keyboardStore.altKeyState) keyboardStore.setAltKeyState(false)
      if (keyboardStore.spaceKeyState) keyboardStore.setSpaceKeyState(false)
    }

    const trackModifiers = (e: KeyboardEvent) => {
      const mainStore = useMainStore.getState()
      if (!isAppOwnedEvent(e) && !mainStore.editorAreaFocus) return
      const keyboardStore = useKeyboardStore.getState()
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !keyboardStore.ctrlKeyState) keyboardStore.setCtrlKeyState(true)
      if (e.shiftKey && !keyboardStore.shiftKeyState) keyboardStore.setShiftKeyState(true)
      if (e.altKey && !keyboardStore.altKeyState) keyboardStore.setAltKeyState(true)
      if (e.altKey && (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') && mainStore.editorAreaFocus) {
        e.preventDefault()
      }
    }

    const keydownListener = (e: KeyboardEvent) => {
      trackModifiers(e)
      if (!isAppOwnedEvent(e)) return
      const { ctrlKey, shiftKey, altKey, metaKey } = e
      const ctrlOrMetaKeyActive = ctrlKey || metaKey

      const key = e.key.toUpperCase()
      const code = e.code

      const mainStore = useMainStore.getState()
      const keyboardStore = useKeyboardStore.getState()

      if (ctrlOrMetaKeyActive && key === KEYS.P) {
        e.preventDefault()
        mainStore.setDialogForExport('pptx')
        return
      }
      if (shiftKey && key === KEYS.F5) {
        e.preventDefault()
        stableActionsRef.current.enterScreening()
        keyboardStore.setShiftKeyState(false)
        return
      }
      if (key === KEYS.F5) {
        e.preventDefault()
        stableActionsRef.current.enterScreeningFromStart()
        return
      }
      if (ctrlOrMetaKeyActive && key === KEYS.F) {
        e.preventDefault()
        mainStore.setSearchPanelState(!mainStore.showSearchPanel)
        return
      }
      if (ctrlOrMetaKeyActive && (code === 'Minus' || key === KEYS.MINUS)) {
        e.preventDefault()
        scaleCanvas('-')
        return
      }
      if (ctrlOrMetaKeyActive && (code === 'Equal' || key === KEYS.EQUAL || key === '+')) {
        e.preventDefault()
        scaleCanvas('+')
        return
      }
      if (ctrlOrMetaKeyActive && (code === 'Digit0' || key === KEYS.DIGIT_0)) {
        e.preventDefault()
        resetCanvas()
        return
      }

      if (isTypingTarget(e.target)) return

      if (!mainStore.disableHotkeys && key === KEYS.SPACE) keyboardStore.setSpaceKeyState(true)

      if (!mainStore.editorAreaFocus && !mainStore.thumbnailsFocus) return

      if (ctrlOrMetaKeyActive && key === KEYS.C) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        copy()
      }
      if (ctrlOrMetaKeyActive && key === KEYS.X) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        cut()
      }
      if (ctrlOrMetaKeyActive && key === KEYS.D) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        quickCopy()
      }
      if (ctrlOrMetaKeyActive && key === KEYS.Z) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        stableActionsRef.current.undo()
      }
      if (ctrlOrMetaKeyActive && key === KEYS.Y) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        stableActionsRef.current.redo()
      }
      if (ctrlOrMetaKeyActive && key === KEYS.A) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        selectAll()
      }
      if (ctrlOrMetaKeyActive && key === KEYS.L) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        lock()
      }
      if (!shiftKey && ctrlOrMetaKeyActive && key === KEYS.G) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        combine()
      }
      if (shiftKey && ctrlOrMetaKeyActive && key === KEYS.G) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        uncombine()
      }
      if (altKey && key === KEYS.F) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        order(ElementOrderCommands.TOP)
      }
      if (altKey && key === KEYS.B) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        order(ElementOrderCommands.BOTTOM)
      }
      if (key === KEYS.DELETE || key === KEYS.BACKSPACE) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        remove()
      }
      if (key === KEYS.UP) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        move(KEYS.UP)
      }
      if (key === KEYS.DOWN) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        move(KEYS.DOWN)
      }
      if (key === KEYS.LEFT) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        move(KEYS.LEFT)
      }
      if (key === KEYS.RIGHT) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        move(KEYS.RIGHT)
      }
      if (key === KEYS.PAGEUP) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        moveSlide(KEYS.PAGEUP)
      }
      if (key === KEYS.PAGEDOWN) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        moveSlide(KEYS.PAGEDOWN)
      }
      if (key === KEYS.ENTER) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        create()
      }
      if (key === KEYS.TAB) {
        if (mainStore.disableHotkeys) return
        e.preventDefault()
        tabActiveElement()
      }
      if (mainStore.editorAreaFocus && !shiftKey && !ctrlOrMetaKeyActive && !mainStore.disableHotkeys) {
        if (key === KEYS.T) {
          mainStore.setCreatingElement({ type: 'text' })
        }
        else if (key === KEYS.R) {
          mainStore.setCreatingElement({ type: 'shape', data: {
            viewBox: [200, 200],
            path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
          }})
        }
        else if (key === KEYS.O) {
          mainStore.setCreatingElement({ type: 'shape', data: {
            viewBox: [200, 200],
            path: 'M 100 0 A 50 50 0 1 1 100 200 A 50 50 0 1 1 100 0 Z',
          }})
        }
        else if (key === KEYS.L) {
          mainStore.setCreatingElement({ type: 'line', data: {
            path: 'M 0 0 L 20 20',
            style: 'solid',
            points: ['', ''],
          }})
        }
      }
    }

    const keyupListener = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase()
      const keyboardStore = useKeyboardStore.getState()
      if (key === 'CONTROL' || key === 'META') {
        if (!e.ctrlKey && !e.metaKey) keyboardStore.setCtrlKeyState(false)
      }
      else if (key === 'SHIFT') {
        if (!e.shiftKey) keyboardStore.setShiftKeyState(false)
      }
      else if (key === 'ALT') {
        if (!e.altKey) keyboardStore.setAltKeyState(false)
      }
      else if (key === KEYS.SPACE || e.code === 'Space') {
        keyboardStore.setSpaceKeyState(false)
      }
    }

    document.addEventListener('keydown', keydownListener)
    document.addEventListener('keyup', keyupListener)
    window.addEventListener('keydown', trackModifiers, true)
    window.addEventListener('blur', clearAllModifiers)
    return () => {
      document.removeEventListener('keydown', keydownListener)
      document.removeEventListener('keyup', keyupListener)
      window.removeEventListener('keydown', trackModifiers, true)
      window.removeEventListener('blur', clearAllModifiers)
    }
  }, [])
}
