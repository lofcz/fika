import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './CountdownTimer.module.scss'
const cx = bindStyles(styles)
import { useEffect, useRef, useState } from 'react'
import { fillDigit } from '@/utils/common'
import MoveablePanel from '@/components/MoveablePanel'
import { useI18nContext } from '@/i18n/useI18nContext'

export type ICountdownTimerProps = {
  left?: number
  top?: number
  onClose?: () => void
}

export default function CountdownTimer({ left = 5, top = 5, onClose }: ICountdownTimerProps) {
  const { LL } = useI18nContext()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [inTiming, setInTiming] = useState(false)
  const [isCountdown, setIsCountdown] = useState(false)
  const [time, setTime] = useState(0)
  const timeRef = useRef(time)
  timeRef.current = time
  const minute = Math.floor(time / 60)
  const second = time % 60
  const inputEditable = !isCountdown || inTiming

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  useEffect(() => () => clearTimer(), [])

  const pause = () => {
    clearTimer()
    setInTiming(false)
  }

  const reset = () => {
    clearTimer()
    setInTiming(false)
    const next = isCountdown ? 600 : 0
    timeRef.current = next
    setTime(next)
  }

  const start = () => {
    clearTimer()
    if (isCountdown) {
      timerRef.current = setInterval(() => {
        const next = timeRef.current - 1
        if (next <= 0) {
          clearTimer()
          setInTiming(false)
          timeRef.current = 600
          setTime(600)
          return
        }
        timeRef.current = next
        setTime(next)
      }, 1000)
    }
    else {
      timerRef.current = setInterval(() => {
        const next = timeRef.current + 1
        if (next > 36000) {
          clearTimer()
          setInTiming(false)
          return
        }
        timeRef.current = next
        setTime(next)
      }, 1000)
    }
    setInTiming(true)
  }

  const toggle = () => {
    if (inTiming) pause()
    else start()
  }

  const toggleCountdown = () => {
    const nextCountdown = !isCountdown
    setIsCountdown(nextCountdown)
    clearTimer()
    setInTiming(false)
    const nextTime = nextCountdown ? 600 : 0
    timeRef.current = nextTime
    setTime(nextTime)
  }

  const changeTime = (e: React.ChangeEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>, type: 'minute' | 'second') => {
    const inputRef = e.target as HTMLInputElement
    let value = inputRef.value
    const isNumber = /^(\d)+$/.test(value)
    if (isNumber) {
      if (type === 'second' && +value >= 60) value = '59'
      setTime(type === 'minute' ? (+value * 60 + second) : (+value + minute * 60))
    }
    else inputRef.value = type === 'minute' ? fillDigit(minute, 2) : fillDigit(second, 2)
  }

  return (
    <MoveablePanel className={cx('countdown-timer')} width={180} height={110} left={left} top={top}>
      <div className={cx('header')}>
        <span className={cx('text-btn')} onClick={toggle}>{inTiming ? LL.screen.countdownTimer.pause() : LL.screen.countdownTimer.start()}</span>
        <span className={cx('text-btn')} onClick={reset}>{LL.common.reset()}</span>
        <span className={cx('text-btn', { active: isCountdown })} onClick={toggleCountdown}>{LL.screen.countdownTimer.countdown()}</span>
      </div>
      <div className={cx('content')}>
        <div className={cx('timer')}>
          <input
            type="text"
            value={fillDigit(minute, 2)}
            maxLength={3}
            disabled={inputEditable}
            onChange={event => changeTime(event, 'minute')}
            onMouseDown={event => event.stopPropagation()}
            onBlur={event => changeTime(event, 'minute')}
            onKeyDown={event => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.stopPropagation()
                changeTime(event, 'minute')
              }
            }}
          />
        </div>
        <div className={cx('colon')}>:</div>
        <div className={cx('timer')}>
          <input
            type="text"
            value={fillDigit(second, 2)}
            maxLength={3}
            disabled={inputEditable}
            onChange={event => changeTime(event, 'second')}
            onMouseDown={event => event.stopPropagation()}
            onBlur={event => changeTime(event, 'second')}
            onKeyDown={event => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.stopPropagation()
                changeTime(event, 'second')
              }
            }}
          />
        </div>
      </div>
      <div className={cx('close-btn')} onClick={onClose}>
        <Icon icon="x" className={cx('icon')} />
      </div>
    </MoveablePanel>
  )
}
