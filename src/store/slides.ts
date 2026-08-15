import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { setAutoFreeze } from 'immer'
import { omit } from '@/utils/object'
import type { Slide, SlideTheme, PPTElement, PPTAnimation, SlideTemplate, ImportedSlideTemplate } from '@/types/slides'
import { getLL } from '@/i18n/getLL'
import { markSourcePackageDirty } from '@/utils/pptxSourcePackage'
import { collectSlidesFonts, loadGoogleFonts } from '@/utils/font'
import { DEFAULT_THEME_COLORS } from '@/configs/theme'
import { applySlideBackgroundWithContrast } from '@/utils/textContrast'
import {
  deleteSlidesPreservingIdentity,
  insertSlidesPreservingIdentity,
  moveSlidePreservingIdentity,
  reorderSlidesPreservingIdentity,
  slideIndexAfterDelete,
} from '@/utils/slideOrder'

export type AddSlideOptions = {
  index?: number
  select?: boolean
  keepSectionTag?: boolean
}

export function buildDefaultTemplates(): SlideTemplate[] {
  return []
}

interface RemovePropData {
  id: string
  propName: string | string[]
}

interface UpdateElementData {
  id: string | string[]
  props: Partial<PPTElement>
  slideId?: string
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readProp<T extends object>(obj: T, key: string): unknown {
  return obj[key as keyof T]
}

export interface FormatedAnimation {
  animations: PPTAnimation[]
  autoNext: boolean
}

export interface SlidesState {
  title: string
  theme: SlideTheme
  slides: Slide[]
  slideIndex: number
  viewportSize: number
  viewportRatio: number
  templates: SlideTemplate[]
  importedTemplates: ImportedSlideTemplate[]
}

export interface SlidesActions {
  setTitle: (title: string) => void
  setTheme: (themeProps: Partial<SlideTheme>) => void
  setViewportSize: (size: number) => void
  setViewportRatio: (viewportRatio: number) => void
  setSlides: (slides: Slide[], themeProps?: Partial<SlideTheme>, options?: { clone?: boolean }) => void
  setTemplates: (templates: SlideTemplate[]) => void
  addImportedTemplate: (template: ImportedSlideTemplate) => void
  replaceSlide: (slide: Slide, slideId?: string) => void
  addSlide: (slide: Slide | Slide[], options?: AddSlideOptions) => void
  updateSlide: (props: Partial<Slide>, slideId?: string) => void
  removeSlideProps: (data: RemovePropData) => void
  deleteSlide: (slideId: string | string[]) => void
  moveSlide: (fromIndex: number, toIndex: number) => void
  reorderSlides: (oldIndex: number, newIndex: number) => void
  updateSlideIndex: (index: number) => void
  addElement: (element: PPTElement | PPTElement[]) => void
  deleteElement: (elementId: string | string[]) => void
  updateElement: (data: UpdateElementData) => void
  removeElementProps: (data: RemovePropData) => void
}

export type SlidesStore = SlidesState & SlidesActions

export const selectCurrentSlide = (state: SlidesState) => state.slides[state.slideIndex]

export const selectIsEmptySlide = (state: SlidesState) => {
  if (state.slides.length === 0) return true
  if (state.slides.length > 1) return false
  return state.slides[0].elements.length === 0
}

export const selectSlideId = (state: SlidesState) => state.slides[state.slideIndex]?.id

export const selectElementById = (id: string) => (state: SlidesState): PPTElement | undefined => {
  const current = state.slides[state.slideIndex]
  const fromCurrent = current?.elements.find(el => el.id === id)
  if (fromCurrent) return fromCurrent
  for (const slide of state.slides) {
    if (slide === current) continue
    const found = slide.elements.find(el => el.id === id)
    if (found) return found
  }
  return undefined
}

const EMPTY_ANIMATIONS: PPTAnimation[] = []
const EMPTY_FORMATED_ANIMATIONS: FormatedAnimation[] = []

export const selectCurrentSlideAnimations = (state: SlidesState) => {
  const currentSlide = state.slides[state.slideIndex]
  if (!currentSlide?.animations) return EMPTY_ANIMATIONS
  const elIds = currentSlide.elements.map(el => el.id)
  return currentSlide.animations.filter(animation => elIds.includes(animation.elId))
}

export const selectFormatedAnimations = (state: SlidesState) => {
  const currentSlide = state.slides[state.slideIndex]
  if (!currentSlide?.animations) return EMPTY_FORMATED_ANIMATIONS
  const elIds = currentSlide.elements.map(el => el.id)
  const animations = currentSlide.animations.filter(animation => elIds.includes(animation.elId))
  const formatedAnimations: FormatedAnimation[] = []
  for (const animation of animations) {
    if (animation.trigger === 'click' || !formatedAnimations.length) {
      formatedAnimations.push({ animations: [animation], autoNext: false })
    }
    else if (animation.trigger === 'meantime') {
      const last = formatedAnimations[formatedAnimations.length - 1]
      last.animations = last.animations.filter(item => item.elId !== animation.elId)
      last.animations.push(animation)
      formatedAnimations[formatedAnimations.length - 1] = last
    }
    else if (animation.trigger === 'auto') {
      const last = formatedAnimations[formatedAnimations.length - 1]
      last.autoNext = true
      formatedAnimations[formatedAnimations.length - 1] = last
      formatedAnimations.push({ animations: [animation], autoNext: false })
    }
  }
  return formatedAnimations
}

setAutoFreeze(false)

export const useSlidesStore = create<SlidesStore>()(
  immer((set, get) => ({
    title: getLL().editor.presentation.untitled(),
    theme: {
      themeColors: [...DEFAULT_THEME_COLORS],
      fontColor: '#333',
      fontName: '',
      backgroundColor: '#fff',
      shadow: { h: 3, v: 3, blur: 2, color: '#808080' },
      outline: { width: 2, color: '#525252', style: 'solid' },
    },
    slides: [],
    slideIndex: 0,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    templates: buildDefaultTemplates(),
    importedTemplates: [],

    setTitle(title) {
      set((state) => {
        state.title = title || getLL().editor.presentation.untitled()
      })
    },

    setTheme(themeProps) {
      set((state) => {
        state.theme = { ...state.theme, ...clonePlain(themeProps) }
      })
    },

    setViewportSize(size) {
      set((state) => {
        state.viewportSize = size
      })
    },

    setViewportRatio(viewportRatio) {
      set((state) => {
        state.viewportRatio = viewportRatio
      })
    },

    setSlides(slides, themeProps, options) {
      const prevIndex = get().slideIndex
      set((state) => {
        state.slides = options?.clone === false ? slides : clonePlain(slides)
        state.slideIndex = slides.length === 0 ? 0 : Math.min(prevIndex, slides.length - 1)
      })
      if (themeProps) get().setTheme(themeProps)
      if (!slides.every(slide => !!slide.sourcePackageId)) markSourcePackageDirty()
      loadGoogleFonts(collectSlidesFonts(slides))
    },

    setTemplates(templates) {
      set((state) => {
        state.templates = templates
      })
    },

    addImportedTemplate(template) {
      set((state) => {
        state.importedTemplates.push(template)
      })
    },

    replaceSlide(slide, slideId) {
      set((state) => {
        const slideIndex = slideId ? state.slides.findIndex(item => item.id === slideId) : state.slideIndex
        if (slideIndex < 0) return
        state.slides[slideIndex] = clonePlain(slide)
      })
      markSourcePackageDirty()
    },

    addSlide(slide, options) {
      const incoming = Array.isArray(slide) ? slide : [slide]
      if (!incoming.length) return
      if (!options?.keepSectionTag) {
        for (const item of incoming) {
          if (item.sectionTag) delete item.sectionTag
        }
      }
      const current = get()
      const addIndex = Math.max(0, Math.min(options?.index ?? current.slideIndex + 1, current.slides.length))
      const slides = insertSlidesPreservingIdentity(current.slides, addIndex, incoming)
      const slideIndex = options?.select === false
        ? (addIndex <= current.slideIndex ? current.slideIndex + incoming.length : current.slideIndex)
        : addIndex
      set((state) => {
        state.slides = slides
        state.slideIndex = slideIndex
      })
      markSourcePackageDirty()
      loadGoogleFonts(collectSlidesFonts(incoming))
    },

    updateSlide(props, slideId) {
      set((state) => {
        const slideIndex = slideId ? state.slides.findIndex(item => item.id === slideId) : state.slideIndex
        if (slideIndex < 0) return
        const next = { ...state.slides[slideIndex], ...props }
        state.slides[slideIndex] = props.background
          ? applySlideBackgroundWithContrast(next, {
            backgroundColor: state.theme.backgroundColor,
            fontColor: state.theme.fontColor,
          })
          : next
      })
      markSourcePackageDirty()
    },

    removeSlideProps(data) {
      set((state) => {
        const index = state.slides.findIndex(slide => slide.id === data.id)
        if (index < 0) return
        state.slides[index] = omit(state.slides[index], data.propName) as Slide
      })
    },

    deleteSlide(slideId) {
      const slidesId = Array.isArray(slideId) ? slideId : [slideId]
      const current = get()
      const { slides, deletedIndexes } = deleteSlidesPreservingIdentity(current.slides, slidesId)
      if (!deletedIndexes.length) return
      const slideIndex = slideIndexAfterDelete(
        current.slideIndex,
        current.slides,
        new Set(slidesId),
        slides.length,
        deletedIndexes,
      )
      set((state) => {
        state.slides = slides
        state.slideIndex = slideIndex
      })
      markSourcePackageDirty()
    },

    moveSlide(fromIndex, toIndex) {
      const { slides, index } = moveSlidePreservingIdentity(get().slides, fromIndex, toIndex)
      if (slides === get().slides) return
      set((state) => {
        state.slides = slides
        state.slideIndex = index
      })
    },

    reorderSlides(oldIndex, newIndex) {
      if (oldIndex === newIndex) return
      set((state) => {
        const next = reorderSlidesPreservingIdentity(state.slides, oldIndex, newIndex)
        if (next === state.slides) return
        state.slides = next
        state.slideIndex = newIndex
      })
    },

    updateSlideIndex(index) {
      set((state) => {
        if (state.slideIndex === index) return
        state.slideIndex = index
      })
    },

    addElement(element) {
      set((state) => {
        const elements = Array.isArray(element) ? element : [element]
        const currentSlideEls = state.slides[state.slideIndex].elements
        state.slides[state.slideIndex].elements = [...currentSlideEls, ...elements]
      })
      markSourcePackageDirty()
    },

    deleteElement(elementId) {
      set((state) => {
        const elementIdList = Array.isArray(elementId) ? elementId : [elementId]
        const currentSlideEls = state.slides[state.slideIndex].elements
        state.slides[state.slideIndex].elements = currentSlideEls.filter(item => !elementIdList.includes(item.id))
      })
      markSourcePackageDirty()
    },

    updateElement(data) {
      const { id, props, slideId } = data
      const elIdList = typeof id === 'string' ? [id] : id
      const state = get()
      const slideIndex = slideId ? state.slides.findIndex(item => item.id === slideId) : state.slideIndex
      const slide = state.slides[slideIndex]
      if (!slide) return
      const needsWrite = slide.elements.some(el => {
        if (!elIdList.includes(el.id)) return false
        return Object.keys(props).some(key => !Object.is(readProp(el, key), readProp(props, key)))
      })
      if (!needsWrite) return
      set((state) => {
        const nextIndex = slideId ? state.slides.findIndex(item => item.id === slideId) : state.slideIndex
        const nextSlide = state.slides[nextIndex]
        if (!nextSlide) return
        nextSlide.elements = nextSlide.elements.map(el => (
          elIdList.includes(el.id) ? { ...el, ...props } as PPTElement : el
        ))
      })
      markSourcePackageDirty()
    },

    removeElementProps(data) {
      set((state) => {
        const propsNames = typeof data.propName === 'string' ? [data.propName] : data.propName
        const slide = state.slides[state.slideIndex]
        slide.elements = slide.elements.map(el => (
          el.id === data.id ? omit(el, propsNames) : el
        )) as PPTElement[]
      })
      markSourcePackageDirty()
    },
  })),
)
