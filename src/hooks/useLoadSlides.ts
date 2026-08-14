
import { useState, useEffect } from 'react'
import { useSlidesStore } from '@/store';
export default () => {
  const slides = useSlidesStore(s => s.slides);;
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [slidesLoadLimit, setSlidesLoadLimit] = useState(50);
  const loadSlide = () => {
    if (slides.length > slidesLoadLimit) {
      setTimer(setTimeout(() => {
        setSlidesLoadLimit(slidesLoadLimit + 20);
        loadSlide();
      }, 600));
    } else setSlidesLoadLimit(9999);
  };
  useEffect(loadSlide, []);
  useEffect(() => () => { (() => {
    if (timer) clearTimeout(timer);
  })() }, []);
  return {
    slidesLoadLimit
  };
};
