import { useRef, useCallback } from 'react'
import { useMainStore, useKeyboardStore } from '@/store'
import type { PPTElement } from '@/types/slides'
import { getPointerClient } from '@/utils/canvasPointer'
import { richTextAttrsFromElement } from '@/utils/prosemirror/richTextAttrsFromElement'

const eventModifierKeys = (e: MouseEvent | TouchEvent) => {
  if ('ctrlKey' in e) {
    return {
      ctrl: !!(e.ctrlKey || e.metaKey),
      shift: !!e.shiftKey,
    }
  }
  return { ctrl: false, shift: false }
}

export default (
  elementList: PPTElement[],
  moveElement: (e: MouseEvent | TouchEvent, element: PPTElement) => void,
) => {
  const elementListRef = useRef(elementList)
  elementListRef.current = elementList
  const moveElementRef = useRef(moveElement)
  moveElementRef.current = moveElement

  const selectElement = useCallback((e: MouseEvent | TouchEvent, element: PPTElement, startMove = true, andEdit = false) => {
    const mainStore = useMainStore.getState()
    const keyboardStore = useKeyboardStore.getState()
    const list = elementListRef.current
    const activeIds = mainStore.activeElementIdList
    const eventMods = eventModifierKeys(e)
    const ctrlKeyState = keyboardStore.ctrlKeyState || eventMods.ctrl
    const ctrlOrShiftKeyActive = keyboardStore.ctrlKeyState || keyboardStore.shiftKeyState || eventMods.ctrl || eventMods.shift
    const editPatch = andEdit
      ? { editingElementId: element.id, disableHotkeys: true as const }
      : null
    const richTextAttrs = richTextAttrsFromElement(element)

    if (!activeIds.includes(element.id)) {
      let newActiveIdList: string[] = []
      if (ctrlOrShiftKeyActive) {
        newActiveIdList = [...activeIds, element.id]
      }
      else newActiveIdList = [element.id]
      if (element.groupId) {
        const groupMembersId: string[] = []
        list.forEach(el => {
          if (el.groupId === element.groupId) groupMembersId.push(el.id)
        })
        newActiveIdList = [...newActiveIdList, ...groupMembersId]
      }
      useMainStore.setState({
        editorAreaFocus: true,
        activeElementIdList: [...new Set(newActiveIdList)],
        handleElementId: element.id,
        ...editPatch,
        ...(richTextAttrs ? { richTextAttrs } : {}),
      })
    }
    else if (ctrlKeyState && startMove) {
      const start = getPointerClient(e)
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target) {
        target.onmouseup = (upEvent: MouseEvent) => {
          if (start.x === upEvent.clientX && start.y === upEvent.clientY) {
            let newActiveIdList: string[] = []
            if (element.groupId) {
              const groupMembersId: string[] = []
              elementListRef.current.forEach(el => {
                if (el.groupId === element.groupId) groupMembersId.push(el.id)
              })
              newActiveIdList = useMainStore.getState().activeElementIdList.filter(id => !groupMembersId.includes(id))
            }
            else {
              newActiveIdList = useMainStore.getState().activeElementIdList.filter(id => id !== element.id)
            }
            if (newActiveIdList.length > 0) {
              useMainStore.getState().setActiveElementIdList(newActiveIdList)
            }
          }
          target.onmouseup = null
        }
      }
    }
    else if (ctrlOrShiftKeyActive) {
      let newActiveIdList: string[] = []
      if (element.groupId) {
        const groupMembersId: string[] = []
        list.forEach(el => {
          if (el.groupId === element.groupId) groupMembersId.push(el.id)
        })
        newActiveIdList = activeIds.filter(id => !groupMembersId.includes(id))
      }
      else {
        newActiveIdList = activeIds.filter(id => id !== element.id)
      }
      if (newActiveIdList.length > 0) {
        mainStore.setActiveElementIdList(newActiveIdList)
      }
    }
    else if (mainStore.handleElementId !== element.id) {
      mainStore.setHandleElementId(element.id)
    }
    else if (mainStore.activeGroupElementId !== element.id) {
      const start = getPointerClient(e)
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target) {
        target.onmouseup = (upEvent: MouseEvent) => {
          if (start.x === upEvent.clientX && start.y === upEvent.clientY) {
            useMainStore.getState().setActiveGroupElementId(element.id)
            target.onmouseup = null
          }
        }
      }
    }
    else if (!mainStore.editorAreaFocus) {
      mainStore.setEditorareaFocus(true)
    }
    if (andEdit) {
      const next = useMainStore.getState()
      if (next.editingElementId !== element.id || !next.disableHotkeys) {
        useMainStore.setState({
          editorAreaFocus: true,
          editingElementId: element.id,
          disableHotkeys: true,
          ...(richTextAttrs ? { richTextAttrs } : {}),
        })
      }
    }
    if (richTextAttrs && useMainStore.getState().handleElementId === element.id) {
      useMainStore.getState().setRichtextAttrs(richTextAttrs)
    }
    if (startMove) moveElementRef.current(e, element)
  }, [])

  return {
    selectElement,
  }
}
