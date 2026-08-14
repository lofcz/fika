import { bindStyles } from '@/utils/cssm'
import styles from './MathFieldSkeleton.module.scss'
const cx = bindStyles(styles)

export type IMathFieldSkeletonProps = {
  className?: string
}

export default function MathFieldSkeleton({ className }: IMathFieldSkeletonProps) {
  return (
    <div className={cx('math-field-skeleton', className)} aria-hidden="true">
      <span className={cx('caret')} />
    </div>
  )
}
