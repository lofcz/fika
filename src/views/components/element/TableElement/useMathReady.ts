import { useMemo, useState, useEffect } from 'react'
import type { TableCell } from '@/types/slides'
import { containsMath } from '@/utils/markdown'
import { ensureMathliveReady, mathReady } from '@/utils/math'

/** `formatText` reads the `mathReady` flag during render. */
export default (cells: TableCell[][]) => {
  const needsMath = useMemo(() => (
    cells.some(row => row.some(cell => containsMath(cell.text || '')))
  ), [cells])
  const [ready, setReady] = useState(mathReady.value)
  useEffect(() => {
    if (!needsMath || ready) return
    let cancelled = false
    void ensureMathliveReady().then(() => {
      if (!cancelled) setReady(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [needsMath, ready])
  return ready
}
