import { bindStyles } from '@/utils/cssm'
import styles from './InkLoader.module.scss'
const cx = bindStyles(styles)
import { memo, useId } from 'react'

const InkLoader = memo(() => {
  const gooId = `ink-goo-${useId().replace(/:/g, '')}`

  return (
    <div className={cx('ink-loader')} aria-hidden>
      <svg className={cx('field')} viewBox="0 0 96 96">
        <defs>
          <filter id={gooId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5.5" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
        <g filter={`url(#${gooId})`}>
          <circle className={cx('drop', 'core')} cx="48" cy="48" r="11" />
          <circle className={cx('drop', 'a')} cx="48" cy="48" r="9" />
          <circle className={cx('drop', 'b')} cx="48" cy="48" r="8" />
          <circle className={cx('drop', 'c')} cx="48" cy="48" r="7" />
        </g>
      </svg>
    </div>
  )
})

export default InkLoader
