import { bindStyles } from '@/utils/cssm'
import styles from './ThemeColorsSetting.module.scss'
const cx = bindStyles(styles)
import { useState, useEffect } from 'react'
import Popover from '@/components/Popover'
import ColorPicker from '@/components/ColorPicker/index'
import ColorButton from '@/components/ColorButton'
import Button from '@/components/Button'
import { Icon } from '@/components/Icon'
import { useI18nContext } from '@/i18n/useI18nContext'

export default function ThemeColorsSetting({
  colors,
  onUpdate,
}: {
  colors: string[]
  onUpdate?: (payload: string[]) => void
}) {
  const { LL } = useI18nContext()
  const [themeColors, setThemeColors] = useState<string[]>([])

  useEffect(() => {
    setThemeColors([...colors])
  }, [colors])

  const setThemeColorsConfirm = () => {
    onUpdate?.(themeColors)
  }

  const addThemeColor = () => {
    setThemeColors(prev => [...prev, '#00000000'])
  }

  const deleteThemeColor = (index: number) => {
    setThemeColors(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className={cx('theme-colors-setting')}>
      <div className={cx('title')}>{LL.editor.stylePanel.chart.themeColorsSetting.title()}</div>
      <div className={cx('list')}>
        {themeColors.map((item, index) => (
          <div className={cx('field')} key={index}>
            <span className={cx('field-label')}>{LL.editor.stylePanel.chart.themeColorsSetting.themeColorLabel({ index: index + 1 })}</span>
            <div className={cx('color-btn-wrap')}>
              <Popover
                trigger="click"
                content={(
                  <ColorPicker
                    modelValue={item}
                    onUpdateModelValue={(value: string) => {
                      setThemeColors(prev => prev.map((color, i) => i === index ? value : color))
                    }}
                  />
                )}
              >
                <ColorButton color={item} />
              </Popover>
              {index !== 0 ? (
                <button
                  type="button"
                  className={cx('delete-btn')}
                  data-tooltip={LL.common.delete()}
                  onClick={event => { event.stopPropagation(); deleteThemeColor(index) }}
                >
                  <Icon icon="x" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <Button className={cx('full-width-btn')} disabled={themeColors.length >= 10} onClick={() => addThemeColor()}>
          <Icon icon="plus" /> {LL.editor.stylePanel.chart.themeColorsSetting.addThemeColor()}
        </Button>
      </div>
      <Button className={cx('btn')} type="primary" onClick={() => setThemeColorsConfirm()}>{LL.common.confirm()}</Button>
    </div>
  )
}
