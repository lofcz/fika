import { create } from 'zustand'

export interface KeyboardState {
  ctrlKeyState: boolean
  shiftKeyState: boolean
  altKeyState: boolean
  spaceKeyState: boolean
}

export interface KeyboardActions {
  setCtrlKeyState: (active: boolean) => void
  setShiftKeyState: (active: boolean) => void
  setAltKeyState: (active: boolean) => void
  setSpaceKeyState: (active: boolean) => void
}

export type KeyboardStore = KeyboardState & KeyboardActions

export const selectCtrlOrShiftKeyActive = (state: KeyboardState) => (
  state.ctrlKeyState || state.shiftKeyState
)

export const syncPointerModifiers = (e: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }) => {
  const store = useKeyboardStore.getState()
  const ctrl = !!(e.ctrlKey || e.metaKey)
  const alt = !!e.altKey
  const shift = !!e.shiftKey
  if (store.ctrlKeyState !== ctrl) store.setCtrlKeyState(ctrl)
  if (store.altKeyState !== alt) store.setAltKeyState(alt)
  if (store.shiftKeyState !== shift) store.setShiftKeyState(shift)
}

export const useKeyboardStore = create<KeyboardStore>()((set) => ({
  ctrlKeyState: false,
  shiftKeyState: false,
  altKeyState: false,
  spaceKeyState: false,
  setCtrlKeyState(active) {
    set({ ctrlKeyState: active })
  },
  setShiftKeyState(active) {
    set({ shiftKeyState: active })
  },
  setAltKeyState(active) {
    set({ altKeyState: active })
  },
  setSpaceKeyState(active) {
    set({ spaceKeyState: active })
  },
}))
