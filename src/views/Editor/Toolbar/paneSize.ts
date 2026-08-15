const STORAGE_KEY = 'fika-right-pane-width'

export const RIGHT_PANE_MIN = 220
export const RIGHT_PANE_DEFAULT = 260
export const RIGHT_PANE_MAX = 420
const RIGHT_PANE_SCALE_FLOOR = 160
const CENTER_RESERVE = 520

export type PaneSizePreference = {
  width: number
  hostWidth: number
}

const hostCap = (hostWidth: number, floor: number) => (
  hostWidth > 0 ? Math.max(floor, hostWidth - CENTER_RESERVE) : RIGHT_PANE_MAX
)

const clampTo = (width: number, hostWidth: number | undefined, floor: number) => {
  const cap = hostWidth && hostWidth > 0 ? hostCap(hostWidth, floor) : RIGHT_PANE_MAX
  return Math.round(Math.min(RIGHT_PANE_MAX, cap, Math.max(floor, width)))
}

export const scalePreferredPx = (preferredPx: number, preferredHost: number, currentHost: number) => {
  if (!(preferredPx > 0)) return 0
  if (!(preferredHost > 0) || !(currentHost > 0)) return Math.round(preferredPx)
  return preferredPx * currentHost / preferredHost
}

const clamp = (width: number, hostWidth?: number) => clampTo(width, hostWidth, RIGHT_PANE_MIN)

const parsePreference = (raw: string, fallbackHost: number): PaneSizePreference | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<PaneSizePreference>
    if (
      parsed
      && typeof parsed === 'object'
      && Number.isFinite(parsed.width)
      && Number.isFinite(parsed.hostWidth)
      && (parsed.hostWidth ?? 0) > 0
    ) {
      return { width: parsed.width as number, hostWidth: parsed.hostWidth as number }
    }
  }
  catch {}
  const legacy = Number.parseInt(raw, 10)
  if (Number.isFinite(legacy)) {
    return { width: legacy, hostWidth: fallbackHost > 0 ? fallbackHost : legacy }
  }
  return null
}

export const readRightPanePreference = (hostWidth?: number): PaneSizePreference => {
  const host = hostWidth && hostWidth > 0 ? hostWidth : 0
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = parsePreference(raw, host)
      if (parsed) return parsed
    }
  }
  catch {}
  return {
    width: RIGHT_PANE_DEFAULT,
    hostWidth: host > 0 ? host : RIGHT_PANE_DEFAULT,
  }
}

export const scaleRightPaneWidth = (preference: PaneSizePreference, hostWidth?: number) => {
  const host = hostWidth && hostWidth > 0 ? hostWidth : preference.hostWidth
  const scaled = scalePreferredPx(preference.width, preference.hostWidth, host)
  return clampTo(scaled, host, RIGHT_PANE_SCALE_FLOOR)
}

export const readRightPaneWidth = (hostWidth?: number) => (
  scaleRightPaneWidth(readRightPanePreference(hostWidth), hostWidth)
)

export const writeRightPaneWidth = (width: number, hostWidth?: number) => {
  const host = hostWidth && hostWidth > 0 ? hostWidth : 0
  const next = clamp(width, host || undefined)
  const preference: PaneSizePreference = {
    width: next,
    hostWidth: host > 0 ? host : next,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
  }
  catch {}
  return preference
}

export const clampRightPaneWidth = clamp
