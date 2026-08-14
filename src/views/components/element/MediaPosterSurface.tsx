import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './MediaPosterSurface.module.scss'
const cx = bindStyles(styles)
import { memo, type CSSProperties } from 'react'

export type IMediaPosterSurfaceProps = {
  kind: 'video' | 'audio'
  poster?: string
  synthesizing?: boolean
  compact?: boolean
  color?: string
}

const MediaPosterSurface = memo((props: IMediaPosterSurfaceProps) => {
  const {
    kind,
    poster = '',
    synthesizing = false,
    compact = false,
    color = '#71717a',
  } = props

  const surfaceStyle = (kind !== 'audio' ? {} : { '--media-accent': color }) as CSSProperties

  return (
    <div
      className={cx('media-poster-surface', kind, { compact, synthesizing })}
      style={surfaceStyle}
    >
      {synthesizing && !poster ? (
        <div className={cx('skel')} aria-hidden>
          <span className={cx('shimmer')} />
        </div>
      ) : poster ? (
        <img className={cx('poster')} src={poster} alt="" />
      ) : (
        <div className={cx('fallback-icon')}>
          {kind === 'video' ? <Icon icon="play" /> : <Icon icon="music" />}
        </div>
      )}
      <span className={cx('badge')}>
        <Icon icon="play" />
      </span>
    </div>
  )
})

export default MediaPosterSurface
