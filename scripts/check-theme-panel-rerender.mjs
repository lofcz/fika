import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function assert(condition, message) {
  if (!condition) failures.push(message)
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

const panelIndex = read('src/views/Editor/Toolbar/SlideDesignPanel/index.tsx')
const themeColors = read('src/views/Editor/Toolbar/SlideDesignPanel/ThemeColorsSetting.tsx')
const themeExtract = read('src/views/Editor/Toolbar/SlideDesignPanel/ThemeStylesExtract.tsx')
const hook = read('src/hooks/useSlideTheme.ts')

assert(!/useSlidesStore\(\s*selectCurrentSlide\s*\)/.test(panelIndex), 'SlideDesignPanel must not subscribe to selectCurrentSlide')
assert(!/useSlidesStore\(\s*s\s*=>\s*s\.slides\b/.test(panelIndex), 'SlideDesignPanel must not subscribe to slides')
assert(/selectCurrentSlideBackground/.test(panelIndex), 'SlideDesignPanel must select current slide background only')
assert(/memo\(function ThemeList/.test(panelIndex), 'Theme cards must live in a memo ThemeList')
assert(/export default memo\(SlideDesignPanel\)/.test(panelIndex), 'SlideDesignPanel must be memoized')
assert(/key=\{item\.id\}/.test(panelIndex), 'Theme cards must keep stable preset ids')

assert(!/useSlidesStore\(\s*selectCurrentSlide\s*\)/.test(themeColors), 'ThemeColorsSetting must not subscribe to selectCurrentSlide')
assert(!/useSlidesStore\(\s*s\s*=>\s*s\.slides\b/.test(themeColors), 'ThemeColorsSetting must not subscribe to slides')
assert(/useSlidesStore\(\s*s\s*=>\s*s\.theme\s*\)/.test(themeColors), 'ThemeColorsSetting may subscribe to theme only')

assert(!/useSlidesStore\(\s*selectCurrentSlide\s*\)/.test(themeExtract), 'ThemeStylesExtract must not subscribe to selectCurrentSlide')
assert(!/useSlidesStore\(\s*s\s*=>\s*s\.slides\b/.test(themeExtract), 'ThemeStylesExtract must not subscribe to slides')
assert(/useSlidesStore\.getState\(\)/.test(themeExtract), 'ThemeStylesExtract must read slides from getState()')

assert(!/useSlidesStore\(\s*s\s*=>\s*s\.slides\s*\)/.test(hook), 'useSlideTheme must not subscribe to slides')
assert(!/useSlidesStore\(\s*s\s*=>\s*s\.theme\s*\)/.test(hook), 'useSlideTheme must not subscribe to theme')
assert(/useSlidesStore\.getState\(\)/.test(hook), 'useSlideTheme must read store at action time')

const useSlidesStore = create()(immer((set) => ({
  theme: { themeColors: ['#000'], fontColor: '#333', fontName: '', backgroundColor: '#fff' },
  slides: [],
  slideIndex: 0,
  viewportRatio: 0.5625,
  setSlides(slides) {
    set((state) => {
      state.slides = slides
    })
  },
  updateElement(data) {
    set((state) => {
      const { id, props } = data
      const slide = state.slides[state.slideIndex]
      slide.elements = slide.elements.map(el => (
        el.id === id ? { ...el, ...props } : el
      ))
    })
  },
})))

useSlidesStore.getState().setSlides([{
  id: 'slide-1',
  background: { type: 'solid', color: '#fff' },
  elements: [{
    id: 'text-1',
    type: 'text',
    content: 'Hello',
    left: 0,
    top: 0,
    width: 100,
    height: 40,
    rotate: 0,
    defaultFontName: '',
    defaultColor: '#333',
  }],
}])
const background = useSlidesStore.getState().slides[0].background

const selectBackground = state => state.slides[state.slideIndex]?.background
const selectTheme = state => state.theme
const selectSlideIndex = state => state.slideIndex
const selectViewportRatio = state => state.viewportRatio
const selectCurrentSlide = state => state.slides[state.slideIndex]
const selectSlides = state => state.slides

function watch(selector) {
  let prev = selector(useSlidesStore.getState())
  let count = 0
  const unsub = useSlidesStore.subscribe(state => {
    const next = selector(state)
    if (!Object.is(prev, next)) {
      count += 1
      prev = next
    }
  })
  return {
    get count() { return count },
    unsub,
  }
}

const bg = watch(selectBackground)
const theme = watch(selectTheme)
const slideIndex = watch(selectSlideIndex)
const viewportRatio = watch(selectViewportRatio)
const currentSlide = watch(selectCurrentSlide)
const slides = watch(selectSlides)

useSlidesStore.getState().updateElement({
  id: 'text-1',
  props: { content: 'Hello world from typing' },
})

assert(bg.count === 0, `background selector notified ${bg.count} time(s) on text update`)
assert(theme.count === 0, `theme selector notified ${theme.count} time(s) on text update`)
assert(slideIndex.count === 0, `slideIndex selector notified ${slideIndex.count} time(s) on text update`)
assert(viewportRatio.count === 0, `viewportRatio selector notified ${viewportRatio.count} time(s) on text update`)
assert(currentSlide.count === 1, `currentSlide still changes on text update (control): got ${currentSlide.count}`)
assert(slides.count === 1, `slides still changes on text update (control): got ${slides.count}`)
assert(Object.is(selectBackground(useSlidesStore.getState()), background), 'background reference stays the same after typing')

bg.unsub()
theme.unsub()
slideIndex.unsub()
viewportRatio.unsub()
currentSlide.unsub()
slides.unsub()

if (failures.length) {
  console.error('theme panel rerender checks failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('theme panel rerender checks passed')
console.log('what remounted before: SlideDesignPanel + ThemeList/theme-cards via selectCurrentSlide and useSlideTheme(slides)')
console.log('remaining theme-panel rerender divergences: 0')
