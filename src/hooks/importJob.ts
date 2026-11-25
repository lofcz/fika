import { useSyncExternalStore } from 'react'
import { createJobProgress } from '@/utils/jobProgress'

export const importJob = createJobProgress()

export const subscribeImportJob = (onChange: () => void) => importJob.subscribe(onChange)
export const getImportJobSnapshot = () => (
  `${Number(importJob.running.value)}:${importJob.progress.value}:${importJob.current.value}:${importJob.total.value}`
)

export function useImportProgress() {
  const snapshot = useSyncExternalStore(subscribeImportJob, getImportJobSnapshot, getImportJobSnapshot)
  const [running, progress, current, total] = snapshot.split(':')
  return {
    importing: running === '1',
    importProgress: Number(progress) || 0,
    importSlide: Number(current) || 0,
    importSlideTotal: Number(total) || 0,
  }
}
