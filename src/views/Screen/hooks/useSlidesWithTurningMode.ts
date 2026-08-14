import { useMemo } from 'react'
import { useSlidesStore } from '@/store'
import { SLIDE_ANIMATIONS } from '@/configs/animation'

export default () => {
  const slides = useSlidesStore(s => s.slides)
  const slidesWithTurningMode = useMemo(() => {
    return slides.map(slide => {
      let turningMode = slide.turningMode
      if (!turningMode) turningMode = 'slideY'
      if (turningMode === 'random') {
        const turningModeKeys = SLIDE_ANIMATIONS.filter(item => !['random', 'no'].includes(item.value)).map(item => item.value)
        turningMode = turningModeKeys[Math.floor(Math.random() * turningModeKeys.length)]
      }
      return {
        ...slide,
        turningMode,
      }
    })
  }, [slides])

  return {
    slidesWithTurningMode,
  }
}
