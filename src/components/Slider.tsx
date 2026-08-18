import { bindStyles } from '@/utils/cssm'
import styles from './Slider.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, useRef, memo, useState, useEffect, useMemo } from 'react'

import NP from 'number-precision'
import { throttle } from '@/utils/debounce'

const LIVE_INPUT_MS = 32

type SliderBaseProps = {
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  className?: string
  style?: CSSProperties
  tooltipSuffix?: string
  'data-tooltip'?: string
  'data-style-slider'?: string
}

type SingleSliderProps = SliderBaseProps & {
  range?: false
  value: number
  onInput?: (payload: number) => void
  onUpdateValue?: (payload: number) => void
}

type RangeSliderProps = SliderBaseProps & {
  range: true
  value: [number, number]
  onInput?: (payload: [number, number]) => void
  onUpdateValue?: (payload: [number, number]) => void
}

export type ISliderProps = SingleSliderProps | RangeSliderProps

const isRangeSlider = (props: ISliderProps): props is RangeSliderProps => {
  return Array.isArray(props.value)
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
    tooltipSuffix = '',
    'data-tooltip': dataTooltip,
    'data-style-slider': dataStyleSlider,
  } = vrProps

  const sliderRef = useRef<HTMLDivElement | null>(null)
  const [percentage, setPercentage] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const percentageRef = useRef(percentage)
  const startRef = useRef(start)
  const endRef = useRef(end)
  const handlerRef = useRef<'start' | 'end'>('end')
  const draggingRef = useRef(false)
  const onInputRef = useRef(vrProps.onInput)
  const onUpdateValueRef = useRef(vrProps.onUpdateValue)
  onInputRef.current = vrProps.onInput
  onUpdateValueRef.current = vrProps.onUpdateValue

  const emitInput = useMemo(() => throttle((next: number | [number, number]) => {
    onInputRef.current?.(next as never)
  }, LIVE_INPUT_MS), [])

  useEffect(() => () => emitInput.cancel(), [emitInput])

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

  const formatTooltip = (next: number) => `${getNewValue(next)}${tooltipSuffix}`
  const tooltipValue = formatTooltip(percentage)
  const tooltipRangeStartValue = formatTooltip(start)
  const tooltipRangeEndValue = formatTooltip(end)

  useEffect(() => {
    if (draggingRef.current || max === min) return
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

  const readRangeValue = (): [number, number] => {
    const startValue = getNewValue(startRef.current)
    const endValue = getNewValue(endRef.current)
    return startValue > endValue ? [endValue, startValue] : [startValue, endValue]
  }

  const updateRange = (e: MouseEvent | TouchEvent) => {
    const next = getPercentage(e)
    if (handlerRef.current === 'start') assignStart(next)
    else assignEnd(next)
    emitInput(readRangeValue())
  }

  const updatePercentage = (e: MouseEvent | TouchEvent) => {
    assignPercentage(getPercentage(e))
    emitInput(getNewValue(percentageRef.current))
  }

  const stopDragging = () => {
    draggingRef.current = false
    emitInput.flush()
  }

  const updateRangeEnd = (e: MouseEvent | TouchEvent) => {
    updateRange(e)
    stopDragging()
    onUpdateValueRef.current?.(readRangeValue() as never)
    document.removeEventListener('mousemove', updateRange)
    document.removeEventListener('touchmove', updateRange)
    document.removeEventListener('mouseup', updateRangeEnd)
    document.removeEventListener('touchend', updateRangeEnd)
  }

  const updatePercentageEnd = (e: MouseEvent | TouchEvent) => {
    updatePercentage(e)
    stopDragging()
    onUpdateValueRef.current?.(getNewValue(percentageRef.current) as never)
    document.removeEventListener('mousemove', updatePercentage)
    document.removeEventListener('touchmove', updatePercentage)
    document.removeEventListener('mouseup', updatePercentageEnd)
    document.removeEventListener('touchend', updatePercentageEnd)
  }

  const handleMousedown = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return
    const native = e.nativeEvent
    draggingRef.current = true

    if (range) {
      const next = getPercentage(native)
      if (Math.abs(next - startRef.current) < Math.abs(next - endRef.current)) assignHandler('start')
      else assignHandler('end')
      updateRange(native)
      document.addEventListener('mousemove', updateRange)
      document.addEventListener('touchmove', updateRange)
      document.addEventListener('mouseup', updateRangeEnd)
      document.addEventListener('touchend', updateRangeEnd)
    }
    else {
      updatePercentage(native)
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
      data-style-slider={dataStyleSlider}
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
