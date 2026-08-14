import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './PanelAccordion.module.scss'
const cx = bindStyles(styles)
import { useState, type CSSProperties, type ReactNode } from 'react'

export type IPanelAccordionProps = {
  label: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export default function PanelAccordion({ label, children, className, style }: IPanelAccordionProps) {
  const [expanded, setExpanded] = useState(false)

  const toggle = () => {
    setExpanded(next => !next)
  }

  return (
    <section className={[cx('panel-accordion'), className].filter(Boolean).join(' ')} style={style}>
      <button
        type="button"
        className={cx('panel-accordion-trigger')}
        onMouseDown={event => event.preventDefault()}
        onClick={toggle}
      >
        <span className={cx('panel-accordion-label')}>{label}</span>
        <Icon icon="chevron-down" className={cx('panel-accordion-chevron', { open: expanded })} />
      </button>
      <div className={cx('panel-accordion-body')} style={{ display: expanded ? undefined : 'none' }}>
        {children}
      </div>
    </section>
  )
}
