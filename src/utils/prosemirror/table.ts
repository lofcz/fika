import DOMPurify from 'dompurify'
import { DOMParser, DOMSerializer, Schema, Fragment, type Mark, type Node as PMNode } from 'prosemirror-model'
import { EditorState, type Transaction } from 'prosemirror-state'
import type { TableCell, TableCellStyle } from '@/types/slides'
import { markdownMathSegments } from '@/text'
import { normalizeFittedFontSizes } from '@/utils/richTextFontSize'
import { buildMathElement, normalizeImportedLatex } from '@/utils/math'
import nodes from './schema/nodes'
import marks from './schema/marks'

export const tableSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: nodes.paragraph,
    text: nodes.text,
    hard_break: nodes.hard_break,
    math: {
      ...nodes.math,
      parseDOM: [{
        tag: 'span[data-latex]',
        getAttrs: dom => ({
          latex: normalizeImportedLatex((dom as HTMLElement).getAttribute('data-latex') || ''),
          display: (dom as HTMLElement).getAttribute('data-display') === 'true',
        }),
      }, ...(nodes.math.parseDOM || [])],
      // Stored markup is never authoritative for math: always render from LaTeX.
      toDOM: node => buildMathElement(node.attrs.latex, '', !!node.attrs.display),
    },
  },
  marks: {
    strong: marks.strong,
    em: marks.em,
    underline: {
      ...marks.underline,
      parseDOM: [{ tag: 'u' }, ...['text-decoration', 'text-decoration-line'].map(style => ({
        style, consuming: false, getAttrs: (value: string) => value.includes('underline') ? null : false,
      }))],
    },
    strikethrough: {
      ...marks.strikethrough,
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, ...['text-decoration', 'text-decoration-line'].map(style => ({
        style, consuming: false, getAttrs: (value: string) => value.includes('line-through') ? null : false,
      }))],
    },
    forecolor: marks.forecolor,
    fontsize: { ...marks.fontsize, toDOM: mark => ['span', { style: `font-size: ${mark.attrs.fontsize}` }, 0] },
    fontname: marks.fontname,
    code: marks.code,
    subscript: { ...marks.subscript, excludes: 'superscript' },
    superscript: { ...marks.superscript, excludes: 'subscript' },
    link: { ...marks.link, toDOM: mark => ['a', { ...mark.attrs, rel: 'noopener noreferrer' }, 0] },
  },
})

export const plainTextToTableHTML = (text: string) => `<p>${text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\r\n?|\n/g, '<br>')}</p>`

const markNames = { bold: 'strong', em: 'em', underline: 'underline', strikethrough: 'strikethrough', color: 'forecolor', fontsize: 'fontsize', fontname: 'fontname' } as const
export type TableTextAttrs = Pick<TableCellStyle, keyof typeof markNames | 'align'> & { clear?: boolean }

/** Convert complete delimited formulas, preserving surrounding text and marks. */
export function typesetTableMath(tr: Transaction) {
  const replacements: { pos: number; size: number; nodes: PMNode[] }[] = []
  tr.doc.descendants((node, pos) => {
    if (!node.isText || node.marks.some(mark => mark.type.name === 'code')) return
    const segments = markdownMathSegments(node.text || '')
    if (!segments.some(segment => segment.type === 'math')) return
    replacements.push({ pos, size: node.nodeSize, nodes: segments.filter(segment => segment.raw).map(segment =>
      segment.type === 'math'
        ? tableSchema.nodes.math.create({ latex: segment.value, display: segment.display }, null, node.marks)
        : tableSchema.text(segment.raw, node.marks),
    ) })
  })
  for (const replacement of replacements.reverse()) {
    tr.replaceWith(replacement.pos, replacement.pos + replacement.size, Fragment.from(replacement.nodes))
  }
  return tr
}

