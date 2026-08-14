import { nanoid } from 'nanoid'
import { useSlidesStore } from '@/store'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useSlideHandler from '@/hooks/useSlideHandler'

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()
  const { deleteSlide } = useSlideHandler()

  const createSection = () => {
    useSlidesStore.getState().updateSlide({
      sectionTag: {
        id: nanoid(6),
      },
    })
    addHistorySnapshot()
  }

  const removeSection = (sectionId: string) => {
    if (!sectionId) return

    const slide = useSlidesStore.getState().slides.find(item => item.sectionTag?.id === sectionId)!
    useSlidesStore.getState().removeSlideProps({
      id: slide.id,
      propName: 'sectionTag',
    })
    addHistorySnapshot()
  }

  const removeAllSection = () => {
    const _slides = useSlidesStore.getState().slides.map(slide => {
      if (slide.sectionTag) delete slide.sectionTag
      return slide
    })
    useSlidesStore.getState().setSlides(_slides)
    addHistorySnapshot()
  }

  const removeSectionSlides = (sectionId: string) => {
    const slides = useSlidesStore.getState().slides
    let startIndex = 0
    if (sectionId) {
      startIndex = slides.findIndex(slide => slide.sectionTag?.id === sectionId)
    }
    const ids: string[] = []

    for (let i = startIndex; i < slides.length; i++) {
      const slide = slides[i]
      if (i !== startIndex && slide.sectionTag) break
      ids.push(slide.id)
    }

    deleteSlide(ids)
  }

  const updateSectionTitle = (sectionId: string, title: string) => {
    if (!title) return

    const slides = useSlidesStore.getState().slides
    if (sectionId === 'default') {
      useSlidesStore.getState().updateSlide({
        sectionTag: {
          id: nanoid(6),
          title,
        },
      }, slides[0].id)
    }
    else {
      const slide = slides.find(item => item.sectionTag?.id === sectionId)
      if (!slide) return

      useSlidesStore.getState().updateSlide({
        sectionTag: {
          ...slide.sectionTag!,
          title,
        },
      }, slide.id)
    }
    addHistorySnapshot()
  }

  return {
    createSection,
    removeSection,
    removeAllSection,
    removeSectionSlides,
    updateSectionTitle,
  }
}
