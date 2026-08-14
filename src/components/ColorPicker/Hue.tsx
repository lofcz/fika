import { bindStyles } from '@/utils/cssm'
import styles from './Hue.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties } from 'react'
import { useRef, useCallback, memo, useState, useEffect } from 'react'

import tinycolor, { type ColorFormats } from 'tinycolor2'

export type IHueProps = {
  value: ColorFormats.RGBA
  hue: number
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
} & {
  onColorChange?: (payload: ColorFormats.HSLA) => void
}

const Hue = memo((props: IHueProps) => {
  const [pullDirection, setPullDirection] = useState('')
  const oldHueRef = useRef(0)
  const onColorChangeRef = useRef(props.onColorChange)
  onColorChangeRef.current = props.onColorChange

  const color = (() => {
    const hsla = tinycolor(props.value).toHsl()
    if (props.hue !== -1) hsla.h = props.hue
    return hsla
  })()
  const pointerLeft = (() => {
    if (color.h === 0 && pullDirection === 'right') return '100%'
    return `${color.h * 100 / 360}%`
  })()

  const valueKey = `${props.value.r},${props.value.g},${props.value.b},${props.value.a},${props.hue}`
  useEffect(() => {
    const hsla = tinycolor(props.value).toHsl()
    const h = hsla.s === 0 ? props.hue : hsla.h
    const prev = oldHueRef.current
    setPullDirection(current => {
      if (h !== 0 && h - prev > 0) return 'right'
      if (h !== 0 && h - prev < 0) return 'left'
      return current
    })
    oldHueRef.current = h
  }, [valueKey])

  const hueRef = useRef<HTMLDivElement | null>(null)
  const colorRef = useRef(color)
  colorRef.current = color
  const huePropRef = useRef(props.hue)
  huePropRef.current = props.hue

  const handleChange = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault()
    if (!hueRef.current) return
    const isTouchEvent = !(e instanceof MouseEvent)
    if (isTouchEvent && (!e.changedTouches || !e.changedTouches[0])) return
    const startPageX = isTouchEvent ? e.changedTouches[0].pageX : e.pageX
    const containerWidth = hueRef.current.clientWidth
    const xOffset = hueRef.current.getBoundingClientRect().left + window.pageXOffset
    const left = startPageX - xOffset
    let h
    if (left < 0) h = 0
    else if (left > containerWidth) h = 360
    else {
      const percent = left * 100 / containerWidth
      h = 360 * percent / 100
    }
    const current = colorRef.current
    if (huePropRef.current === -1 || current.h !== h) {
      onColorChangeRef.current?.({
        h,
        l: current.l,
        s: current.s,
        a: current.a,
      })
    }
  }, [])

  const unbindEventListeners = useCallback(() => {
    window.removeEventListener('mousemove', handleChange)
    window.removeEventListener('touchmove', handleChange)
    window.removeEventListener('mouseup', unbindEventListeners)
    window.removeEventListener('touchend', unbindEventListeners)
  }, [handleChange])

  const handleMouseDown = useCallback((e: MouseEvent | TouchEvent) => {
    handleChange(e)
    window.addEventListener('mousemove', handleChange)
    window.addEventListener('touchmove', handleChange)
    window.addEventListener('mouseup', unbindEventListeners)
    window.addEventListener('touchend', unbindEventListeners)
  }, [handleChange, unbindEventListeners])

  useEffect(() => () => {
    unbindEventListeners()
  }, [unbindEventListeners])

  return (
    <div className={cx('hue', props.className)} style={props.style} data-tooltip={props['data-tooltip']}>
      <div
        className={cx('hue-container')}
        ref={hueRef}
        onMouseDown={event => handleMouseDown(event.nativeEvent)}
        onTouchStart={event => handleMouseDown(event.nativeEvent)}
      >
        <div className={cx('hue-pointer')} style={{ left: pointerLeft }}>
          <div className={cx('hue-picker')} />
        </div>
      </div>
    </div>
  )
})

export default Hue
