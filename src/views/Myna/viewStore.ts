import { create } from 'zustand'

export interface MynaViewPreferences {
  showRulers: boolean
  showGuides: boolean
  snapToGuides: boolean
  guidesLocked: boolean
  snapPages: boolean
  snapPagesToGrid: boolean
  showGrid: boolean
  gridSize: number
}
export interface MynaViewState extends MynaViewPreferences {
  setPreference: <K extends keyof MynaViewPreferences>(key: K, value: MynaViewPreferences[K]) => void
}
const defaults: MynaViewPreferences = { showRulers: true, showGuides: true, snapToGuides: true, guidesLocked: false, showGrid: false, snapPages: true, snapPagesToGrid: false, gridSize: 20 }
const storageKey = 'fika:myna:view:v1'
function readPreferences(): MynaViewPreferences {
  const value = { ...defaults }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved && typeof saved === 'object') {
      for (const key of ['showRulers', 'showGuides', 'snapToGuides', 'guidesLocked', 'showGrid', 'snapPages', 'snapPagesToGrid'] as const) if (typeof saved[key] === 'boolean') value[key] = saved[key]
      if (Number.isFinite(saved.gridSize)) value.gridSize = Math.max(4, Math.min(400, Math.round(saved.gridSize)))
    }
  } catch { /* View settings work without storage, including server-side imports. */ }
  return value
}
export const useMynaViewStore = create<MynaViewState>((set, get) => ({
  ...readPreferences(),
  setPreference: (key, value) => {
    if (key === 'gridSize') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return
      value = Math.max(4, Math.min(400, Math.round(value))) as typeof value
    }
    set({ [key]: value })
    const { setPreference: _setPreference, ...preferences } = get()
    try { localStorage.setItem(storageKey, JSON.stringify(preferences)) } catch { /* Storage is optional. */ }
  },
}))
