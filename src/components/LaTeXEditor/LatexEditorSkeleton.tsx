import { bindStyles } from '@/utils/cssm'
import styles from './LatexEditorSkeleton.module.scss'
const cx = bindStyles(styles)
import { useEffect } from 'react'

import { ensureMathliveReady } from '@/utils/math'
import MathFieldSkeleton from './MathFieldSkeleton'

export default function LatexEditorSkeleton() {
  useEffect(() => {
    void ensureMathliveReady()
  }, [])

  return (
    <div className={cx('latex-editor-skeleton')} aria-hidden="true">
      <div className={cx('header')}>
        <span className={cx('title')} />
        <span className={cx('lede')} />
        <span className={cx('lede', 'short')} />
      </div>
      <span className={cx('label')} />
      <div className={cx('field')}>
        <MathFieldSkeleton />
        <span className={cx('kb')} />
      </div>
      <span className={cx('label')} />
      <div className={cx('tips')}>
        {[0, 1, 2].map(n => <span className={cx('tip')} key={n} />)}
      </div>
      <div className={cx('footer')}>
        <span className={cx('btn')} />
        <span className={cx('btn', 'primary')} />
      </div>
    </div>
  )
}
