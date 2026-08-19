import { useShallow } from 'zustand/react/shallow'
import { useMainStore, selectHandleElement, selectActiveElementList } from './main'
import { useSlidesStore, selectCurrentSlide, selectSlideById, selectCurrentSlideAnimations, selectFormatedAnimations, selectElementWaitsForInAnimation, selectSlideId, selectElementById, selectIsEmptySlide } from './slides'
import { useSnapshotStore, selectCanUndo, selectCanRedo } from './snapshot'
import { useKeyboardStore, selectCtrlOrShiftKeyActive, syncPointerModifiers } from './keyboard'
import { useScreenStore } from './screen'
import { useImportConfirmStore } from './importConfirm'

export const useActiveElementList = () => useMainStore(useShallow(selectActiveElementList))
export const useCurrentSlideAnimations = () => useSlidesStore(selectCurrentSlideAnimations)
export const useFormatedAnimations = () => useSlidesStore(selectFormatedAnimations)

export {
  useMainStore,
  selectHandleElement,
  selectActiveElementList,
  useSlidesStore,
  selectCurrentSlide,
  selectSlideById,
  selectIsEmptySlide,
  selectCurrentSlideAnimations,
  selectFormatedAnimations,
  selectElementWaitsForInAnimation,
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
    __FIKA_SCREEN__: useScreenStore,
    __FIKA_KEYBOARD__: useKeyboardStore,
  })
  void import('@/embed/agentic/templates').then(({ registerTemplateLoaders }) => {
    Object.assign(window, {
      __FIKA_TEMPLATES__: {
        setLoaders: registerTemplateLoaders,
      },
    })
  })
  void import('@/embed/agentic/createAgenticApi').then(({ createAgenticApi }) => {
    const runtime = createAgenticApi()
    const toCommand = (commandOrType: string | Record<string, unknown>, payload?: unknown) => {
      if (typeof commandOrType === 'string') {
        return { type: commandOrType, payload, meta: { source: 'agent' as const } }
      }
      return commandOrType
    }
    Object.assign(window, {
      __FIKA_AGENTIC__: {
        execute: (commandOrType: string | Record<string, unknown>, payload?: unknown) => (
          runtime.api.execute(toCommand(commandOrType, payload) as never)
        ),
        executeBatch: (
          commands: Array<string | Record<string, unknown>>,
          options?: { commit?: boolean; atomic?: boolean; dryRun?: boolean },
        ) => runtime.api.executeBatch(
          commands.map(command => (typeof command === 'string' ? { type: command, meta: { source: 'agent' as const } } : command)) as never,
          options,
        ),
        stop: () => runtime.stop(),
      },
    })
  })
}
