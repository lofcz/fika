import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './MobilePreview.module.scss'
const cx = bindStyles(styles)
import { useEffect, useRef, useState } from 'react'
import { useSlidesStore } from '@/store'
import type { Mode } from '@/types/mobile'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import Divider from '@/components/Divider'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IMobilePreviewProps = {
  changeMode: (mode: Mode) => void
}

export default function MobilePreview({ changeMode }: IMobilePreviewProps) {
  const { LL } = useI18nContext()
  const slides = useSlidesStore(s => s.slides)
  const mobileRef = useRef<HTMLDivElement | null>(null)
  const [screenWidth, setScreenWidth] = useState(0)

  useEffect(() => {
    if (!mobileRef.current) return
    setScreenWidth(mobileRef.current.clientWidth)
  }, [])

  return (
    <div className={cx('mobile-preview')} ref={mobileRef}>
      <div className={cx('thumbnail-list')}>
        {slides.map(slide => (
          <div className={cx('thumbnail-item')} key={slide.id}>
            <ThumbnailSlide
              slide={{ id: slide.id }}
              size={screenWidth - 20}
            />
          </div>
        ))}
      </div>
      <div className={cx('menu')}>
        <div className={cx('menu-item')} onClick={() => changeMode('editor')}>
          <Icon icon="pencil" className={cx('icon')} /> {LL.common.edit()}
        </div>
        <Divider type="vertical" style={{ height: '30px' }} />
        <div className={cx('menu-item')} onClick={() => changeMode('player')}>
          <Icon icon="play" className={cx('icon')} /> {LL.mobile.preview.play()}
        </div>
      </div>
    </div>
  )
}
