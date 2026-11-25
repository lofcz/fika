import { useMemo, useState, useEffect } from 'react'
import type { TableCell } from '@/types/slides'
import { containsMath } from '@/utils/markdown'
import { ensureMathliveReady, mathReady, subscribeMathReady } from '@/utils/math'

/** `formatText` reads the `mathReady` flag during render. */
export default (cells: TableCell[][]) => {
  const needsMath = useMemo(() => (
    cells.some(row => row.some(cell => (
      containsMath(cell.text || '')
      || (cell.textFormat === 'html' && (cell.text.includes('data-latex') || cell.text.includes('fika-math')))
    )))
  ), [cells])
  const [ready, setReady] = useState(mathReady.value)
  useEffect(() => {
    if (!needsMath) return
    if (mathReady.value) {
      if (!ready) setReady(true)
      return
    }
    let cancelled = false
    const unsub = subscribeMathReady(() => {
      if (!cancelled) setReady(true)
    })
    void ensureMathliveReady().then(() => {
      if (!cancelled) setReady(true)
    }).catch(() => {})
    return () => {
      cancelled = true
      unsub()
    }
  }, [needsMath, ready])
  return ready
}
