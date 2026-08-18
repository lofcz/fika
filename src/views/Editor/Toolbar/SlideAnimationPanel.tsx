import { bindStyles } from '@/utils/cssm'
import styles from './SlideAnimationPanel.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo } from 'react'
import { DEFAULT_TURNING_MODE } from '@/configs/animation'
import { pickerModesForGroup, SLIDE_ANIMATION_GROUPS, SLIDE_ANIMATION_PICKER } from '@/configs/transitions'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { TurningGroup, TurningMode } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import FitText from '@/components/FitText'
import { useI18nContext } from '@/i18n/useI18nContext'

const resolveTurningMode = (mode: TurningMode | undefined, fallback: TurningMode = DEFAULT_TURNING_MODE) => (
  mode ?? fallback
)

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

const TransitionCard = memo(function TransitionCard({
  label,
  value,
  active,
  onSelect,
}: {
  label: string
  value: TurningMode
  active: boolean
  onSelect: (mode: TurningMode) => void
}) {
  return (
    <button
      type="button"
      className={cx('transition-card', { active })}
      onMouseDown={event => { event.preventDefault() }}
      onClick={() => onSelect(value)}
    >
      <div className={cx('stage', value)}>
        <div className={cx('slide outgoing')}>
          <span className={cx('rule')} />
          <span className={cx('rule')} />
          <span className={cx('rule short')} />
        </div>
        {value !== 'no' ? (
          <div className={cx('slide incoming')}>
            <span className={cx('rule')} />
            <span className={cx('rule')} />
            <span className={cx('rule short')} />
          </div>
        ) : null}
        {value === 'throughInk' ? <div className={cx('veil')} /> : null}
      </div>
      <span className={cx('label')}>
        <FitText text={label} maxFontSize={12} minFontSize={8} />
      </span>
    </button>
  )
})

const SlideAnimationPanel = memo(function SlideAnimationPanel() {
  const { LL } = useI18nContext()
  const defaultTurningMode = useSlidesStore(s => s.defaultTurningMode)
  const currentTurningMode = useSlidesStore(s => resolveTurningMode(selectCurrentSlide(s)?.turningMode, s.defaultTurningMode))
  const appliedToAll = useSlidesStore(s => {
    const mode = resolveTurningMode(selectCurrentSlide(s)?.turningMode, s.defaultTurningMode)
    return s.slides.every(slide => resolveTurningMode(slide.turningMode, s.defaultTurningMode) === mode)
  })
  const { addHistorySnapshot } = useHistorySnapshot()

  const labels = LL.configs.animation.slide
  const groups = LL.configs.animation.slideGroups
  const labelFor = (mode: TurningMode) => labels[mode]()

  const sections = useMemo(() => {
    const items: { group: TurningGroup; modes: TurningMode[] }[] = SLIDE_ANIMATION_GROUPS.map(group => ({
      group,
      modes: pickerModesForGroup(group),
    }))
    if (!SLIDE_ANIMATION_PICKER.includes(currentTurningMode)) {
      items.push({ group: 'classic', modes: [currentTurningMode] })
    }
    return items
  }, [currentTurningMode])

  const currentLabel = labelFor(currentTurningMode)
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
    const turningMode = resolveTurningMode(
      selectCurrentSlide(useSlidesStore.getState())?.turningMode,
      defaultTurningMode,
    )
    useSlidesStore.getState().setDefaultTurningMode(turningMode)
    let changed = false
    const next = slides.map(slide => {
      if (resolveTurningMode(slide.turningMode, defaultTurningMode) === turningMode) return slide
      changed = true
      return { ...slide, turningMode }
    })
    if (!changed) return
    useSlidesStore.getState().setSlides(next, undefined, { clone: false })
    addHistorySnapshot()
  }

  return (
    <div className={cx('slide-animation-panel')}>
      {sections.map(section => (
        <section className={cx('transition-section')} key={section.group}>
          <div className={cx('group-label')}>{groups[section.group]()}</div>
          <div className={cx('transition-grid')}>
            {section.modes.map(value => (
              <TransitionCard
                key={value}
                value={value}
                label={labelFor(value)}
                active={currentTurningMode === value}
                onSelect={updateTurningMode}
              />
            ))}
          </div>
        </section>
      ))}
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
