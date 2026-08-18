import { bindStyles } from '@/utils/cssm'
import styles from './InkProgress.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, useState, useEffect, useRef } from 'react'

export type IInkProgressProps = {
  /** Fraction in `[0, 1]`. */
  progress: number
}

const RING = 2 * Math.PI * 40

const toPercent = (progress: number) => {
  const n = Number(progress)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n * 100))
}

const InkProgress = memo((props: IInkProgressProps) => {
  const startPct = toPercent(props.progress)
  const [displayed, setDisplayed] = useState(startPct)
  const rafRef = useRef(0)
  const displayedRef = useRef(startPct)
  const peakRef = useRef(startPct)

  const percent = Math.round(displayed)
  const ringOffset = RING * (1 - displayed / 100)

  const prefersReducedMotion = () => {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  const animateTo = useCallback((targetPct: number) => {
    const to = Math.max(peakRef.current, Math.max(0, Math.min(100, targetPct)))
    peakRef.current = to
    cancelAnimationFrame(rafRef.current)
    if (to <= displayedRef.current) {
      displayedRef.current = to
      setDisplayed(to)
      return
    }
    if (prefersReducedMotion() || to - displayedRef.current < 0.2 || (to >= 100 && displayedRef.current >= 97)) {
      displayedRef.current = to
      setDisplayed(to)
      return
    }
    const from = displayedRef.current
    const start = performance.now()
    const duration = to >= 100
      ? Math.min(280, Math.max(160, (to - from) * 10))
      : Math.min(720, Math.max(320, (to - from) * 14))
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      const next = Math.max(from, Math.min(to, from + (to - from) * eased))
      displayedRef.current = next
      setDisplayed(next)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else {
        displayedRef.current = to
        setDisplayed(to)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    animateTo(toPercent(props.progress))
  }, [props.progress, animateTo])

  useEffect(() => () => { cancelAnimationFrame(rafRef.current) }, [])

  return (
    <div className={cx('ink-progress')} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <svg className={cx('ink-ring')} viewBox="0 0 96 96" aria-hidden>
        <circle className={cx('track')} cx="48" cy="48" r="40" />
        <circle className={cx('fill')} cx="48" cy="48" r="40" strokeDasharray={RING} strokeDashoffset={ringOffset} />
      </svg>
      <div className={cx('pct')}>
        <span className={cx('value')}>
          <span className={cx('num')}>{percent}</span>
          <span className={cx('unit')}>%</span>
        </span>
      </div>
    </div>
  )
})

export default InkProgress
