import { measureNaturalWidth, prepareWithSegments, setLocale as setPretextLocale } from '@chenglou/pretext'

export type FitLabelParams = {
  text: string
  width: number
  height: number
  maxFontSize: number
  minFontSize: number
  fontWeight: number | string
  fontStyle: string
  fontFamily: string
  letterSpacing: number
  lineHeight: number
  maxLines: number
  locale: string
}

const preparedCache = new Map<string, ReturnType<typeof prepareWithSegments>>()
const sizeCache = new Map<string, number>()

const preparedKey = (params: Pick<FitLabelParams, 'text' | 'fontStyle' | 'fontWeight' | 'maxFontSize' | 'fontFamily' | 'letterSpacing' | 'locale'>) => (
  `${params.locale}\0${params.text}\0${params.fontStyle} ${params.fontWeight} ${params.maxFontSize}px ${params.fontFamily}\0${params.letterSpacing}`
)

const sizeKey = (params: FitLabelParams) => (
  `${preparedKey(params)}\0${Math.round(params.width)}\0${Math.round(params.height)}\0${params.minFontSize}\0${params.lineHeight}\0${params.maxLines}`
)

const lastSizeByLabel = new Map<string, number>()
let activeLocale = ''

export const lastFitLabelSize = (params: Omit<FitLabelParams, 'width' | 'height'>) => (
  lastSizeByLabel.get(preparedKey(params))
)

/** Largest size in [min, max] that fits `width` × `height` in `maxLines`. One prepare, one width read. */
export function fitLabelFontSize(params: FitLabelParams): number {
  const { text, width, height, maxFontSize, minFontSize, maxLines, lineHeight } = params
  if (!text || width <= 0 || height <= 0) return maxFontSize
  const cached = sizeCache.get(sizeKey(params))
  if (cached != null) return cached

  if (activeLocale !== params.locale) {
    activeLocale = params.locale
    setPretextLocale(params.locale)
  }
  const key = preparedKey(params)
  let prepared = preparedCache.get(key)
  if (!prepared) {
    const font = `${params.fontStyle} ${params.fontWeight} ${maxFontSize}px ${params.fontFamily}`
    prepared = prepareWithSegments(text, font, params.letterSpacing ? { letterSpacing: params.letterSpacing } : undefined)
    preparedCache.set(key, prepared)
  }

  const naturalWidth = measureNaturalWidth(prepared)
  const widthScale = naturalWidth > 0 ? (width * Math.max(1, maxLines)) / naturalWidth : 1
  const heightScale = (maxFontSize * lineHeight) > 0
    ? height / (Math.max(1, maxLines) * maxFontSize * lineHeight)
    : 1
  const size = Math.min(maxFontSize, Math.max(minFontSize, maxFontSize * Math.min(1, widthScale, heightScale)))

  sizeCache.set(sizeKey(params), size)
  lastSizeByLabel.set(key, size)
  return size
}
