import { memo } from 'react'

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

const JobProgressOverlay = memo((props: IJobProgressOverlayProps) => {
  const job = useImport()
  const loading = !!jobBoxValue(props.loading ?? job.importing, false)
  const progress = Math.min(1, Math.max(0, Number(jobBoxValue(props.progress ?? job.importProgress, 0)) || 0))
  const current = Number(jobBoxValue(props.current ?? job.importSlide, 0)) || 0
  const total = Number(jobBoxValue(props.total ?? job.importSlideTotal, 0)) || 0
  const tip = formatJobProgressTip(loading, current, total, props.labels)
  return <FullscreenSpin loading={loading} tip={tip} progress={loading ? progress : undefined} />
})

export default JobProgressOverlay
