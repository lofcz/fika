import { bindStyles } from '@/utils/cssm'
import styles from './PanelSection.module.scss'
const cx = bindStyles(styles)
import { memo, type CSSProperties, type ReactNode } from 'react'

export type IPanelSectionProps = {
  label?: string
  action?: ReactNode
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

const PanelSection = memo(function PanelSection({ label, action, children, className, style }: IPanelSectionProps) {
  return (
    <section className={[cx('panel-section'), className].filter(Boolean).join(' ')} style={style}>
      {label || action ? (
        <div className={cx('panel-section-header')}>
          {label ? <div className={cx('panel-section-label')}>{label}</div> : null}
          {action ? <div className={cx('panel-section-action')}>{action}</div> : null}
        </div>
      ) : null}
      <div className={cx('panel-section-body')}>{children}</div>
    </section>
  )
})

export default PanelSection
