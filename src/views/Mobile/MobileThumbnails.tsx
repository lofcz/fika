import { bindStyles } from '@/utils/cssm'
import styles from './MobileThumbnails.module.scss'
const cx = bindStyles(styles)
import { useSlidesStore } from '@/store'
import useSlideHandler from '@/hooks/useSlideHandler'
import Draggable, { slideDragOverlay } from '@/components/Draggable'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'

export default function MobileThumbnails({ className }: { className?: string }) {
  const slides = useSlidesStore(s => s.slides)
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const updateSlideIndex = useSlidesStore(s => s.updateSlideIndex)
  const { sortSlides } = useSlideHandler()

  const handleDragEnd = (eventData: { newIndex: number; oldIndex: number }) => {
    const { newIndex, oldIndex } = eventData
    if (newIndex === undefined || oldIndex === undefined || newIndex === oldIndex) return
    sortSlides(newIndex, oldIndex)
  }

  return (
    <Draggable
      className={cx('mobile-thumbnails', className)}
      modelValue={slides}
      itemKey="id"
      onEnd={handleDragEnd}
      overlayRender={slideDragOverlay}
      item={({ element, index }) => (
        <div
          className={cx('thumbnail-item', { active: slideIndex === index })}
          onClick={() => updateSlideIndex(index)}
        >
          <div className={cx('label')}>{index + 1}</div>
          <ThumbnailSlide className={cx('thumbnail')} slide={{ id: element.id }} size={120} />
        </div>
      )}
    />
  )
}
