import { useState } from 'react'
import { ToolbarStates } from '@/types/toolbar'

export function resolveToolbarPanelState(
  selectionTabKeys: readonly ToolbarStates[],
  toolbarState: ToolbarStates,
): ToolbarStates {
  return selectionTabKeys.includes(toolbarState) ? toolbarState : selectionTabKeys[0]
}

export function rememberSeen<T>(seen: readonly T[], current: T | null | undefined): T[] {
  if (current == null || seen.includes(current)) return seen as T[]
  return [...seen, current]
}

export function useKeepAlive<T>(current: T | null | undefined): T[] {
  const [seen, setSeen] = useState<T[]>(() => rememberSeen([], current))
  const next = rememberSeen(seen, current)
  if (next !== seen) setSeen(next)
  return next
}
