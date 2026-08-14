import { bindStyles } from '@/utils/cssm'
import styles from './TextToolbar.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'
import type { PPTTextElement } from '@/types/slides'
import TextStyleControls from './TextStyleControls'
import { sameElementId } from '../floatCompare'

export type ITextToolbarProps = {
  elementInfo: PPTTextElement
}

const TextToolbar = memo((_props: ITextToolbarProps) => {
  return (
    <div className={cx('toolbar-content')}>
      <TextStyleControls />
    </div>
  )
}, sameElementId)

TextToolbar.displayName = 'TextToolbar'

export default TextToolbar
