import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ImageStylePanel.module.scss'
const cx = bindStyles(styles)
import { useMemo, memo, useState, Fragment } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import { getHandleElement, useHandleElementId, useHandleElementShallow } from '../common/handleElement'
import type { PPTImageElement, SlideBackground } from '@/types/slides'
import { CLIPPATHS } from '@/configs/imageClip'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useImageHandler from '@/hooks/useImageHandler'
import ElementOutline from '../common/ElementOutline'
import ElementShadow from '../common/ElementShadow'
import ElementFlip from '../common/ElementFlip'
import ElementFilter from '../common/ElementFilter'
import ElementColorMask from '../common/ElementColorMask'
import FileInput from '@/components/FileInput'
import Divider from '@/components/Divider'
import Button from '@/components/Button'
import ButtonGroup from '@/components/ButtonGroup'
import Popover from '@/components/Popover'
import NumberInput from '@/components/NumberInput'

const ImageStylePanel = memo(() => {
  const { LL } = useI18nContext()
  const shapeClipPathOptions = CLIPPATHS
  const ratioClipOptions = useMemo(() => [
    {
      label: LL.editor.stylePanel.image.ratioSquare(),
      children: [{ key: '1:1', ratio: 1 / 1 }],
    },
    {
      label: LL.editor.stylePanel.image.ratioPortrait(),
      children: [
        { key: '2:3', ratio: 3 / 2 },
        { key: '3:4', ratio: 4 / 3 },
        { key: '3:5', ratio: 5 / 3 },
        { key: '4:5', ratio: 5 / 4 },
      ],
    },
    {
      label: LL.editor.stylePanel.image.ratioLandscape(),
      children: [
        { key: '3:2', ratio: 2 / 3 },
        { key: '4:3', ratio: 3 / 4 },
        { key: '5:3', ratio: 3 / 5 },
        { key: '5:4', ratio: 4 / 5 },
      ],
    },
    {
      label: '',
      children: [
        { key: '16:9', ratio: 9 / 16 },
        { key: '16:10', ratio: 10 / 16 },
      ],
    },
  ], [LL])

  const handleElementId = useHandleElementId()
  const handleImageElement = useHandleElementShallow(el => {
    if (!el || el.type !== 'image') return null
    return { src: el.src, radius: el.radius }
  })
  const [clipPanelVisible, setClipPanelVisible] = useState(false)
  const { addHistorySnapshot } = useHistorySnapshot()
  const { replaceImage } = useImageHandler()

  const clipImage = () => {
    useMainStore.getState().setClipingImageElementId(handleElementId)
    setClipPanelVisible(false)
  }

  const getImageElementDataBeforeClip = () => {
    const _handleElement = getHandleElement() as PPTImageElement
    const imgWidth = _handleElement.width
    const imgHeight = _handleElement.height
    const imgLeft = _handleElement.left
    const imgTop = _handleElement.top
    const originClipRange: [[number, number], [number, number]] = _handleElement.clip ? _handleElement.clip.range : [[0, 0], [100, 100]]
    const originWidth = imgWidth / ((originClipRange[1][0] - originClipRange[0][0]) / 100)
    const originHeight = imgHeight / ((originClipRange[1][1] - originClipRange[0][1]) / 100)
    const originLeft = imgLeft - originWidth * (originClipRange[0][0] / 100)
    const originTop = imgTop - originHeight * (originClipRange[0][1] / 100)
    return { originClipRange, originWidth, originHeight, originLeft, originTop }
  }

  const updateImage = (props: Partial<PPTImageElement>) => {
    if (!getHandleElement()) return
    useSlidesStore.getState().updateElement({ id: handleElementId, props })
    addHistorySnapshot()
  }

  const presetImageClip = (shape: string, ratio = 0) => {
    const _handleElement = getHandleElement() as PPTImageElement
    const { originClipRange, originWidth, originHeight, originLeft, originTop } = getImageElementDataBeforeClip()

    if (ratio) {
      const imageRatio = originHeight / originWidth
      const min = 0
      const max = 100
      let range: [[number, number], [number, number]]
      if (imageRatio > ratio) {
        const distance = (1 - ratio / imageRatio) / 2 * 100
        range = [[min, distance], [max, max - distance]]
      }
      else {
        const distance = (1 - imageRatio / ratio) / 2 * 100
        range = [[distance, min], [max - distance, max]]
      }
      updateImage({
        clip: { ..._handleElement.clip, shape, range },
        left: originLeft + originWidth * (range[0][0] / 100),
        top: originTop + originHeight * (range[0][1] / 100),
        width: originWidth * (range[1][0] - range[0][0]) / 100,
        height: originHeight * (range[1][1] - range[0][1]) / 100,
      })
    }
    else {
      const clipData = { ..._handleElement.clip, shape, range: originClipRange }
      let props: Partial<PPTImageElement> = { clip: clipData }
      if (shape === 'rect') props = { clip: clipData, radius: 0 }
      updateImage(props)
    }
    clipImage()
  }

  const resetImage = () => {
    const _handleElement = getHandleElement() as PPTImageElement
    if (_handleElement.clip) {
      const { originWidth, originHeight, originLeft, originTop } = getImageElementDataBeforeClip()
      updateImage({
        left: originLeft,
        top: originTop,
        width: originWidth,
        height: originHeight,
      })
    }
    useSlidesStore.getState().removeElementProps({
      id: handleElementId,
      propName: ['clip', 'outline', 'flip', 'shadow', 'filters', 'colorMask', 'radius'],
    })
    addHistorySnapshot()
  }

  const setBackgroundImage = () => {
    const _handleElement = getHandleElement() as PPTImageElement
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    const background: SlideBackground = {
      ...currentSlide?.background,
      type: 'image',
      image: { src: _handleElement.src, size: 'cover' },
    }
    useSlidesStore.getState().updateSlide({ background })
    addHistorySnapshot()
  }

  if (!handleImageElement) return null

  return (
    <div className={cx('image-style-panel')}>
      <div className={cx('origin-image')} style={{ backgroundImage: `url(${handleImageElement.src})` }} />
      <ElementFlip />
      <ButtonGroup className={cx('row')} passive>
        <Button first style={{ width: 'calc(100% - 32px)' }} onClick={() => clipImage()}>
          <Icon icon="crop" /> {LL.editor.stylePanel.image.cropImage()}
        </Button>
        <Popover
          trigger="click"
          value={clipPanelVisible}
          onUpdateValue={(value: boolean) => setClipPanelVisible(value)}
          style={{ width: '32px' }}
          content={(
            <div className={cx('clip')}>
              <div className={cx('title')}>{LL.editor.stylePanel.image.clipByShape()}</div>
              <div className={cx('shape-clip')}>
                {Object.entries(shapeClipPathOptions).map(([key, item]) => (
                  <div className={cx('shape-clip-item')} key={key} onClick={() => presetImageClip(key)}>
                    <div className={cx('shape')} style={{ clipPath: item.style }} />
                  </div>
                ))}
              </div>
              {ratioClipOptions.map(typeItem => (
                <Fragment key={typeItem.label}>
                  {typeItem.label ? <div className={cx('title')}>{LL.editor.stylePanel.image.clipByRatio({ label: typeItem.label })}</div> : null}
                  <ButtonGroup className={cx('row')}>
                    {typeItem.children.map(item => (
                      <Button style={{ flex: '1' }} key={item.key} onClick={() => presetImageClip('rect', item.ratio)}>
                        {item.key}
                      </Button>
                    ))}
                  </ButtonGroup>
                </Fragment>
              ))}
            </div>
          )}
        >
          <Button last className={cx('popover-btn')}>
            <Icon icon="chevron-down" />
          </Button>
        </Popover>
      </ButtonGroup>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.image.cornerRadius()}</div>
        <NumberInput
          value={handleImageElement.radius || 0}
          onUpdateValue={value => updateImage({ radius: value })}
          style={{ width: '60%' }}
        />
      </div>
      <Divider />
      <ElementColorMask />
      <Divider />
      <ElementFilter />
      <ElementOutline />
      <ElementShadow />
      <FileInput onChange={files => replaceImage(files)}>
        <Button className={cx('full-width-btn')}>
          <Icon icon="move" /> {LL.editor.stylePanel.image.replaceImage()}
        </Button>
      </FileInput>
      <Button className={cx('full-width-btn')} onClick={() => resetImage()}>
        <Icon icon="undo-2" /> {LL.editor.stylePanel.image.resetStyle()}
      </Button>
      <Button className={cx('full-width-btn')} onClick={() => setBackgroundImage()}>
        <Icon icon="palette" /> {LL.editor.stylePanel.image.setAsBackground()}
      </Button>
    </div>
  )
})

export default ImageStylePanel
