import type { PPTElement } from '@/types/slides'
import { placeholderTypedSizeOf } from '@/configs/textPresets'
import { createDocument } from './index'
import { defaultRichTextAttrs, getTextAttrsFromDoc, type TextAttrs } from './utils'

const EMPTY_HTML = /^(<p>(<br\s*\/?>)?<\/p>)?$/i

export function richTextAttrsFromElement(element: PPTElement): TextAttrs | null {
  if (element.type === 'text') {
    const defaults = {
      color: element.defaultColor || '#000000',
      backcolor: '',
      fontname: element.defaultFontName || '',
      fontsize: element.placeholder
        ? `${placeholderTypedSizeOf(element)}px`
        : (element.placeholderFontSize ? `${element.placeholderFontSize}px` : '16px'),
      align: element.placeholderAlign || 'left' as const,
    }
    const content = element.content?.trim() ?? ''
    if (!content || EMPTY_HTML.test(content)) {
      const listPlaceholder = element.textType === 'content' || element.textType === 'item'
      return {
        ...defaultRichTextAttrs,
        bold: element.textType !== 'title' && element.textType !== 'subtitle' && !!element.placeholderBold,
        em: !!element.placeholderItalic,
        fontsize: defaults.fontsize,
        fontname: defaults.fontname,
        color: defaults.color,
        align: defaults.align,
        bulletList: !!element.placeholder && listPlaceholder,
      }
    }
    return getTextAttrsFromDoc(createDocument(content), defaults)
  }
  if (element.type === 'shape' && element.text?.content) {
    return getTextAttrsFromDoc(createDocument(element.text.content), {
      color: element.text.defaultColor || '#000000',
      backcolor: '',
      fontname: element.text.defaultFontName || '',
      fontsize: '16px',
      align: 'left',
    })
  }
  return null
}
