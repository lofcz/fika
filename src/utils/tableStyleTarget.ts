const lastStyleTarget = new Map<string, string[]>()

/** Keep the last in-cell style target so Present/deselect cannot widen the next fill. */
export function rememberTableStyleTarget(elementId: string, cells: string[]) {
  if (!elementId || !cells.length) return
  lastStyleTarget.set(elementId, cells)
}

export function tableStyleTarget(elementId: string, cells?: string[]) {
  if (cells?.length) return cells
  return lastStyleTarget.get(elementId) ?? []
}
