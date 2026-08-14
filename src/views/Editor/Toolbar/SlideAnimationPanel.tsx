import { bindStyles } from '@/utils/cssm'
import styles from './SlideAnimationPanel.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo } from 'react'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { TurningMode } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import message from '@/utils/message'
import FitText from '@/components/FitText'
import { useI18nContext } from '@/i18n/useI18nContext'

const SlideAnimationPanel = memo(function SlideAnimationPanel() {
  const { LL } = useI18nContext()
  const currentTurningMode = useSlidesStore(s => selectCurrentSlide(s)?.turningMode || 'slideY')
  const { addHistorySnapshot } = useHistorySnapshot()

  const animations = useMemo(() => {
    const slide = LL.configs.animation.slide
    return [
      { label: slide.no(), value: 'no' as TurningMode },
      { label: slide.fade(), value: 'fade' as TurningMode },
      { label: slide.slideX(), value: 'slideX' as TurningMode },
      { label: slide.slideY(), value: 'slideY' as TurningMode },
      { label: slide.slideX3D(), value: 'slideX3D' as TurningMode },
      { label: slide.slideY3D(), value: 'slideY3D' as TurningMode },
      { label: slide.rotate(), value: 'rotate' as TurningMode },
      { label: slide.scaleY(), value: 'scaleY' as TurningMode },
      { label: slide.scaleX(), value: 'scaleX' as TurningMode },
      { label: slide.scale(), value: 'scale' as TurningMode },
      { label: slide.scaleReverse(), value: 'scaleReverse' as TurningMode },
      { label: slide.random(), value: 'random' as TurningMode },
    ]
  }, [LL])

  const updateTurningMode = (mode: TurningMode) => {
    if (mode === currentTurningMode) return
    useSlidesStore.getState().updateSlide({ turningMode: mode })
    addHistorySnapshot()
  }

  const applyAllSlide = () => {
    const { slides } = useSlidesStore.getState()
    const turningMode = selectCurrentSlide(useSlidesStore.getState())?.turningMode
    useSlidesStore.getState().setSlides(slides.map(slide => ({ ...slide, turningMode })))
    message.success(LL.editor.slideAnimation.appliedToAll())
    addHistorySnapshot()
  }

  return (
    <div className={cx('slide-animation-panel')}>
      <div className={cx('transition-grid')}>
        {animations.map(item => (
          <button
            type="button"
            className={cx('transition-card', { active: currentTurningMode === item.value })}
            key={item.value}
            onMouseDown={event => { event.preventDefault() }}
            onClick={() => updateTurningMode(item.value)}
          >
            <div className={cx('stage', item.value)}>
              <div className={cx('slide outgoing')}>
                <span className={cx('rule')} />
                <span className={cx('rule')} />
                <span className={cx('rule short')} />
              </div>
              {item.value !== 'no' ? (
                <div className={cx('slide incoming')}>
                  <span className={cx('rule')} />
                  <span className={cx('rule')} />
                  <span className={cx('rule short')} />
                </div>
              ) : null}
            </div>
            <span className={cx('label')}>
              <FitText text={item.label} maxFontSize={12} minFontSize={8} />
            </span>
          </button>
        ))}
      </div>
      <button type="button" className={cx('apply-all')} onMouseDown={event => { event.preventDefault() }} onClick={() => applyAllSlide()}>
        {LL.editor.slideAnimation.applyToAll()}
      </button>
    </div>
  )
})

export default SlideAnimationPanel
