import type { CSSPropertiesWithVars } from '@/types/css'
import type { PPTTextElement, TextAlign } from '@/types/slides'
import {
  COVER_TITLE_PROMPT_SIZE,
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

export const isEmptyRichText = (html?: string) => (
  !html?.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
)

export const isUnfilledPlaceholder = (el: { placeholder?: string; content?: string }) => (
  !!el.placeholder && isEmptyRichText(el.content)
)

/** Slide previews paint authored text only. Empty placeholder prompts stay on the canvas. */
export const shouldRasterPreviewText = (el: { placeholder?: string; content?: string }) => (
  !isUnfilledPlaceholder(el)
)

/** Rewrite leaked prompt-size marks (36 on a cover title) back to the typed size. */
export const repairFilledPlaceholderHtml = (
  el: { placeholder?: string; textType?: string; placeholderFontSize?: number },
  html: string,
) => {
  if (!el.placeholder || !html || isEmptyRichText(html)) return html
  const prompt = placeholderPromptSizeOf(el)
  const typed = placeholderTypedSizeOf(el)
  if (prompt === typed) return html
  return html.replace(
    new RegExp(`font-size:\\s*${prompt}(?:\\.0)?px`, 'gi'),
    `font-size: ${typed}px`,
  )
}

export const isListPlaceholder = (el: { placeholder?: string; textType?: string }) => (
  !!el.placeholder && isListPlaceholderType(el.textType)
)

export const emptyPlaceholderHtml = (el: { placeholder?: string; textType?: string }) => (
  isListPlaceholder(el) ? EMPTY_LIST_HTML : EMPTY_PARA_HTML
)

export type PlaceholderPhase = 'empty' | 'filled'

export const placeholderPhase = (empty: boolean): PlaceholderPhase => (empty ? 'empty' : 'filled')

/** Empty-prompt styles must never rewrite typed text (that is how 66 collapses to 36). */
export const shouldSkipPlaceholderStyleApply = (input: {
  docEmpty: boolean
  phaseHint?: PlaceholderPhase
  fontSize?: string
}) => {
  const phase = input.phaseHint ?? placeholderPhase(input.docEmpty)
  if (phase === 'empty' && !input.docEmpty) return true
  if (
    phase === 'filled'
    && !input.docEmpty
    && parseInt(input.fontSize ?? '', 10) === COVER_TITLE_PROMPT_SIZE
  ) return true
  return false
}

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
