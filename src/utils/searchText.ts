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
