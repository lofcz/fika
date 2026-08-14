import { bindStyles } from '@/utils/cssm'
import styles from './ElementColorMask.module.scss'
const cx = bindStyles(styles)
import { useMemo, memo, useState, useEffect } from 'react'

import tinycolor from 'tinycolor2'
import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementId, useHandleElementSelect } from './handleElement'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useI18nContext } from '@/i18n/useI18nContext'
import ColorButton from '@/components/ColorButton'
import ColorPicker from '@/components/ColorPicker/index'
import Switch from '@/components/Switch'
import Popover from '@/components/Popover'

const ElementColorMask = memo(() => {
  const { LL } = useI18nContext()
  const handleElementId = useHandleElementId()
  const colorMaskFromStore = useHandleElementSelect(el => el?.type === 'image' ? el.colorMask : undefined)
  const theme = useSlidesStore(s => s.theme)
  const { addHistorySnapshot } = useHistorySnapshot()

  const defaultColorMask = useMemo(() => {
    const themeColor = theme.themeColors[0]
    return tinycolor(themeColor).setAlpha(0.5).toRgbString()
  }, [theme.themeColors])

  const [colorMask, setColorMask] = useState('')
  const [hasColorMask, setHasColorMask] = useState(false)

  useEffect(() => {
    if (!handleElementId) return
    if (colorMaskFromStore) {
      setColorMask(colorMaskFromStore)
      setHasColorMask(true)
    }
    else setHasColorMask(false)
  }, [handleElementId, colorMaskFromStore])

  const toggleColorMask = (checked: boolean) => {
    const el = getHandleElement()
    if (!el) return
    if (checked) {
      useSlidesStore.getState().updateElement({ id: el.id, props: { colorMask: defaultColorMask } })
    }
    else {
      useSlidesStore.getState().removeElementProps({ id: el.id, propName: 'colorMask' })
    }
    addHistorySnapshot()
  }

  const updateColorMask = (next: string) => {
    useSlidesStore.getState().updateElement({ id: handleElementId, props: { colorMask: next } })
    addHistorySnapshot()
  }

  return (
    <div className={cx('element-color-mask')}>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.elementColorMask.colorMask()}</div>
        <div className={cx('switch-wrapper')} style={{ width: '60%' }}>
          <Switch value={hasColorMask} onUpdateValue={value => toggleColorMask(value)} />
        </div>
      </div>
      {hasColorMask ? (
        <div className={cx('row')} style={{ marginTop: '15px' }}>
          <div style={{ width: '40%' }}>{LL.editor.elementColorMask.maskColor()}</div>
          <Popover
            trigger="click"
            style={{ width: '60%' }}
            content={<ColorPicker modelValue={colorMask} onUpdateModelValue={value => updateColorMask(value)} />}
          >
            <ColorButton color={colorMask} />
          </Popover>
        </div>
      ) : null}
    </div>
  )
})

export default ElementColorMask
