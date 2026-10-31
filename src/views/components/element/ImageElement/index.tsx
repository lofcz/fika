import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import { useMainStore, useSlidesStore } from '@/store'
import type { ImageElementClip, PPTImageElement } from '@/types/slides'
import type { ImageClipedEmitData } from '@/types/edit'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import useElementShadow from '@/views/components/element/hooks/useElementShadow'
import useElementFlip from '@/views/components/element/hooks/useElementFlip'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useClipImage from './useClipImage'
import { imageCropGeometry } from '@/utils/imageCrop'
import useFilter from './useFilter'
import ImageOutline from './ImageOutline/index'
import ImageClipHandler from './ImageClipHandler'
import ImageBitmapSurface from './ImageBitmapSurface'
import { useSyncImageBitmapCache } from './useImageBitmap'

export type IImageElementProps = {
  elementInfo: PPTImageElement
  selectElement: (e: MouseEvent | TouchEvent, element: PPTImageElement, canMove?: boolean) => void
  contextmenus: () => ContextmenuItem[] | null
}

const ImageElement = memo((props: IImageElementProps) => {
  const { elementInfo, contextmenus } = props
  const clipingImageElementId = useMainStore(s => s.clipingImageElementId)
  const setClipingImageElementId = useMainStore(s => s.setClipingImageElementId)
  const updateElement = useSlidesStore(s => s.updateElement)
  const isCliping = clipingImageElementId === props.elementInfo.id
  const { addHistorySnapshot } = useHistorySnapshot()
  const { shadowStyle } = useElementShadow(props.elementInfo.shadow)
  const { flipStyle } = useElementFlip(props.elementInfo.flipH, props.elementInfo.flipV)
  const { clipShape, imgPosition } = useClipImage(props.elementInfo)
  const { filter } = useFilter(props.elementInfo.filters)
  useSyncImageBitmapCache()

  const handleSelectElement = useCallback((e: MouseEvent | TouchEvent) => {
    if (props.elementInfo.lock) return
    e.stopPropagation()
    props.selectElement(e, props.elementInfo)
  }, [props.elementInfo, props.selectElement])

  const handleClip = useCallback((data: ImageClipedEmitData | null) => {
    setClipingImageElementId('')
    if (!data) return
    const { range } = data
    const originClip: ImageElementClip = props.elementInfo.clip || {
      shape: 'rect',
      range: [[0, 0], [100, 100]],
    }
    updateElement({
      id: props.elementInfo.id,
      props: {
        clip: { ...originClip, range },
        ...imageCropGeometry(props.elementInfo, range),
      },
    })
    addHistorySnapshot()
  }, [setClipingImageElementId, props.elementInfo, updateElement, addHistorySnapshot])

  return (
    <div
      className={cx('editable-element-image', { lock: elementInfo.lock })}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
    >
      <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        {isCliping ? (
          <div style={{ width: '100%', height: '100%', transform: flipStyle }}>
            <ImageClipHandler
              src={elementInfo.src}
              clipData={elementInfo.clip}
              width={elementInfo.width}
              height={elementInfo.height}
              top={elementInfo.top}
              left={elementInfo.left}
              rotate={elementInfo.rotate}
              flipH={elementInfo.flipH}
              flipV={elementInfo.flipV}
              clipPath={clipShape.style}
              onClip={range => handleClip(range)}
            />
          </div>
        ) : (
          <div
            className={cx('element-content')}
            data-live-box
            style={{
              filter: shadowStyle ? `drop-shadow(${shadowStyle})` : '',
              transform: flipStyle,
            }}
            onContextMenu={event => {
              event.stopPropagation()
              event.preventDefault()
              openContextmenu(event, contextmenus)
            }}
            onMouseDown={event => handleSelectElement(event.nativeEvent)}
            onTouchStart={event => handleSelectElement(event.nativeEvent)}
          >
            <ImageOutline elementInfo={elementInfo} />
            <div className={cx('image-content')} style={{ clipPath: clipShape.style }}>
              <ImageBitmapSurface
                key={elementInfo.src}
                src={elementInfo.src}
                draggable={false}
                style={{
                  top: imgPosition.top,
                  left: imgPosition.left,
                  width: imgPosition.width,
                  height: imgPosition.height,
                  filter,
                }}
                onDragStart={event => { event.preventDefault() }}
              />
              {elementInfo.colorMask ? (
                <div className={cx('color-mask')} style={{ backgroundColor: elementInfo.colorMask }} />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

export default ImageElement
