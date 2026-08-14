import type { Node, NodeType } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { wrapInList } from 'prosemirror-schema-list';
import { findParentNode, isList } from '../utils';
const firstParagraphAttrs = (doc: Node, paragraph: NodeType) => {
  let attrs: Record<string, unknown> | undefined;
  doc.descendants(node => {
    if (node.type !== paragraph) return true;
    attrs = node.attrs;
    return false;
  });
  return attrs;
};
const isInBulletList = (view: EditorView) => {
  const {
    state
  } = view;
  const parentList = findParentNode(node => isList(node, state.schema))(state.selection);
  return parentList?.node.type === state.schema.nodes.bullet_list;
};

/** Empty content placeholders must become a real `<ul>` so typing/Enter produce list items. */
export const wrapEmptyInBulletList = (view: EditorView): boolean => {
  if (isInBulletList(view)) return false;
  const {
    state
  } = view;
  const {
    schema,
    doc,
    storedMarks
  } = state;
  const {
    bullet_list: bulletList,
    list_item: listItem,
    paragraph
  } = schema.nodes;
  if (doc.textContent.trim().length !== 0) {
    return wrapInList(bulletList)(state, view.dispatch);
  }
  const para = paragraph.create(firstParagraphAttrs(doc, paragraph));
  const list = bulletList.create(null, listItem.create(null, para));
  let tr = state.tr.replaceWith(0, doc.content.size, list);
  tr = tr.setSelection(TextSelection.atStart(tr.doc));
  if (storedMarks?.length) tr = tr.setStoredMarks(storedMarks);
  view.dispatch(tr);
  return true;
};

/** First typed character in an empty content placeholder becomes a list item. */
export const insertTextAsBulletList = (view: EditorView, text: string): boolean => {
  if (!text) return false;
  if (view.state.doc.textContent.trim().length !== 0) return false;
  if (isInBulletList(view)) return false;
  const {
    state
  } = view;
  const {
    schema,
    doc,
    storedMarks
  } = state;
  const {
    bullet_list: bulletList,
    list_item: listItem,
    paragraph
  } = schema.nodes;
  const marks = storedMarks ?? state.selection.$from.marks();
  const para = paragraph.create(firstParagraphAttrs(doc, paragraph), schema.text(text, marks));
  const list = bulletList.create(null, listItem.create(null, para));
  let tr = state.tr.replaceWith(0, doc.content.size, list);
  tr = tr.setSelection(TextSelection.atEnd(tr.doc));
  view.dispatch(tr);
  return true;
};
