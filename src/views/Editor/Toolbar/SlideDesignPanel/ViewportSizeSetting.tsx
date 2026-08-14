import { bindStyles } from '@/utils/cssm'
import styles from './ViewportSizeSetting.module.scss'
const cx = bindStyles(styles)
import { useState, type CSSProperties } from 'react'
import { useSlidesStore } from '@/store'
import message from '@/utils/message'
import { toFixed } from '@/utils/common'
import NumberInput from '@/components/NumberInput'
import Button from '@/components/Button'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IViewportSizeSettingProps = {
  onClose?: () => void
  className?: string
  style?: CSSProperties
}

const VIEWPORT_SIZE_MIN = 500
const VIEWPORT_SIZE_MAX = 2000

export default function ViewportSizeSetting({ onClose, className, style }: IViewportSizeSettingProps) {
  const { LL } = useI18nContext()
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)

  const [customViewportWidth, setCustomViewportWidth] = useState(toFixed(viewportSize))
  const [customViewportHeight, setCustomViewportHeight] = useState(toFixed(viewportSize * viewportRatio))

  const applyCustomViewportSize = () => {
    const width = customViewportWidth
    const height = customViewportHeight
    if (
      width < VIEWPORT_SIZE_MIN ||
      width > VIEWPORT_SIZE_MAX ||
      height < VIEWPORT_SIZE_MIN ||
      height > VIEWPORT_SIZE_MAX
    ) return message.warning(LL.editor.slideDesign.canvasSizeRangeWarning({ min: VIEWPORT_SIZE_MIN, max: VIEWPORT_SIZE_MAX }))

    useSlidesStore.getState().setViewportSize(width)
    useSlidesStore.getState().setViewportRatio(height / width)
    onClose?.()
  }

  return (
    <div className={cx('viewport-size-setting', className)} style={style}>
      <div className={cx('title')}>{LL.editor.slideDesign.customCanvasSize()}</div>
      <div className={cx('row')}>
        <div className={cx('label')}>{LL.editor.positionPanel.width()}</div>
        <NumberInput
          value={customViewportWidth}
          onUpdateValue={value => setCustomViewportWidth(value)}
          min={VIEWPORT_SIZE_MIN}
          max={VIEWPORT_SIZE_MAX}
          style={{ flex: 1 }}
          onEnter={() => applyCustomViewportSize()}
        />
      </div>
      <div className={cx('row')}>
        <div className={cx('label')}>{LL.editor.positionPanel.height()}</div>
        <NumberInput
          value={customViewportHeight}
          onUpdateValue={value => setCustomViewportHeight(value)}
          min={VIEWPORT_SIZE_MIN}
          max={VIEWPORT_SIZE_MAX}
          style={{ flex: 1 }}
          onEnter={() => applyCustomViewportSize()}
        />
      </div>
      <div className={cx('tip')}>{LL.editor.slideDesign.canvasSizeRange({ min: VIEWPORT_SIZE_MIN, max: VIEWPORT_SIZE_MAX })}</div>
      <div className={cx('btns')}>
        <Button type="primary" onClick={() => applyCustomViewportSize()}>{LL.common.confirm()}</Button>
        <Button style={{ marginLeft: '10px' }} onClick={() => onClose?.()}>{LL.common.cancel()}</Button>
      </div>
    </div>
  )
}
