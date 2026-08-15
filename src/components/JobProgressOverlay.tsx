import { memo, useEffect, useRef, useState } from 'react'

import FullscreenSpin from '@/components/FullscreenSpin'
import useImport from '@/hooks/useImport'
import { formatJobProgressTip, jobBoxValue, type JobProgressLabels } from '@/utils/jobProgress'

export type IJobProgressOverlayProps = {
  loading?: boolean | { value: boolean }
  progress?: number | { value: number }
  current?: number | { value: number }
  total?: number | { value: number }
  labels: JobProgressLabels
}

const CLOSE_HOLD_MS = 400

const JobProgressOverlay = memo((props: IJobProgressOverlayProps) => {
  const job = useImport()
  const loading = !!jobBoxValue(props.loading ?? job.importing, false)
  const liveProgress = Math.min(1, Math.max(0, Number(jobBoxValue(props.progress ?? job.importProgress, 0)) || 0))
  const current = Number(jobBoxValue(props.current ?? job.importSlide, 0)) || 0
  const total = Number(jobBoxValue(props.total ?? job.importSlideTotal, 0)) || 0

  const peakRef = useRef(0)
  const seenRef = useRef(false)
  const [holding, setHolding] = useState(false)

  if (loading) peakRef.current = Math.max(peakRef.current, liveProgress)

  useEffect(() => {
    if (loading) {
      seenRef.current = true
      setHolding(true)
      return
    }
    if (!seenRef.current) return
    const id = window.setTimeout(() => {
      seenRef.current = false
      setHolding(false)
      peakRef.current = 0
    }, CLOSE_HOLD_MS)
    return () => window.clearTimeout(id)
  }, [loading])

  const visible = loading || holding
  const progress = loading ? Math.max(peakRef.current, liveProgress) : 1
  const tip = formatJobProgressTip(visible, current, total, props.labels)
  return <FullscreenSpin loading={visible} tip={tip} progress={visible ? progress : undefined} />
})

export default JobProgressOverlay
