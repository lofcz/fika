import { nanoid } from 'nanoid'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { Slide } from '@/types/slides'
import { copyText, readClipboard } from '@/utils/clipboard'
import { encrypt } from '@/utils/crypto'
import { createElementIdMap } from '@/utils/element'
import { KEYS } from '@/configs/hotkey'
import message from '@/utils/message'
import usePasteTextClipboardData from '@/hooks/usePasteTextClipboardData'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useAddSlidesOrElements from '@/hooks/useAddSlidesOrElements'
import { buildContentSlide, buildTitleSlide } from '@/configs/starterPresentation'
import { getLL } from '@/i18n/getLL'

const getSelectedSlidesIndex = () => {
  const { selectedSlidesIndex } = useMainStore.getState()
  const { slideIndex } = useSlidesStore.getState()
  return [...selectedSlidesIndex, slideIndex]
}

const getSelectedSlides = () => {
  const { slides } = useSlidesStore.getState()
  const selectedSlidesIndex = getSelectedSlidesIndex()
  return slides.filter((item, index) => selectedSlidesIndex.includes(index))
}

const getSelectedSlidesId = () => getSelectedSlides().map(item => item.id)

const getIsEmptySlide = () => {
  const { slides } = useSlidesStore.getState()
  if (slides.length === 0) return true
  if (slides.length > 1) return false
  if (slides[0].elements.length > 0) return false
  return true
}

export default () => {
  const { pasteTextClipboardData } = usePasteTextClipboardData()
  const { addSlidesFromData } = useAddSlidesOrElements()
  const { addHistorySnapshot } = useHistorySnapshot()

  const resetSlides = () => {
    const { theme } = useSlidesStore.getState()
    const emptySlide = buildTitleSlide(getLL(), {
      backgroundColor: theme.backgroundColor,
      fontColor: theme.fontColor,
      fontName: theme.fontName,
    })
    useSlidesStore.getState().updateSlideIndex(0)
    useMainStore.getState().setActiveElementIdList([])
    useSlidesStore.getState().setSlides([emptySlide])
  }

  /**
   * Move slide focus up or down.
   */
  const updateSlideIndex = (command: string) => {
    const { slideIndex, slides } = useSlidesStore.getState()
    const { activeElementIdList, setActiveElementIdList } = useMainStore.getState()
    if (command === KEYS.UP && slideIndex > 0) {
      if (activeElementIdList.length) setActiveElementIdList([])
      useSlidesStore.getState().updateSlideIndex(slideIndex - 1)
    }
    else if (command === KEYS.DOWN && slideIndex < slides.length - 1) {
      if (activeElementIdList.length) setActiveElementIdList([])
      useSlidesStore.getState().updateSlideIndex(slideIndex + 1)
    }
  }

  const copySlide = () => {
    const text = encrypt(JSON.stringify({
      type: 'slides',
      data: getSelectedSlides(),
    }))

    copyText(text).then(() => {
      useMainStore.getState().setThumbnailsFocus(true)
    })
  }

  const pasteSlide = () => {
    readClipboard().then(text => {
      pasteTextClipboardData(text, { onlySlide: true })
    }).catch(err => message.warning(err))
  }

  const createSlide = () => {
    const { theme } = useSlidesStore.getState()
    const emptySlide = buildContentSlide(getLL(), {
      backgroundColor: theme.backgroundColor,
      fontColor: theme.fontColor,
      fontName: theme.fontName,
    })
    useMainStore.getState().setActiveElementIdList([])
    useSlidesStore.getState().addSlide(emptySlide)
    addHistorySnapshot()
  }

  const createSlideByTemplate = (slide: Slide) => {
    const { groupIdMap, elIdMap } = createElementIdMap(slide.elements)

    for (const element of slide.elements) {
      element.id = elIdMap[element.id]
      if (element.groupId) element.groupId = groupIdMap[element.groupId]
    }
    const newSlide = {
      ...slide,
      id: nanoid(10),
    }
    useMainStore.getState().setActiveElementIdList([])
    useSlidesStore.getState().addSlide(newSlide)
    addHistorySnapshot()
  }

  const copyAndPasteSlide = () => {
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    const slide = JSON.parse(JSON.stringify(currentSlide))
    addSlidesFromData([slide])
  }

  const deleteSlide = (targetSlidesId = getSelectedSlidesId()) => {
    const { slides } = useSlidesStore.getState()
    if (slides.length === targetSlidesId.length) resetSlides()
    else useSlidesStore.getState().deleteSlide(targetSlidesId)

    useMainStore.getState().updateSelectedSlidesIndex([])

    addHistorySnapshot()
  }

  const cutSlide = () => {
    const targetSlidesId = [...getSelectedSlidesId()]
    copySlide()
    deleteSlide(targetSlidesId)
  }

  const selectAllSlide = () => {
    const { slides } = useSlidesStore.getState()
    const newSelectedSlidesIndex = Array.from(Array(slides.length), (item, index) => index)
    useMainStore.getState().setActiveElementIdList([])
    useMainStore.getState().updateSelectedSlidesIndex(newSelectedSlidesIndex)
  }

  const sortSlides = (newIndex: number, oldIndex: number) => {
    if (oldIndex === newIndex) return

    const _slides: Slide[] = JSON.parse(JSON.stringify(useSlidesStore.getState().slides))

    const movingSlide = _slides[oldIndex]
    const movingSlideSection = movingSlide.sectionTag
    if (movingSlideSection) {
      const movingSlideSectionNext = _slides[oldIndex + 1]
      delete movingSlide.sectionTag
      if (movingSlideSectionNext && !movingSlideSectionNext.sectionTag) {
        movingSlideSectionNext.sectionTag = movingSlideSection
      }
    }
    if (newIndex === 0) {
      const firstSection = _slides[0].sectionTag
      if (firstSection) {
        delete _slides[0].sectionTag
        movingSlide.sectionTag = firstSection
      }
    }

    const _slide = _slides[oldIndex]
    _slides.splice(oldIndex, 1)
    _slides.splice(newIndex, 0, _slide)
    useSlidesStore.getState().setSlides(_slides)
    useSlidesStore.getState().updateSlideIndex(newIndex)
  }

  const isEmptySlide = getIsEmptySlide()

  return {
    resetSlides,
    updateSlideIndex,
    copySlide,
    pasteSlide,
    createSlide,
    createSlideByTemplate,
    copyAndPasteSlide,
    deleteSlide,
    cutSlide,
    selectAllSlide,
    sortSlides,
    isEmptySlide,
  }
}
