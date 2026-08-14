import { create } from 'zustand'

export interface ScreenState {
  screening: boolean
}

export interface ScreenActions {
  setScreening: (screening: boolean) => void
}

export type ScreenStore = ScreenState & ScreenActions

export const useScreenStore = create<ScreenStore>()((set) => ({
  screening: false,
  setScreening(screening) {
    set({ screening })
  },
}))
