import { bindStyles } from '@/utils/cssm'
import styles from './SelectGroup.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, memo } from 'react'

export type ISelectGroupProps = {
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  children?: ReactNode
}

const SelectGroup = memo((props: ISelectGroupProps) => {
  return (
    <div className={cx('select-group', props.className)} style={props.style} data-tooltip={props['data-tooltip']}>
      {props.children}
    </div>
  )
})

export default SelectGroup
