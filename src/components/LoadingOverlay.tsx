import { bindStyles } from '@/utils/cssm'
import styles from './LoadingOverlay.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, memo } from 'react'

import '@/directive/loading.scss'

export type ILoadingOverlayProps = {
  state: boolean
  text?: string
  className?: string
  children?: ReactNode
}

const LoadingOverlay = memo((props: ILoadingOverlayProps) => {
  const { state, text } = props
  return (
    <div className={cx('loading-host', { 'is-loading': state }, props.className)}>
      {props.children}
      {state ? (
        <div
          className={cx('directive-loading-overlay', { 'has-text': !!text })}
          style={text ? { '--directive-loading-text': JSON.stringify(text) } as CSSProperties : undefined}
        />
      ) : null}
    </div>
  )
})

export default LoadingOverlay
