import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

type Node = DefaultTreeAdapterTypes.ChildNode;
type Element = DefaultTreeAdapterTypes.Element;
const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'section', 'article', 'tr']);
const OMIT = new Set(['script', 'style', 'template']);
const isElement = (node: Node): node is Element => 'tagName' in node;
const isBlock = (node: Node) => isElement(node) && BLOCKS.has(node.tagName);

/** PPTX's plain-text notes API still needs every block, list item and hard break.
 * Walk once in document order: selecting only paragraphs loses bare list text;
 * collecting both p/li descendants duplicates nested content.
 */
export function speakerNotesToText(html: string): string {
  const fragment = parseFragment(html);
  const normalizeLines = (text: string) => text.replace(/\r\n?|\u2028|\u2029/g, '\n');
  if (fragment.childNodes.every(node => node.nodeName === '#text')) {
    return normalizeLines(fragment.childNodes.map(node => (node as DefaultTreeAdapterTypes.TextNode).value).join(''));
  }
  const childrenText = (nodes: Node[], depth: number, pre = false): string => {
    let text = '';
    let previousBlock = false;
    let seen = false;
    for (const [index, node] of nodes.entries()) {
      if (!isElement(node) && node.nodeName !== '#text') continue;
      const block = isBlock(node);
      // Ignore HTML indentation around blocks, without removing spaces between
      // inline marks (e.g. <strong>one</strong> <em>two</em>).
      if (node.nodeName === '#text' && !pre && /^\s+$/.test((node as DefaultTreeAdapterTypes.TextNode).value)
        && (previousBlock || isBlock(nodes[index + 1] ?? node))) continue;
      if (isElement(node) && OMIT.has(node.tagName)) continue;
      if (seen && (block || previousBlock)) text += '\n';
      text += nodeText(node, depth, pre);
      previousBlock = block;
      seen = true;
    }
    return text;
  };
  const nodeText = (node: Node, depth: number, pre: boolean): string => {
    if (node.nodeName === '#text') {
      const value = (node as DefaultTreeAdapterTypes.TextNode).value;
      return pre ? value : value.replace(/[ \t\r\n\f]+/g, ' ');
    }
    if (!isElement(node) || OMIT.has(node.tagName)) return '';
    if (node.tagName === 'br') return '\n';
    if (node.tagName === 'ul' || node.tagName === 'ol') {
      const items = node.childNodes.filter((child): child is Element => isElement(child) && child.tagName === 'li');
      const reversed = node.attrs.some(attr => attr.name === 'reversed');
      const attrNumber = (el: Element, name: string, fallback: number) => {
        const value = el.attrs.find(attr => attr.name === name)?.value;
        return value !== undefined && /^-?\d+$/.test(value) ? Number(value) : fallback;
      };
      let number = attrNumber(node, 'start', reversed ? items.length : 1);
      return items.map(item => {
        number = attrNumber(item, 'value', number);
        const marker = node.tagName === 'ol' ? `${number}. ` : '• ';
        number += reversed ? -1 : 1;
        return `${'  '.repeat(depth)}${marker}${childrenText(item.childNodes, depth + 1)}`;
      }).join('\n');
    }
    // ProseMirror's empty paragraph contains a placeholder br, not two lines.
    if (node.tagName === 'p' && node.childNodes.length === 1
      && isElement(node.childNodes[0]) && node.childNodes[0].tagName === 'br') return '';
    return childrenText(node.childNodes, depth, pre || node.tagName === 'pre');
  };
  return normalizeLines(childrenText(fragment.childNodes, 0));
}
