import { bindStyles } from '@/utils/cssm'
import styles from './SlideAnimationPanel.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo } from 'react'
import { DEFAULT_TURNING_MODE } from '@/configs/animation'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { TurningMode } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import FitText from '@/components/FitText'
import { useI18nContext } from '@/i18n/useI18nContext'

const resolveTurningMode = (mode: TurningMode | undefined) => mode ?? DEFAULT_TURNING_MODE

const StackMark = () => (
  <svg className={cx('apply-all-mark')} viewBox="0 0 16 14" aria-hidden="true">
    <rect x="4.2" y="0.7" width="10.6" height="7.6" rx="1.3" />
    <rect x="2.3" y="2.5" width="10.6" height="7.6" rx="1.3" />
    <rect x="0.5" y="4.4" width="10.8" height="8.1" rx="1.4" className={cx('apply-all-mark-front')} />
  </svg>
)

const CheckMark = () => (
  <svg className={cx('apply-all-mark')} viewBox="0 0 16 14" aria-hidden="true">
    <path d="M2.4 7.1 L6.2 10.8 L13.6 3.2" />
  </svg>
)

const SlideAnimationPanel = memo(function SlideAnimationPanel() {
  const { LL } = useI18nContext()
  const currentTurningMode = useSlidesStore(s => resolveTurningMode(selectCurrentSlide(s)?.turningMode))
  const appliedToAll = useSlidesStore(s => {
    const mode = resolveTurningMode(selectCurrentSlide(s)?.turningMode)
    return s.slides.every(slide => resolveTurningMode(slide.turningMode) === mode)
  })
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

  const currentLabel = animations.find(item => item.value === currentTurningMode)?.label ?? ''
  const applyLabel = appliedToAll
    ? LL.editor.slideAnimation.appliedToAll()
    : LL.editor.slideAnimation.applyToAll()

  const updateTurningMode = (mode: TurningMode) => {
    if (mode === currentTurningMode) return
    useSlidesStore.getState().updateSlide({ turningMode: mode })
    addHistorySnapshot()
  }

  const applyAllSlide = () => {
    const { slides } = useSlidesStore.getState()
    const turningMode = resolveTurningMode(selectCurrentSlide(useSlidesStore.getState())?.turningMode)
    let changed = false
    const next = slides.map(slide => {
      if (resolveTurningMode(slide.turningMode) === turningMode) return slide
      changed = true
      return { ...slide, turningMode }
    })
    if (!changed) return
    useSlidesStore.getState().setSlides(next, undefined, { clone: false })
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
      <button
        type="button"
        className={cx('apply-all', { done: appliedToAll })}
        disabled={appliedToAll}
        aria-label={`${applyLabel}: ${currentLabel}`}
        onMouseDown={event => { event.preventDefault() }}
        onClick={applyAllSlide}
      >
        {appliedToAll ? <CheckMark /> : <StackMark />}
        <span className={cx('apply-all-copy')}>
          <span className={cx('apply-all-title')}>{applyLabel}</span>
          <span className={cx('apply-all-name')}>{currentLabel}</span>
        </span>
      </button>
    </div>
  )
})

export default SlideAnimationPanel
