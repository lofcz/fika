/** One-based page specification, preserving the user's order and removing duplicates. */
export function parseExportPages(value: string, count: number): number[] | null {
  if (!Number.isInteger(count) || count < 1 || !value.trim()) return null
  const result = new Set<number>()
  for (const token of value.split(',')) {
    const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+)\s*)?$/.exec(token)
    if (!match) return null
    const first = Number(match[1]), last = Number(match[2] ?? match[1])
    if (first < 1 || last < first || last > count) return null
    for (let page = first; page <= last; page++) result.add(page - 1)
  }
  return [...result]
}
