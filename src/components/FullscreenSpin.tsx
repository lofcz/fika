import { bindStyles } from '@/utils/cssm'
import styles from './FullscreenSpin.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'
import { createPortal } from 'react-dom'

import InkLoader from '@/components/InkLoader'
import InkProgress from '@/components/InkProgress'
import { getFikaPortalTarget } from '@/utils/portal'

export type IFullscreenSpinProps = {
  loading?: boolean
  mask?: boolean
  tip?: string
  progress?: number
  className?: string
}

const FullscreenSpin = memo((vrProps: IFullscreenSpinProps) => {
  const loading = vrProps.loading ?? false
  const mask = vrProps.mask ?? true
  const tip = vrProps.tip ?? ''
  const progress = vrProps.progress
  const hasProgress = progress !== undefined

  if (!loading) return null

  return createPortal(
    <div className={cx('fullscreen-spin', { mask }, vrProps.className)}>
      <div className={cx('spin')}>
        {hasProgress ? <InkProgress progress={progress!} /> : <InkLoader />}
        {tip ? <div className={cx('text')}>{tip}</div> : null}
      </div>
    </div>,
    getFikaPortalTarget(),
  )
})

export default FullscreenSpin
