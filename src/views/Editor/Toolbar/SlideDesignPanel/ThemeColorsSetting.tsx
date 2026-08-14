import { bindStyles } from '@/utils/cssm'
import styles from './ThemeColorsSetting.module.scss'
const cx = bindStyles(styles)
import { useEffect, useState, type CSSProperties } from 'react'
import { useSlidesStore } from '@/store'
import Popover from '@/components/Popover'
import ColorPicker from '@/components/ColorPicker/index'
import ColorButton from '@/components/ColorButton'
import Button from '@/components/Button'
import Draggable from '@/components/Draggable'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IThemeColorsSettingProps = {
  onClose?: () => void
  className?: string
  style?: CSSProperties
}

export default function ThemeColorsSetting({ onClose, className, style }: IThemeColorsSettingProps) {
  const { LL } = useI18nContext()
  const theme = useSlidesStore(s => s.theme)
  const [themeColors, setThemeColorItems] = useState<string[]>([])

  useEffect(() => {
    const colors = [...theme.themeColors]
    while (colors.length < 6) {
      colors.push('#00000000')
    }
    setThemeColorItems([...colors])
  }, [])

  const setThemeColors = () => {
    let colors = themeColors.filter(item => item !== '#00000000')
    if (!colors.length) colors = ['#00000000']
    useSlidesStore.getState().setTheme({ themeColors: colors })
    onClose?.()
  }

  const handleDragEnd = (eventData: { newIndex: number; oldIndex: number }) => {
    const { newIndex, oldIndex } = eventData
    if (newIndex === undefined || oldIndex === undefined || newIndex === oldIndex) return
    setThemeColorItems(prev => {
      const next = [...prev]
      const item = next[oldIndex]
      next.splice(oldIndex, 1)
      next.splice(newIndex, 0, item)
      return next
    })
  }

  return (
    <div className={cx('theme-colors-setting', className)} style={style}>
      <div className={cx('title')}>{LL.editor.slideDesign.themeColorsSetting.title()}</div>

      <Draggable
        className={cx('list')}
        modelValue={themeColors}
        animation={200}
        scroll
        scrollSensitivity={50}
        itemKey="id"
        handle=".label"
        onEnd={handleDragEnd}
        item={({ element, index }) => (
          <div className={cx('row')}>
            <div className={cx('label')} style={{ width: '40%' }}>
              {LL.editor.slideDesign.themeColorsSetting.slideThemeColorLabel({ index: index + 1 })}
            </div>
            <Popover
              trigger="click"
              style={{ width: '60%' }}
              content={(
                <ColorPicker
                  modelValue={element}
                  onUpdateModelValue={(value: string) => {
                    setThemeColorItems(prev => {
                      const next = [...prev]
                      next[index] = value
                      return next
                    })
                  }}
                />
              )}
            >
              <ColorButton color={element} />
            </Popover>
          </div>
        )}
      />

      <Button className={cx('btn')} type="primary" onClick={() => setThemeColors()}>
        {LL.common.confirm()}
      </Button>
    </div>
  )
}