export function parseTableText(cell: Pick<TableCell, 'text' | 'textFormat' | 'style'>): PMNode {
  const container = document.createElement('div')
  container.innerHTML = DOMPurify.sanitize(normalizeFittedFontSizes(
    cell.textFormat === 'html' ? cell.text : plainTextToTableHTML(cell.text),
  ))
  if (cell.textFormat !== 'html') {
    // Migrate legacy whole-cell emphasis into marks before partial formatting.
    for (const [key, tag] of [['bold', 'strong'], ['em', 'em'], ['underline', 'u'], ['strikethrough', 's']] as const) {
      if (!cell.style?.[key]) continue
      for (const paragraph of container.querySelectorAll('p')) {
        const wrap = document.createElement(tag)
        wrap.append(...paragraph.childNodes)
        paragraph.append(wrap)
      }
    }
  }
  const doc = DOMParser.fromSchema(tableSchema).parse(container, { preserveWhitespace: 'full' })
  return typesetTableMath(EditorState.create({ doc }).tr).doc
}

/** Keep only math source in storage; generated glyph markup belongs to the view. */
export function serializeTableText(doc: PMNode, renderMath = false): string {
  const container = document.createElement('div')
  const serializer = DOMSerializer.fromSchema(tableSchema)
  const clean = renderMath ? serializer : new DOMSerializer({
    ...serializer.nodes,
    math: node => ['span', { class: 'fika-math', 'data-latex': node.attrs.latex, 'data-display': String(!!node.attrs.display) }],
  }, serializer.marks)
  container.append(clean.serializeFragment(doc.content))
  return container.innerHTML
}

export function setTableTextAttrs(state: EditorState, attrs: TableTextAttrs, all = false) {
  const whole = all || state.selection.empty
  const from = whole ? 0 : state.selection.from
  const to = whole ? state.doc.content.size : state.selection.to
  const tr = state.tr
  if (attrs.clear) {
    tr.removeMark(from, to)
    if (state.selection.empty) tr.setStoredMarks([])
  }
  for (const key of Object.keys(markNames) as (keyof typeof markNames)[]) {
    const value = attrs[key]
    if (value === undefined) continue
    const type = tableSchema.marks[markNames[key]]
    const mark = value ? type.create(typeof value === 'boolean' ? null : { [key]: value, ...(key === 'color' ? { explicit: true } : {}) }) : null
    tr.removeMark(from, to, type)
    if (mark) tr.addMark(from, to, mark)
    if (state.selection.empty) {
      if (mark) tr.addStoredMark(mark)
      else tr.removeStoredMark(type)
    }
  }
  if (attrs.align !== undefined) {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) tr.setNodeMarkup(pos, undefined, { ...node.attrs, align: attrs.align })
    })
  }
  return tr
}

export function getTableTextAttrs(state: EditorState, defaults: TableCellStyle = {}): TableTextAttrs {
  let selected: readonly Mark[] = state.storedMarks || state.selection.$from.marks()
  if (!state.selection.empty) {
    let found = false
    state.doc.nodesBetween(state.selection.from, state.selection.to, node => {
      if (!found && node.isInline) { selected = node.marks; found = true }
    })
  }
  const result: TableTextAttrs = { align: state.selection.$from.parent.attrs.align || defaults.align || 'left' }
  for (const [key, name] of Object.entries(markNames)) {
    const mark = tableSchema.marks[name].isInSet(selected)
    Object.assign(result, { [key]: ['bold', 'em', 'underline', 'strikethrough'].includes(key)
      ? !!mark : mark?.attrs[key] || defaults[key as keyof TableCellStyle] || (key === 'fontsize' ? '14px' : key === 'color' ? '#000000' : '') })
  }
  return result
}

export function updateTableCellTextAttrs(cell: TableCell, attrs: TableTextAttrs): TableCell {
  const state = EditorState.create({ doc: parseTableText(cell) })
  const { clear: _clear, ...defaults } = attrs
  return { ...cell, textFormat: 'html', text: serializeTableText(state.apply(setTableTextAttrs(state, attrs, true)).doc), style: { ...cell.style, ...defaults } }
}
