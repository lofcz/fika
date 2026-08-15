export const editorHtmlLooksEmpty = (html: string) => (
  !html.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
)

/**
 * Store owns authored HTML. A live view that has text always writes.
 * An idle empty view must not erase store text — only the focused/editing
 * editor may clear.
 */
export const shouldWriteEditorHtml = (opts: {
  nextHtml: string
  storeHtml: string
  isAuthoritative: boolean
}): boolean => {
  if (opts.nextHtml === opts.storeHtml) return false
  if (editorHtmlLooksEmpty(opts.nextHtml) && !editorHtmlLooksEmpty(opts.storeHtml)) {
    return opts.isAuthoritative
  }
  return true
}
