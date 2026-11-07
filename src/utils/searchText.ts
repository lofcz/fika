// Search offsets include structural breaks, while node offsets refer to the
// original DOM. This keeps discovery, highlights and replacement in agreement.
const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'TR', 'TD', 'TH'])

export const getSearchText = (root: Node) => {
  let content = ''
  const textNodes: Text[] = []
  const textList: { text: string; startIdx: number; endIdx: number }[] = []
  const addBreak = () => {
    if (content && !content.endsWith('\n')) content += '\n'
  }
  const visit = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('script, style, template')) return
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('.fika-math, .omml-math, [data-latex]')) {
      // Math is an atomic node. Replacing typeset glyph text would corrupt it.
      content += '\ufffc'
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node as Text).data
      if (!text) return
      textNodes.push(node as Text)
      const startIdx = content.length
      content += text
      textList.push({ text, startIdx, endIdx: content.length })
      return
    }
    const tag = node.nodeType === Node.ELEMENT_NODE ? (node as Element).tagName : ''
    if (tag === 'BR') {
      addBreak()
      return
    }
    const block = blockTags.has(tag)
    if (block) addBreak()
    for (const child of node.childNodes) visit(child)
    if (block) addBreak()
  }
  for (const child of root.childNodes) visit(child)
  return { content, textNodes, textList }
}

export const getSearchHtmlText = (html: string) => {
  const root = document.createElement('div')
  root.innerHTML = html
  return getSearchText(root).content
}

/** Apply visible-text ranges backwards so inline formatting and math remain intact. */
export const replaceSearchHtmlRanges = (html: string, ranges: { start: number; end: number }[], replacement: string) => {
  const root = document.createElement('div')
  root.innerHTML = html
  const { textNodes, textList } = getSearchText(root)
  for (const range of [...ranges].reverse()) {
    let inserted = false
    for (let i = 0; i < textList.length; i++) {
      const { startIdx, endIdx } = textList[i]
      if (endIdx <= range.start || startIdx >= range.end) continue
      const node = textNodes[i]
      const from = Math.max(0, range.start - startIdx)
      const to = Math.min(node.data.length, range.end - startIdx)
      node.replaceData(from, to - from, inserted ? '' : replacement)
      inserted = true
    }
  }
  return root.innerHTML
}
