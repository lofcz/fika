import { describe, expect, it } from '@rstest/core'
import { Schema, type Mark } from 'prosemirror-model'
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import { schemaMarks, schemaNodes } from '@/utils/prosemirror/schema'
import { splitBlockKeepStyle, splitListItemKeepStyle } from '@/utils/prosemirror/commands/splitBlockKeepStyle'

const schema = new Schema({ nodes: schemaNodes, marks: schemaMarks })

const textblockAligns = (state: EditorState) => {
  const aligns: string[] = []
  state.doc.descendants(node => {
    if (node.isTextblock) aligns.push(node.attrs.align || '')
  })
  return aligns
}

const apply = (state: EditorState, command: (s: EditorState, dispatch?: (tr: Transaction) => void) => boolean) => {
  let next: EditorState | null = null
  const ok = command(state, tr => { next = state.apply(tr) })
  if (!ok || !next) throw new Error('command failed')
  return next
}

const paragraphState = (
  text: string,
  attrs: Record<string, unknown>,
  cursor: 'end' | number = 'end',
  marks: readonly Mark[] = [],
) => {
  const para = schema.nodes.paragraph.create(
    attrs,
    text ? schema.text(text, marks) : undefined,
  )
  const doc = schema.nodes.doc.create(null, para)
  const pos = cursor === 'end' ? 1 + text.length : cursor
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
  })
}

describe('splitBlockKeepStyle', () => {
  it('Enter at the end of a left-aligned paragraph keeps left on the new line', () => {
    const next = apply(paragraphState('Hello', { align: 'left' }), splitBlockKeepStyle)
    expect(textblockAligns(next)).toEqual(['left', 'left'])
  })

  it('Enter at the end of a centered paragraph stays centered', () => {
    const next = apply(paragraphState('Hello', { align: 'center' }), splitBlockKeepStyle)
    expect(textblockAligns(next)).toEqual(['center', 'center'])
  })

  it('copies indent onto the new paragraph', () => {
    const next = apply(paragraphState('Hello', { align: 'left', indent: 2, textIndent: 1 }), splitBlockKeepStyle)
    const attrs: Array<Record<string, unknown>> = []
    next.doc.descendants(node => {
      if (node.isTextblock) attrs.push({ align: node.attrs.align, indent: node.attrs.indent, textIndent: node.attrs.textIndent })
    })
    expect(attrs).toEqual([
      { align: 'left', indent: 2, textIndent: 1 },
      { align: 'left', indent: 2, textIndent: 1 },
    ])
  })

  it('mid-paragraph Enter keeps align on both halves', () => {
    const next = apply(paragraphState('Hello', { align: 'right' }, 3), splitBlockKeepStyle)
    expect(textblockAligns(next)).toEqual(['right', 'right'])
    const texts: string[] = []
    next.doc.descendants(node => {
      if (node.isText) texts.push(node.text || '')
    })
    expect(texts.join('|')).toBe('He|llo')
  })

  it('does not restyle a following explicit-center paragraph', () => {
    const first = schema.nodes.paragraph.create({ align: 'left' }, schema.text('Hello'))
    const second = schema.nodes.paragraph.create({ align: 'center' }, schema.text('World'))
    const doc = schema.nodes.doc.create(null, [first, second])
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1 + 'Hello'.length),
    })
    const next = apply(state, splitBlockKeepStyle)
    expect(textblockAligns(next)).toEqual(['left', 'left', 'center'])
  })

  it('keeps active marks on the new empty line', () => {
    const next = apply(
      paragraphState('Hello', { align: 'left' }, 'end', [schema.marks.strong.create()]),
      splitBlockKeepStyle,
    )
    expect(next.storedMarks?.some(mark => mark.type === schema.marks.strong)).toBe(true)
  })
})

describe('splitListItemKeepStyle', () => {
  it('Enter at the end of a left-aligned list item keeps left on the new item', () => {
    const para = schema.nodes.paragraph.create({ align: 'left' }, schema.text('Item'))
    const item = schema.nodes.list_item.create(null, para)
    const list = schema.nodes.bullet_list.create(null, item)
    const doc = schema.nodes.doc.create(null, list)
    let end = 0
    doc.descendants((node, pos) => {
      if (node.isTextblock) end = pos + 1 + node.content.size
    })
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, end),
    })
    const next = apply(state, splitListItemKeepStyle(schema.nodes.list_item))
    expect(textblockAligns(next)).toEqual(['left', 'left'])
  })
})
