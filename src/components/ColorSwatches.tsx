import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ColorSwatches.module.scss'
const cx = bindStyles(styles)
import { memo, type CSSProperties } from 'react'
import tinycolor from 'tinycolor2'
import { useSlidesStore } from '@/store'
import { preferredInk } from '@/utils/textContrast'
import ColorPicker from '@/components/ColorPicker/index'
import Popover from '@/components/Popover'

type Chip = {
  value: string
  none?: boolean
  light?: boolean
  title?: string
}

export type IColorSwatchesProps = {
  modelValue?: string
  extraColors?: string[]
  includeTheme?: boolean
  includeNeutrals?: boolean
  allowNone?: boolean
  noneValue?: string
  allowCustom?: boolean
  wrap?: boolean
  customTitle?: string
  noneTitle?: string
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onUpdateModelValue?: (value: string) => void
}

const NEUTRALS = ['#18181b', '#3f3f46', '#a1a1aa', '#ffffff']

export const HIGHLIGHT_SWATCHES = [
  '#fef08a',
  '#bbf7d0',
  '#bae6fd',
  '#fbcfe8',
  '#fed7aa',
  '#e9d5ff',
  '#e5e7eb',
]

function ColorSwatches({
  modelValue = '',
  extraColors = [],
  includeTheme = true,
  includeNeutrals = true,
  allowNone = false,
  noneValue = '#00000000',
  allowCustom = true,
  wrap = true,
  customTitle = '',
  noneTitle = '',
  className,
  style,
  'data-tooltip': dataTooltip,
  onUpdateModelValue,
}: IColorSwatchesProps) {
  const themeColors = useSlidesStore(s => s.theme.themeColors)

  const normalize = (color?: string) => {
    if (!color) return ''
    const parsed = tinycolor(color)
    if (!parsed.isValid()) return color.toLowerCase()
    if (parsed.getAlpha() === 0) return 'transparent'
    return parsed.toHexString().toLowerCase()
  }

  const isLightColor = (color: string) => {
    const parsed = tinycolor(color)
    return parsed.isValid() && parsed.getAlpha() > 0.4 && parsed.getBrightness() > 210
  }

  const isSelected = (value: string) => {
    const current = normalize(modelValue)
    const target = normalize(value)
    if (current === target) return true
    const currentEmpty = !current || current === 'transparent'
    const targetEmpty = !target || target === 'transparent'
    return currentEmpty && targetEmpty
  }

  const chips = (() => {
    const seen = new Set<string>()
    const list: Chip[] = []
    const add = (value: string, extras: Partial<Chip> = {}) => {
      const key = extras.none ? 'none' : normalize(value)
      if (!key || seen.has(key)) return
      seen.add(key)
      list.push({
        value,
        light: extras.none ? false : isLightColor(value),
        ...extras,
      })
    }

    if (allowNone) add(noneValue, { none: true, title: noneTitle })
    if (includeTheme) {
      for (const color of themeColors) add(color)
    }
    if (includeNeutrals) {
      for (const color of NEUTRALS) add(color)
    }
    for (const color of extraColors) add(color)
    return list
  })()

  const customPreview = (() => {
    const current = modelValue
    if (!current || normalize(current) === 'transparent') return '#ffffff'
    return current
  })()

  const customSelected = (() => {
    if (chips.some(chip => isSelected(chip.value))) return false
    if (!modelValue || normalize(modelValue) === 'transparent') return false
    return true
  })()

  const customLight = isLightColor(customPreview)
  const customInk = preferredInk(customPreview)

  return (
    <div className={cx('color-swatches', { wrap }, className)} style={style} data-tooltip={dataTooltip}>
      {chips.map(chip => (
        <button
          key={chip.value}
          type="button"
          className={cx('swatch', {
            selected: isSelected(chip.value),
            light: chip.light,
            none: chip.none,
          })}
          style={chip.none ? undefined : { backgroundColor: chip.value }}
          title={chip.title}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onUpdateModelValue?.(chip.value)}
        >
          {chip.none ? <span className={cx('none-mark')} /> : null}
        </button>
      ))}
      {allowCustom ? (
        <Popover
          trigger="click"
          content={<ColorPicker modelValue={modelValue} onUpdateModelValue={value => onUpdateModelValue?.(value)} />}
        >
          <button
            type="button"
            className={cx('swatch custom', { selected: customSelected, light: customLight, 'ink-white': customInk === '#ffffff' })}
            style={{ backgroundColor: customPreview, color: customInk }}
            title={customTitle}
            onMouseDown={event => event.preventDefault()}
          >
            <Icon icon="plus" className={cx('custom-icon')} />
          </button>
        </Popover>
      ) : null}
    </div>
  )
}

export default memo(ColorSwatches)
