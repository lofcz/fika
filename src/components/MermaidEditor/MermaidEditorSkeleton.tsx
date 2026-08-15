import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useEffect } from 'react'

import { prefetchMermaid } from '@/utils/mermaid'
import { useI18nContext } from '@/i18n/useI18nContext'
import Button from '@/components/Button'

export default function MermaidEditorSkeleton() {
  const { LL } = useI18nContext()

  useEffect(() => {
    prefetchMermaid()
  }, [])

  return (
    <div className={cx('mermaid-editor')} aria-hidden="true">
      <div className={cx('container')}>
        <div className={cx('input-area')} />
        <div className={cx('preview')}>
          <div className={cx('placeholder')}>{LL.components.mermaidEditor.previewPlaceholder()}</div>
        </div>
      </div>
      <div className={cx('footer')}>
        <Button className={cx('btn')} disabled>{LL.common.cancel()}</Button>
        <Button className={cx('btn')} type="primary" disabled>{LL.common.ok()}</Button>
      </div>
    </div>
  )
}
