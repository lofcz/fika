import type { CSSPropertiesWithVars } from '@/types/css'
import type { PPTTextElement, TextAlign } from '@/types/slides'
import {
  isListPlaceholderType,
  placeholderAlignOf,
  placeholderBoxTypography,
  placeholderPromptSizeOf,
  placeholderTypedSizeOf,
} from '@/configs/textPresets'
import type { PlaceholderStyleOptions } from '@/utils/prosemirror/commands/applyPlaceholderStyles'

export { isListPlaceholderType, placeholderAlignOf }

export const EMPTY_LIST_HTML = '<ul><li><p></p></li></ul>'
export const EMPTY_PARA_HTML = '<p></p>'

export const isListPlaceholder = (el: { placeholder?: string; textType?: string }) => (
  !!el.placeholder && isListPlaceholderType(el.textType)
)

export const emptyPlaceholderHtml = (el: { placeholder?: string; textType?: string }) => (
  isListPlaceholder(el) ? EMPTY_LIST_HTML : EMPTY_PARA_HTML
)

export type PlaceholderPhase = 'empty' | 'filled'

export const placeholderPhase = (empty: boolean): PlaceholderPhase => (empty ? 'empty' : 'filled')

export const placeholderSeed = (
  el: {
    placeholderFontSize?: number
    placeholderAlign?: TextAlign
    placeholderBold?: boolean
    placeholderItalic?: boolean
    defaultFontName?: string
    textType?: string
  },
  phase: PlaceholderPhase,
  color: string,
): PlaceholderStyleOptions => {
  const align = placeholderAlignOf(el)
  if (phase === 'empty') {
    return {
      fontSize: `${placeholderPromptSizeOf(el)}px`,
      align,
      color,
      fontName: el.defaultFontName || undefined,
      bold: false,
      italic: false,
    }
  }
  return {
    fontSize: `${placeholderTypedSizeOf(el)}px`,
    align,
    color,
    fontName: el.defaultFontName || undefined,
    bold: el.textType !== 'title' && el.textType !== 'subtitle' && !!el.placeholderBold,
    italic: !!el.placeholderItalic,
  }
}

export const placeholderBoxVars = (
  el: PPTTextElement,
  empty: boolean,
  promptColor: string,
): CSSPropertiesWithVars => {
  const type = placeholderBoxTypography(el, empty)
  if (!el.placeholder) return type
  return {
    ...type,
    '--placeholder-prompt': JSON.stringify(el.placeholder),
    '--placeholder-color': promptColor,
  }
}

export const placeholderChrome = (input: {
  placeholder?: string
  empty: boolean
  editing: boolean
}) => {
  const has = !!input.placeholder
  const showPrompt = has && input.empty && !input.editing
  return {
    editorMounted: true,
    showPrompt,
    hidePrompt: !showPrompt,
  }
}
