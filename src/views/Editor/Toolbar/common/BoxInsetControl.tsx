import { bindStyles } from '@/utils/cssm'
import styles from './BoxInsetControl.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'
import type { TextInset } from '@/types/slides'
import NumberInput from '@/components/NumberInput'

export type IBoxInsetControlProps = {
  value: TextInset
  min?: number
  max?: number
  topTitle?: string
  rightTitle?: string
  bottomTitle?: string
  leftTitle?: string
} & {
  onUpdateValue?: (payload: TextInset) => void
}

const BoxInsetControl = memo(({
  value,
  min = 0,
  max = 50,
  topTitle = '',
  rightTitle = '',
  bottomTitle = '',
  leftTitle = '',
  onUpdateValue,
}: IBoxInsetControlProps) => {
  const emitSide = (index: number, n: number) => {
    const next: TextInset = [...value]
    next[index] = n
    onUpdateValue?.(next)
  }

  return (
    <div className={cx('box-inset')}>
      <NumberInput className={cx('box-inset-input top')} min={min} max={max} value={value[0]} data-tooltip={topTitle} onUpdateValue={n => emitSide(0, n)} />
      <NumberInput className={cx('box-inset-input left')} min={min} max={max} value={value[3]} data-tooltip={leftTitle} onUpdateValue={n => emitSide(3, n)} />
      <div className={cx('box-inset-preview')} aria-hidden>
        <span className={cx('box-inset-inner')} />
      </div>
      <NumberInput className={cx('box-inset-input right')} min={min} max={max} value={value[1]} data-tooltip={rightTitle} onUpdateValue={n => emitSide(1, n)} />
      <NumberInput className={cx('box-inset-input bottom')} min={min} max={max} value={value[2]} data-tooltip={bottomTitle} onUpdateValue={n => emitSide(2, n)} />
    </div>
  )
})

export default BoxInsetControl
