import { bindStyles } from '@/utils/cssm'
import styles from './FitText.module.scss'
const cx = bindStyles(styles)
import { useRef, memo, useState, useLayoutEffect, useEffect } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import { fitLabelFontSize, lastFitLabelSize } from '@/utils/fitLabel'

export type IFitTextProps = {
  text: string
  maxFontSize?: number
  minFontSize?: number
  fontWeight?: number | string
  fontStyle?: string
  fontFamily?: string
  textDecoration?: string
  lineHeight?: number
  letterSpacing?: number
  maxLines?: number
  /** Extra px allowed in the height fit check (underline / descenders). */
  measureHeightSlack?: number
  className?: string
}

const DEFAULT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif'

const FitText = memo((vrProps: IFitTextProps) => {
  const text = vrProps.text
  const maxFontSize = vrProps.maxFontSize ?? 13
  const minFontSize = vrProps.minFontSize ?? 10
  const fontWeight = vrProps.fontWeight ?? 400
  const fontStyle = vrProps.fontStyle ?? 'normal'
  const fontFamily = vrProps.fontFamily ?? ''
  const textDecoration = vrProps.textDecoration ?? 'none'
  const lineHeight = vrProps.lineHeight ?? 1.25
  const letterSpacing = vrProps.letterSpacing ?? 0
  const maxLines = vrProps.maxLines ?? 1
  const measureHeightSlack = vrProps.measureHeightSlack ?? 0

  const { locale } = useI18nContext()
  const elRef = useRef<HTMLSpanElement | null>(null)
  const measureFontFamily = fontFamily || DEFAULT_FONT_FAMILY
  const labelParams = {
    text,
    maxFontSize,
    minFontSize,
    fontWeight,
    fontStyle,
    fontFamily: measureFontFamily,
    letterSpacing,
    lineHeight,
    maxLines,
    locale,
  }
  const paramsRef = useRef(labelParams)
  paramsRef.current = labelParams
  const slackRef = useRef(measureHeightSlack)
  slackRef.current = measureHeightSlack
  const fontSizeRef = useRef(0)
  const [fontSize, setFontSize] = useState(() => lastFitLabelSize(labelParams) ?? maxFontSize)
  fontSizeRef.current = fontSize

  const applyFit = () => {
    const el = elRef.current
    const params = paramsRef.current
    if (!el || !params.text) {
      if (fontSizeRef.current !== params.maxFontSize) {
        fontSizeRef.current = params.maxFontSize
        setFontSize(params.maxFontSize)
      }
      return
    }
    const width = el.clientWidth
    const height = el.clientHeight + slackRef.current
    if (width <= 0 || height <= 0) return
    const next = fitLabelFontSize({ ...params, width, height })
    if (next === fontSizeRef.current) return
    fontSizeRef.current = next
    setFontSize(next)
  }

  useLayoutEffect(applyFit, [text, maxFontSize, minFontSize, fontWeight, fontStyle, measureFontFamily, letterSpacing, lineHeight, maxLines, locale, measureHeightSlack])

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const observer = new ResizeObserver(() => applyFit())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <span ref={elRef} className={cx('fit-text', vrProps.className)} title={text}>
      <span
        className={cx('fit-text-content', { 'single-line': maxLines === 1 })}
        style={{
          fontSize: `${fontSize}px`,
          fontWeight,
          fontStyle,
          fontFamily: fontFamily || 'inherit',
          textDecoration,
          lineHeight: `${lineHeight}`,
          letterSpacing: `${letterSpacing}px`,
          WebkitLineClamp: maxLines,
        }}
      >
        {text}
      </span>
    </span>
  )
})

export default FitText
