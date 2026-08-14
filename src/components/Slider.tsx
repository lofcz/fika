import { bindStyles } from '@/utils/cssm'
import styles from './Slider.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, useRef, memo, useState, useEffect } from 'react'

import NP from 'number-precision'

type SliderBaseProps = {
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
}

type SingleSliderProps = SliderBaseProps & {
  range?: false
  value: number
  onUpdateValue?: (payload: number) => void
}

type RangeSliderProps = SliderBaseProps & {
  range: true
  value: [number, number]
  onUpdateValue?: (payload: [number, number]) => void
}

export type ISliderProps = SingleSliderProps | RangeSliderProps

const isRangeSlider = (props: ISliderProps): props is RangeSliderProps => {
  return Array.isArray(props.value)
}

const emitSingle = (props: SingleSliderProps, next: number) => {
  props.onUpdateValue?.(next)
}

const emitRange = (props: RangeSliderProps, next: [number, number]) => {
  props.onUpdateValue?.(next)
}

const getBoundingClientRectViewLeft = (element: HTMLElement) => {
  return element.getBoundingClientRect().left
}

const Slider = memo((vrProps: ISliderProps) => {
  const {
    value,
    disabled = false,
    min = 0,
    max = 100,
    step = 1,
    range = false,
    className,
    style,
    'data-tooltip': dataTooltip,
  } = vrProps

  const sliderRef = useRef<HTMLDivElement | null>(null)
  const [percentage, setPercentage] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const percentageRef = useRef(percentage)
  const startRef = useRef(start)
  const endRef = useRef(end)
  const handlerRef = useRef<'start' | 'end'>('end')

  const assignPercentage = (next: number) => {
    percentageRef.current = next
    setPercentage(next)
  }
  const assignStart = (next: number) => {
    startRef.current = next
    setStart(next)
  }
  const assignEnd = (next: number) => {
    endRef.current = next
    setEnd(next)
  }
  const assignHandler = (next: 'start' | 'end') => {
    handlerRef.current = next
  }

  const clampPercentage = (next: number) => Math.min(Math.max(next, 0), 100)

  const getNewValue = (next: number) => {
    let diff = next / 100 * (max - min)
    if (step >= 1) diff = Math.fround(diff)
    else {
      const str = step.toString()
      const match = str.match(/^[0.]*([1-9])/)
      if (match) {
        const targetNumber = match[1]
        const position = str.indexOf(targetNumber) - 1
        if (position > 0) {
          const accuracy = Math.pow(10, position)
          diff = Math.fround(diff * accuracy) / accuracy
        }
      }
    }
    return NP.plus(diff, min)
  }

  const tooltipValue = getNewValue(percentage)
  const tooltipRangeStartValue = getNewValue(start)
  const tooltipRangeEndValue = getNewValue(end)

  useEffect(() => {
    if (max === min) return
    if (typeof value === 'number') {
      assignPercentage(clampPercentage((value - min) / (max - min) * 100))
    }
    else {
      assignStart(clampPercentage((value[0] - min) / (max - min) * 100))
      assignEnd(clampPercentage((value[1] - min) / (max - min) * 100))
    }
  }, [value, min, max])

  const getPercentage = (e: MouseEvent | TouchEvent) => {
    if (!sliderRef.current) return 0
    const clientX = 'clientX' in e ? e.clientX : e.changedTouches[0].clientX
    let progress = (clientX - getBoundingClientRectViewLeft(sliderRef.current)) / sliderRef.current.clientWidth
    progress = Math.max(progress, 0)
    progress = Math.min(progress, 1)

    let next = progress * 100
    const stepPct = step / (max - min) * 100
    const remainder = next % stepPct
    if (remainder > 0) {
      if (remainder <= stepPct / 2) next = next - remainder
      else next = next - remainder + stepPct
    }
    return next
  }

  const updateRange = (e: MouseEvent | TouchEvent) => {
    const next = getPercentage(e)
    if (handlerRef.current === 'start') assignStart(next)
    else assignEnd(next)
  }

  const updatePercentage = (e: MouseEvent | TouchEvent) => {
    assignPercentage(getPercentage(e))
  }

  const updateRangeEnd = (e: MouseEvent | TouchEvent) => {
    updatePercentage(e)
    if (isRangeSlider(vrProps)) {
      const newValue = getNewValue(percentageRef.current)
      const oldValueArr = vrProps.value
      const newValueArr: [number, number] = handlerRef.current === 'start'
        ? [newValue, oldValueArr[1]]
        : [oldValueArr[0], newValue]
      if (newValueArr[0] > newValueArr[1]) {
        [newValueArr[0], newValueArr[1]] = [newValueArr[1], newValueArr[0]]
      }
      emitRange(vrProps, newValueArr)
    }
    document.removeEventListener('mousemove', updateRange)
    document.removeEventListener('touchmove', updateRange)
    document.removeEventListener('mouseup', updateRangeEnd)
    document.removeEventListener('touchend', updateRangeEnd)
  }

  const updatePercentageEnd = (e: MouseEvent | TouchEvent) => {
    updatePercentage(e)
    if (!isRangeSlider(vrProps)) emitSingle(vrProps, getNewValue(percentageRef.current))
    document.removeEventListener('mousemove', updatePercentage)
    document.removeEventListener('touchmove', updatePercentage)
    document.removeEventListener('mouseup', updatePercentageEnd)
    document.removeEventListener('touchend', updatePercentageEnd)
  }

  const handleMousedown = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return
    const native = e.nativeEvent

    if (range) {
      const next = getPercentage(native)
      if (Math.abs(next - startRef.current) < Math.abs(next - endRef.current)) assignHandler('start')
      else assignHandler('end')
      document.addEventListener('mousemove', updateRange)
      document.addEventListener('touchmove', updateRange)
      document.addEventListener('mouseup', updateRangeEnd)
      document.addEventListener('touchend', updateRangeEnd)
    }
    else {
      document.addEventListener('mousemove', updatePercentage)
      document.addEventListener('touchmove', updatePercentage)
      document.addEventListener('mouseup', updatePercentageEnd)
      document.addEventListener('touchend', updatePercentageEnd)
    }
  }

  return (
    <div
      className={cx('slider', { disabled }, className)}
      style={style}
      data-tooltip={dataTooltip}
      ref={sliderRef}
      onMouseDown={handleMousedown}
    >
      <div className={cx('bar')}>
        {!range ? (
          <>
            <div className={cx('track')} style={{ width: `${percentage}%` }} />
            <div className={cx('thumb')} style={{ left: `${percentage}%` }} data-tooltip={tooltipValue} />
          </>
        ) : (
          <>
            <div className={cx('track')} style={{ width: `${end - start}%`, left: `${start}%` }} />
            <div className={cx('thumb')} style={{ left: `${start}%` }} data-tooltip={tooltipRangeStartValue} />
            <div className={cx('thumb')} style={{ left: `${end}%` }} data-tooltip={tooltipRangeEndValue} />
          </>
        )}
      </div>
    </div>
  )
})

export default Slider
