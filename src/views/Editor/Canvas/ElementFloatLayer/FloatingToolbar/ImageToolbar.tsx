import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ImageToolbar.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'
import { useMainStore } from '@/store'
import type { PPTImageElement } from '@/types/slides'
import useImageHandler from '@/hooks/useImageHandler'
import { useI18nContext } from '@/i18n/useI18nContext'
import FileInput from '@/components/FileInput'
import { sameElementId } from '../floatCompare'

export type IImageToolbarProps = {
  elementInfo: PPTImageElement
}

const ImageToolbar = memo((_props: IImageToolbarProps) => {
  const { LL } = useI18nContext()
  const { replaceImage } = useImageHandler()

  const clipImage = useCallback(() => {
    const main = useMainStore.getState()
    main.setClipingImageElementId(main.handleElementId)
  }, [])

  return (
    <div className={cx('toolbar-content')}>
      <button className={cx('toolbar-btn')} onClick={() => clipImage()}>
        <Icon icon="crop" className={cx('icon')} />
        <span>{LL.canvas.floatingToolbar.image.crop()}</span>
      </button>
      <FileInput onChange={files => replaceImage(files)}>
        <button className={cx('toolbar-btn')}>
          <Icon icon="move" className={cx('icon')} />
          <span>{LL.canvas.floatingToolbar.image.replace()}</span>
        </button>
      </FileInput>
    </div>
  )
}, sameElementId)

ImageToolbar.displayName = 'ImageToolbar'

export default ImageToolbar
