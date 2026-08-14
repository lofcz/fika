import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './SlideThumbnails.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react';

import { useSlidesStore } from '@/store';
import useLoadSlides from '@/hooks/useLoadSlides';
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index';
export type ISlideThumbnailsProps = {
  turnSlideToIndex: (index: number) => void;
} & {
  onClose?: () => void;
};
const SlideThumbnails = memo((props: ISlideThumbnailsProps) => {
  const slides = useSlidesStore(s => s.slides);
  const slideIndex = useSlidesStore(s => s.slideIndex);;
  const {
    slidesLoadLimit
  } = useLoadSlides();
  const turnSlide = useCallback((index: number) => {
    props.turnSlideToIndex(index);
    props.onClose?.();
  }, [props.turnSlideToIndex, props.onClose]);
  return <><div className={cx("slide-thumbnails")}><div className={cx("return-button")}><Icon icon="circle-arrow-left" className={cx("icon")} onClick={() => {
          props.onClose?.();
        }} /></div><div className={cx("slide-thumbnails-content")}>{slides.map((slide, index) => <div className={cx('thumbnail', {
          'active': index === slideIndex
        })} key={slide.id} onClick={() => {
          turnSlide(index);
        }}><ThumbnailSlide slide={slide} size={150} visible={index < slidesLoadLimit} /></div>)}</div></div></>;
});
export default SlideThumbnails;
