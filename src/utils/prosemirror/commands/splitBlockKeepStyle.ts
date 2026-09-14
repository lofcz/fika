import { splitBlockAs } from 'prosemirror-commands';
import { splitListItemKeepMarks } from 'prosemirror-schema-list';
import type { Node, NodeType } from 'prosemirror-model';
import type { Command, Transaction } from 'prosemirror-state';

const keepMarks = (command: Command): Command => (state, dispatch) => (
  command(state, dispatch && ((tr: Transaction) => {
    const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
    if (marks) tr.ensureMarks(marks);
    dispatch(tr);
  }))
);

const blockStyleAttrs = (node: Node) => ({
  align: node.attrs.align,
  indent: node.attrs.indent,
  textIndent: node.attrs.textIndent,
  lineHeight: node.attrs.lineHeight,
});

const sameBlockStyle = (a: Node, b: Node) => (
  a.attrs.align === b.attrs.align
  && a.attrs.indent === b.attrs.indent
  && a.attrs.textIndent === b.attrs.textIndent
  && a.attrs.lineHeight === b.attrs.lineHeight
);

/**
 * Enter must continue the current paragraph — align, indent, and marks.
 * Default `splitBlock` / `splitListItem` drop attrs at the end of a block.
 */
export const splitBlockKeepStyle = keepMarks(
  splitBlockAs(node => ({ type: node.type, attrs: node.attrs })),
);

export const splitListItemKeepStyle = (itemType: NodeType): Command => (state, dispatch) => {
  const source = state.selection.$from.parent;
  return splitListItemKeepMarks(itemType)(state, dispatch && ((tr: Transaction) => {
    const $pos = tr.selection.$from;
    if (source.isTextblock && $pos.parent.isTextblock && !sameBlockStyle($pos.parent, source)) {
      tr.setNodeMarkup($pos.before($pos.depth), undefined, {
        ...$pos.parent.attrs,
        ...blockStyleAttrs(source),
      });
    }
    dispatch(tr);
  }));
};
