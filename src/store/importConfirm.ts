import { create } from 'zustand'
import type { ImportApplyMode } from '@/utils/importApply'

export type ImportConfirmChoice = ImportApplyMode | null

export interface ImportConfirmState {
  visible: boolean
  slideCount: number
}

export interface ImportConfirmActions {
  register: () => () => void
  request: (count: number) => Promise<ImportConfirmChoice>
  settle: (choice: ImportConfirmChoice) => void
}

export type ImportConfirmStore = ImportConfirmState & ImportConfirmActions

export const useImportConfirmStore = create<ImportConfirmStore>()((set, get) => {
  let mounted = 0
  let resolvePending: ((choice: ImportConfirmChoice) => void) | null = null

  return {
    visible: false,
    slideCount: 0,

    register() {
      mounted += 1
      return () => {
        mounted = Math.max(0, mounted - 1)
      }
    },

    request(count) {
      if (mounted <= 0) return Promise.resolve(null)
      if (resolvePending) {
        resolvePending(null)
        resolvePending = null
      }
      set({ slideCount: count, visible: true })
      return new Promise<ImportConfirmChoice>(resolve => {
        resolvePending = resolve
      })
    },

    settle(choice) {
      set({ visible: false })
      if (!resolvePending) return
      const resolve = resolvePending
      resolvePending = null
      resolve(choice)
    },
  }
})
