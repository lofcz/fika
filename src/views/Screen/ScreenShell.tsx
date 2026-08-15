import { bindStyles } from '@/utils/cssm'
import { createPortal } from 'react-dom'
import { getFikaPortalTarget } from '@/utils/portal'
import { useSlidesStore } from '@/store'
import useSlideBackgroundStyle from '@/hooks/useSlideBackgroundStyle'
import styles from './index.module.scss'

const cx = bindStyles(styles)

/** Instant present backdrop: theme/slide fill only, no slide tree. */
export default function ScreenShell() {
  const background = useSlidesStore(s => s.slides[s.slideIndex]?.background)
  const themeBackground = useSlidesStore(s => s.theme.backgroundColor)
  const { backgroundStyle } = useSlideBackgroundStyle(background)
  const fill = background ? backgroundStyle : { backgroundColor: themeBackground || '#1d1d1d' }

  return createPortal(
    <div className="fika-embed-root" style={{ position: 'fixed', inset: 0, zIndex: 2147483000 }}>
      <div className={cx('fika-screen', 'screen-shell')} data-fika-screen data-fika-screen-shell style={fill} />
    </div>,
    getFikaPortalTarget(),
  )
}
