import { useShallow } from 'zustand/react/shallow'
import { useMainStore, selectHandleElement, selectActiveElementList } from './main'
import { useSlidesStore, selectCurrentSlide, selectCurrentSlideAnimations, selectFormatedAnimations, selectSlideId, selectElementById, selectIsEmptySlide } from './slides'
import { useSnapshotStore, selectCanUndo, selectCanRedo } from './snapshot'
import { useKeyboardStore, selectCtrlOrShiftKeyActive, syncPointerModifiers } from './keyboard'
import { useScreenStore } from './screen'
import { useImportConfirmStore } from './importConfirm'

export const useActiveElementList = () => useMainStore(useShallow(selectActiveElementList))
export const useCurrentSlideAnimations = () => useSlidesStore(useShallow(selectCurrentSlideAnimations))
export const useFormatedAnimations = () => useSlidesStore(useShallow(selectFormatedAnimations))

export {
  useMainStore,
  selectHandleElement,
  selectActiveElementList,
  useSlidesStore,
  selectCurrentSlide,
  selectIsEmptySlide,
  selectCurrentSlideAnimations,
  selectFormatedAnimations,
  selectSlideId,
  selectElementById,
  useSnapshotStore,
  selectCanUndo,
  selectCanRedo,
  useKeyboardStore,
  selectCtrlOrShiftKeyActive,
  syncPointerModifiers,
  useScreenStore,
  useImportConfirmStore,
}

if (typeof window !== 'undefined' && import.meta.env.MODE === 'development') {
  Object.assign(window, {
    __FIKA_SLIDES__: useSlidesStore,
    __FIKA_MAIN__: useMainStore,
  })
}
