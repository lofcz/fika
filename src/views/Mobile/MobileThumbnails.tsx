import { bindStyles } from '@/utils/cssm'
import styles from './MobileThumbnails.module.scss'
const cx = bindStyles(styles)
import { useSlidesStore } from '@/store'
import useLoadSlides from '@/hooks/useLoadSlides'
import useSlideHandler from '@/hooks/useSlideHandler'
import Draggable from '@/components/Draggable'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'

export default function MobileThumbnails({ className }: { className?: string }) {
  const slides = useSlidesStore(s => s.slides)
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const updateSlideIndex = useSlidesStore(s => s.updateSlideIndex)
  const { sortSlides } = useSlideHandler()
  const { slidesLoadLimit } = useLoadSlides()

  const handleDragEnd = (eventData: { newIndex: number; oldIndex: number }) => {
    const { newIndex, oldIndex } = eventData
    if (newIndex === undefined || oldIndex === undefined || newIndex === oldIndex) return
    sortSlides(newIndex, oldIndex)
  }

  return (
    <Draggable
      className={cx('mobile-thumbnails', className)}
      modelValue={slides}
      animation={200}
      scroll
      scrollSensitivity={50}
      delayOnTouchOnly
      delay={800}
      itemKey="id"
      onEnd={handleDragEnd}
      item={({ element, index }) => (
        <div
          className={cx('thumbnail-item', { active: slideIndex === index })}
          onClick={() => updateSlideIndex(index)}
        >
          <div className={cx('label')}>{index + 1}</div>
          <ThumbnailSlide className={cx('thumbnail')} slide={element} size={120} visible={index < slidesLoadLimit} />
        </div>
      )}
    />
  )
}
