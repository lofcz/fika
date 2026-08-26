import { nodes } from 'prosemirror-schema-basic';
import type { Node, NodeSpec } from 'prosemirror-model';
import { listItem as _listItem } from 'prosemirror-schema-list';
import { buildMathElement, normalizeImportedLatex } from '@/utils/math';
type Attr = Record<string, number | string>;
function listAttrsFromDOM(dom: HTMLElement, extra?: Attr): Attr {
  const attr: Attr = {
    ...extra
  };
  const {
    listStyleType,
    fontSize,
    color,
    paddingInlineStart,
    paddingLeft
  } = dom.style;
  if (listStyleType) attr['listStyleType'] = listStyleType;
  if (fontSize) attr['fontsize'] = fontSize;
  if (color) attr['color'] = color;
  const padding = paddingInlineStart || paddingLeft;
  if (padding) attr['paddingInlineStart'] = padding;
  return attr;
}
function listStyleToDOM(node: Node): string {
  const {
    listStyleType,
    fontsize,
    color,
    paddingInlineStart
  } = node.attrs;
  let style = '';
  if (listStyleType) style += `list-style-type: ${listStyleType};`;
  if (fontsize) style += `font-size: ${fontsize};`;
  if (color) style += `color: ${color};`;
  if (paddingInlineStart) style += `padding-inline-start: ${paddingInlineStart};`;
  return style;
}
const orderedList: NodeSpec = {
  attrs: {
    order: {
      default: 1
    },
    listStyleType: {
      default: ''
    },
    fontsize: {
      default: ''
    },
    color: {
      default: ''
    },
    paddingInlineStart: {
      default: ''
    }
  },
  content: 'list_item+',
  group: 'block',
  parseDOM: [{
    tag: 'ol',
    getAttrs: dom => {
      const order = ((dom as HTMLElement).hasAttribute('start') ? (dom as HTMLElement).getAttribute('start') : 1) || 1;
      return listAttrsFromDOM(dom as HTMLElement, {
        order: +order
      });
    }
  }],
  toDOM: (node: Node) => {
    const {
      order
    } = node.attrs;
    const attr: Attr = {
      style: listStyleToDOM(node)
    };
    if (order !== 1) attr['start'] = order;
    return ['ol', attr, 0];
  }
};
const bulletList: NodeSpec = {
  attrs: {
    listStyleType: {
      default: ''
    },
    fontsize: {
      default: ''
    },
    color: {
      default: ''
    },
    paddingInlineStart: {
      default: ''
    }
  },
  content: 'list_item+',
  group: 'block',
  parseDOM: [{
    tag: 'ul',
    getAttrs: dom => listAttrsFromDOM(dom as HTMLElement)
  }],
  toDOM: (node: Node) => {
    return ['ul', {
      style: listStyleToDOM(node)
    }, 0];
  }
};
const listItem: NodeSpec = {
  ..._listItem,
  content: 'paragraph block*',
  group: 'block'
};
const paragraph: NodeSpec = {
  attrs: {
    align: {
      default: ''
    },
    indent: {
      default: 0
    },
    textIndent: {
      default: 0
    },
    lineHeight: {
      default: ''
    }
  },
  content: 'inline*',
  group: 'block',
  parseDOM: [{
    tag: 'p',
    getAttrs: dom => {
      const {
        textAlign,
        textIndent,
        lineHeight
      } = (dom as HTMLElement).style;
      let align = (dom as HTMLElement).getAttribute('align') || textAlign || '';
      align = /(left|right|center|justify)/.test(align) ? align : '';
      let textIndentLevel = 0;
      if (textIndent) {
        if (/em/.test(textIndent)) {
          textIndentLevel = parseInt(textIndent);
        } else if (/px/.test(textIndent)) {
          textIndentLevel = Math.floor(parseInt(textIndent) / 16);
          if (!textIndentLevel) textIndentLevel = 1;
        }
      }
      const indent = +((dom as HTMLElement).getAttribute('data-indent') || 0);
      return {
        align,
        indent,
        textIndent: textIndentLevel,
        lineHeight: lineHeight || ''
      };
    }
  }, {
    tag: 'img',
    ignore: true
  }, {
    tag: 'pre',
    skip: true
  }],
  toDOM: (node: Node) => {
    const {
      align,
      indent,
      textIndent,
      lineHeight
    } = node.attrs;
    let style = '';
    if (align && align !== 'left') style += `text-align: ${align};`;
    if (textIndent) style += `text-indent: ${textIndent}em;`;
    if (lineHeight) style += `line-height: ${lineHeight};`;
    const attr: Attr = {
      style
    };
    if (indent) attr['data-indent'] = indent;
    return ['p', attr, 0];
  }
};

const math: NodeSpec = {
  attrs: {
    latex: {
      default: ''
    },
    html: {
      default: ''
    },
    display: {
      default: false
    }
  },
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,
  marks: '_',
  parseDOM: [{
    tag: `span.fika-math`,
    getAttrs: dom => {
      const el = dom as HTMLElement;
      return {
        latex: normalizeImportedLatex(el.getAttribute('data-latex') || ''),
        html: el.innerHTML,
        display: el.getAttribute('data-display') === 'true'
      };
    }
  },
  {
    tag: 'eq',
    getAttrs: dom => {
      const el = dom as HTMLElement;
      if (el.querySelector('.fika-math')) return false;
      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      const latex = normalizeImportedLatex(
        (annotation?.textContent || el.getAttribute('data-latex') || '').trim()
      );
      if (!latex) return false;
      return {
        latex,
        html: el.innerHTML,
        display: false
      };
    }
  }, {
    tag: 'eqn',
    getAttrs: dom => {
      const el = dom as HTMLElement;
      if (el.querySelector('.fika-math')) return false;
      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      const latex = normalizeImportedLatex(
        (annotation?.textContent || el.getAttribute('data-latex') || '').trim()
      );
      if (!latex) return false;
      return {
        latex,
        html: el.innerHTML,
        display: true
      };
    }
  }],
  toDOM: (node: Node) => buildMathElement(node.attrs.latex as string, node.attrs.html as string, !!node.attrs.display)
};
const {
  doc,
  blockquote,
  text
} = nodes;
export default {
  doc,
  paragraph,
  blockquote,
  text,
  math,
  'ordered_list': orderedList,
  'bullet_list': bulletList,
  'list_item': listItem
};
