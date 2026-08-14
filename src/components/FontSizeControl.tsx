import { bindStyles } from '@/utils/cssm'
import styles from './FontSizeControl.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, memo } from 'react'

import { FONT_SIZE_MAX, FONT_SIZE_MIN, FONT_SIZE_NUMBER_OPTIONS, clampFontSize, stepFontSize } from '@/configs/font'
import { useI18nContext } from '@/i18n/useI18nContext'
import FormatChip from '@/components/FormatChip'
import Select from '@/components/Select'

export type IFontSizeControlProps = {
  value: number
  min?: number
  max?: number
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onUpdateValue?: (payload: number) => void
}

const FontSizeControl = memo((vrProps: IFontSizeControlProps) => {
  const {
    value,
    min = FONT_SIZE_MIN,
    max = FONT_SIZE_MAX,
    className,
    style,
    'data-tooltip': dataTooltip,
    onUpdateValue,
  } = vrProps
  const { LL } = useI18nContext()

  const known = new Set<number>(FONT_SIZE_NUMBER_OPTIONS.map(item => Number(item.value)))
  const options = known.has(value)
    ? FONT_SIZE_NUMBER_OPTIONS
    : [{ label: String(value), value }, ...FONT_SIZE_NUMBER_OPTIONS].toSorted((a, b) => Number(a.value) - Number(b.value))

  const step = (direction: 1 | -1) => {
    onUpdateValue?.(stepFontSize(value, direction, min, max))
  }

  const selectSize = (next: string | number) => {
    onUpdateValue?.(clampFontSize(Number(next), min, max))
  }

  return (
    <div className={cx('font-size-control', className)} style={style} data-tooltip={dataTooltip}>
      <FormatChip compact data-tooltip={LL.editor.multiStyle.decreaseFontSize()} disabled={value <= min} onClick={() => step(-1)}>−</FormatChip>
      <Select
        className={cx('quiet-select size-select')}
        value={value}
        search
        searchLabel={LL.editor.multiStyle.searchFontSize()}
        autofocus
        options={options}
        onUpdateValue={selectSize}
      />
      <FormatChip compact data-tooltip={LL.editor.multiStyle.increaseFontSize()} disabled={value >= max} onClick={() => step(1)}>+</FormatChip>
    </div>
  )
})

export default FontSizeControl
