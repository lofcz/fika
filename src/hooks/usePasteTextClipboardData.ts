import message from '@/utils/message'
import { getLL } from '@/i18n/getLL'
import { useKeyboardStore } from '@/store'
import { pasteCustomClipboardString } from '@/utils/clipboard'
import { plainTextToParagraphs } from '@/utils/textParser'
import { getImageDataURL, isSVGString, svg2File } from '@/utils/image'
import { isValidURL } from '@/utils/common'
import useCreateElement from '@/hooks/useCreateElement'
import useAddSlidesOrElements from '@/hooks/useAddSlidesOrElements'

interface PasteTextClipboardDataOptions {
  onlySlide?: boolean
  onlyElements?: boolean
}

/**
 * Match image URLs from allowed hosts only.
 */
const isValidImgURL = (url: string) => {
  return /^https?:\/\/(?:[a-zA-Z0-9-]+\.)*fika\.cn\/[^\s]+\.(?:jpg|jpeg|png|svg|webp)(?:\?.*)?$/i.test(url)
}

export default () => {
  const { createTextElement, createImageElement } = useCreateElement()
  const { addElementsFromData, addSlidesFromData } = useAddSlidesOrElements()

  /**
   * Paste plain text as a new text element.
   */
  const createTextElementFromClipboard = (text: string) => {
    createTextElement({
      left: 0,
      top: 0,
      width: 600,
      height: 50,
    }, { content: text })
  }

  /**
   * Parse clipboard text and paste slides, elements, or plain text.
   * @param options.onlySlide Paste slides only
   * @param options.onlyElements Paste elements only
   */
  const pasteTextClipboardData = (text: string, options?: PasteTextClipboardDataOptions) => {
    const onlySlide = options?.onlySlide || false
    const onlyElements = options?.onlyElements || false

    const clipboardData = pasteCustomClipboardString(text)

    if (typeof clipboardData !== 'string') {
      if (!clipboardData || !Array.isArray(clipboardData.data) || !clipboardData.data.length) return
      const { type, data } = clipboardData

      if (type === 'elements' && !onlySlide) addElementsFromData(data)
      else if (type === 'slides' && !onlyElements) addSlidesFromData(data)
    }

    else if (!onlyElements && !onlySlide) {
      if (useKeyboardStore.getState().shiftKeyState) {
        const string = plainTextToParagraphs(clipboardData)
        createTextElementFromClipboard(string)
      }
      else {
        if (isValidImgURL(clipboardData)) {
          createImageElement(clipboardData)
        }
        else if (isValidURL(clipboardData)) {
          createTextElementFromClipboard(`<a href="${clipboardData}" title="${clipboardData}" target="_blank">${clipboardData}</a>`)
        }
        else if (isSVGString(clipboardData)) {
          const file = svg2File(clipboardData)
          getImageDataURL(file).then(dataURL => createImageElement(dataURL)).catch(() => message.error(getLL().common.fileParseError()))
        }
        else {
          const string = plainTextToParagraphs(clipboardData)
          createTextElementFromClipboard(string)
        }
      }
    }
  }

  return {
    pasteTextClipboardData,
  }
}
