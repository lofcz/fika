import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useState } from 'react'
import type { Mode } from '@/types/mobile'
import MobileEditor from './MobileEditor/index'
import MobilePlayer from './MobilePlayer'
import MobilePreview from './MobilePreview'

export default function Mobile() {
  const [mode, setMode] = useState<Mode>('preview')
  const changeMode = (_mode: Mode) => setMode(_mode)
  const currentComponent = {
    editor: MobileEditor,
    player: MobilePlayer,
    preview: MobilePreview,
  }[mode] || null

  return (
    <div className={cx('mobile')}>
      {currentComponent ? (() => {
        const Component = currentComponent
        return <Component changeMode={changeMode} />
      })() : null}
    </div>
  )
}
