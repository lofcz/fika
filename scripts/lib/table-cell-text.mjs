import { parseFragment } from 'parse5'

/** Read authored cell text without confusing rich markup with literal legacy HTML. */
export function tableCellText(cell) {
  if (cell.textFormat !== 'html') return cell.text
  const visit = node => {
    if (node.nodeName === '#text') return node.value
    if (node.tagName === 'br') return '\n'
    const content = (node.childNodes || []).map(visit).join('')
    return node.tagName === 'p' ? content + '\n' : content
  }
  return visit(parseFragment(cell.text)).replace(/\n$/, '')
}
