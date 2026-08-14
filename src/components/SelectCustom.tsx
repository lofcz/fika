import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './SelectCustom.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, useRef, memo, useState, useEffect } from 'react'

import Popover from './Popover'

export type ISelectCustomProps = {
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  label?: ReactNode
  icon?: ReactNode
  options?: ReactNode
}

const SelectCustom = memo((props: ISelectCustomProps) => {
  const {
    disabled = false,
    className,
    style,
    'data-tooltip': dataTooltip,
    label,
    icon,
    options,
  } = props
  const [popoverVisible, setPopoverVisible] = useState(false)
  const selectRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  const updateWidth = () => {
    if (!selectRef.current) return
    setWidth(selectRef.current.clientWidth)
  }

  useEffect(() => {
    const el = selectRef.current
    if (!el) return
    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(el)
    updateWidth()
    return () => resizeObserver.disconnect()
  }, [disabled])

  const trigger = (
    <div className={cx('select', disabled && 'disabled')} ref={selectRef} data-tooltip={dataTooltip}>
      <div className={cx('selector')}>{label}</div>
      <div className={cx('icon')}>
        {icon ?? <Icon icon="chevron-down" />}
      </div>
    </div>
  )

  if (disabled) {
    return (
      <div className={cx('select-wrap', className)} style={style} data-tooltip={dataTooltip}>
        {trigger}
      </div>
    )
  }

  return (
    <Popover
      className={cx('select-wrap', className)}
      style={style}
      trigger="click"
      value={popoverVisible}
      onUpdateValue={(next: boolean) => setPopoverVisible(next)}
      placement="bottom"
      contentStyle={{ padding: 0 }}
      content={(
        <div className={cx('options')} style={{ width: width + 2 + 'px' }} onClick={() => setPopoverVisible(false)}>
          {options}
        </div>
      )}
    >
      {trigger}
    </Popover>
  )
})

export default SelectCustom
