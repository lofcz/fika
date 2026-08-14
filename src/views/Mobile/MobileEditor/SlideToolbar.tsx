import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './SlideToolbar.module.scss'
const cx = bindStyles(styles)
import { useState } from 'react'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import useSlideHandler from '@/hooks/useSlideHandler'
import useCreateElement from '@/hooks/useCreateElement'
import type { ShapePoolItem } from '@/configs/shapes'
import MobileThumbnails from '../MobileThumbnails'
import MediaPicker from '@/views/Editor/CanvasTool/MediaPicker'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import ButtonGroup from '@/components/ButtonGroup'
import { useI18nContext } from '@/i18n/useI18nContext'

export default function SlideToolbar() {
  const { LL } = useI18nContext()
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const currentSlide = useSlidesStore(selectCurrentSlide)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const updateSlide = useSlidesStore(s => s.updateSlide)
  const { createSlide, copyAndPasteSlide, deleteSlide } = useSlideHandler()
  const { createTextElement, createShapeElement } = useCreateElement()
  const [mediaPickerVisible, setMediaPickerVisible] = useState(false)

  const insertTextElement = () => {
    const width = 400
    const height = 56
    createTextElement({
      left: (viewportSize - width) / 2,
      top: (viewportSize * viewportRatio - height) / 2,
      width,
      height,
    }, { content: LL.mobile.slideToolbar.defaultTextHtml() })
  }

  const insertShapeElement = (type: 'square' | 'round') => {
    const square: ShapePoolItem = {
      viewBox: [200, 200],
      path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    }
    const round: ShapePoolItem = {
      viewBox: [200, 200],
      path: 'M 100 0 A 50 50 0 1 1 100 200 A 50 50 0 1 1 100 0 Z',
    }
    const shape = { square, round }
    const size = 200
    createShapeElement({
      left: (viewportSize - size) / 2,
      top: (viewportSize * viewportRatio - size) / 2,
      width: size,
      height: size,
    }, shape[type])
  }

  const remark = currentSlide?.remark || ''

  const handleInputMark = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const value = e.currentTarget.value
    updateSlide({ remark: value })
  }

  return (
    <>
      <div className={cx('slide-toolbar')}>
        <div className={cx('remark')}>
          <textarea
            value={remark}
            placeholder={LL.mobile.slideToolbar.remarkPlaceholder()}
            onInput={handleInputMark}
          />
        </div>
        <div className={cx('toolbar')}>
          <ButtonGroup className={cx('row')}>
            <Button style={{ flex: 1 }} onClick={() => createSlide()}><Icon icon="plus" className={cx('icon')} /> {LL.mobile.slideToolbar.newSlide()}</Button>
            <Button style={{ flex: 1 }} onClick={() => copyAndPasteSlide()}><Icon icon="copy" className={cx('icon')} /> {LL.common.copy()}</Button>
            <Button style={{ flex: 1 }} onClick={() => deleteSlide()}><Icon icon="trash-2" className={cx('icon')} /> {LL.common.delete()}</Button>
          </ButtonGroup>
          <ButtonGroup className={cx('row')}>
            <Button style={{ flex: 1 }} onClick={insertTextElement}><Icon icon="type" className={cx('icon')} /> {LL.mobile.slideToolbar.text()}</Button>
            <Button style={{ flex: 1 }} onClick={() => setMediaPickerVisible(true)}>
              <Icon icon="image" className={cx('icon')} /> {LL.mobile.slideToolbar.media()}
            </Button>
            <Button style={{ flex: 1 }} onClick={() => insertShapeElement('square')}><Icon icon="square" className={cx('icon')} /> {LL.mobile.slideToolbar.rectangle()}</Button>
            <Button style={{ flex: 1 }} onClick={() => insertShapeElement('round')}><Icon icon="circle" className={cx('icon')} /> {LL.mobile.slideToolbar.circle()}</Button>
          </ButtonGroup>
        </div>
        <MobileThumbnails />
      </div>

      <Modal visible={mediaPickerVisible} onUpdateVisible={setMediaPickerVisible} width={560} closeButton>
        <MediaPicker onClose={() => setMediaPickerVisible(false)} />
      </Modal>
    </>
  )
}
