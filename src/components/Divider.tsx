import { bindStyles } from '@/utils/cssm'
import styles from './Divider.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, memo } from 'react'

export type IDividerProps = {
  type?: 'horizontal' | 'vertical'
  margin?: number
  className?: string
  style?: CSSProperties
}

const Divider = memo((vrProps: IDividerProps) => {
  const type = vrProps.type ?? 'horizontal'
  const margin = vrProps.margin ?? -1

  return (
    <div
      className={cx('divider', type, vrProps.className)}
      style={{
        margin: type === 'horizontal' ? `${margin >= 0 ? margin : 24}px 0` : `0 ${margin >= 0 ? margin : 8}px`,
        ...vrProps.style,
      }}
    />
  )
})

export default Divider
