import { useMainStore, selectActiveElementList, selectHandleElement, type MainStore } from './main';
import { useSlidesStore, selectCurrentSlide, selectCurrentSlideAnimations, selectFormatedAnimations, type SlidesStore } from './slides';
import { useSnapshotStore, selectCanUndo, selectCanRedo, type SnapshotStore } from './snapshot';
import { useKeyboardStore, selectCtrlOrShiftKeyActive, type KeyboardStore } from './keyboard';
import { useScreenStore, type ScreenStore } from './screen';
import { useImportConfirmStore, type ImportConfirmStore } from './importConfirm';

function live<
  T extends object,
  G extends Record<string, (state: NoInfer<T>) => unknown> = {},
>(
  getState: () => T,
  getters: G = {} as G,
): T & { [K in keyof G]: ReturnType<G[K]> } {
  return new Proxy({} as T & { [K in keyof G]: ReturnType<G[K]> }, {
    get(_target, prop) {
      const state = getState();
      if (typeof prop === 'string' && prop in getters) return getters[prop](state);
      const value = Reflect.get(state, prop);
      return typeof value === 'function' ? value.bind(state) : value;
    }
  });
}

export function createStores() {
  const getSlides: () => SlidesStore = useSlidesStore.getState;
  const getMain: () => MainStore = useMainStore.getState;
  const getSnapshot: () => SnapshotStore = useSnapshotStore.getState;
  const getKeyboard: () => KeyboardStore = useKeyboardStore.getState;
  const getScreen: () => ScreenStore = useScreenStore.getState;
  const getImportConfirm: () => ImportConfirmStore = useImportConfirmStore.getState;

  return {
    slides: live(getSlides, {
      currentSlide: selectCurrentSlide,
      currentSlideAnimations: selectCurrentSlideAnimations,
      formatedAnimations: selectFormatedAnimations
    }),
    main: live(getMain, {
      activeElementList: selectActiveElementList,
      handleElement: selectHandleElement
    }),
    snapshot: live(getSnapshot, {
      canUndo: selectCanUndo,
      canRedo: selectCanRedo
    }),
    keyboard: live(getKeyboard, {
      ctrlOrShiftKeyActive: selectCtrlOrShiftKeyActive
    }),
    screen: live(getScreen),
    importConfirm: live(getImportConfirm)
  };
}
export type Stores = ReturnType<typeof createStores>;
