import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { selectAll } from 'prosemirror-commands';
const lastRangeByView = new WeakMap<EditorView, {
  from: number;
  to: number;
}>();
export const rememberTextSelection = (view: EditorView) => {
  const {
    empty,
    from,
    to
  } = view.state.selection;
  if (!empty && to > from) lastRangeByView.set(view, {
    from,
    to
  });
};
export const forgetTextSelection = (view: EditorView) => {
  lastRangeByView.delete(view);
};
export const clampRangeToDoc = (from: number, to: number, size: number) => {
  const nextFrom = Math.max(0, Math.min(from, size));
  const nextTo = Math.max(0, Math.min(to, size));
  return nextTo > nextFrom ? {
    from: nextFrom,
    to: nextTo
  } : null;
};
export const resolveRememberedRange = (view: EditorView) => {
  const {
    empty,
    from,
    to
  } = view.state.selection;
  if (!empty && to > from) return {
    from,
    to
  };
  const saved = lastRangeByView.get(view);
  if (!saved) return null;
  return clampRangeToDoc(saved.from, saved.to, view.state.doc.content.size);
};
export const restoreTextSelection = (view: EditorView): boolean => {
  if (!view.state.selection.empty) return true;
  const range = resolveRememberedRange(view);
  if (!range) return false;
  try {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)));
    return true;
  } catch {
    return false;
  }
};

/** Keep a selected range; only fall back to the whole box when there was never a range. */
export const autoSelectAll = (view: EditorView) => {
  if (restoreTextSelection(view)) return;
  if (view.state.selection.empty) selectAll(view.state, view.dispatch);
};
export const richTextHtmlEqual = (a: string, b: string) => {
  const norm = (html: string) => html.replace(/ style=""/g, '').replace(/ style=''/g, '');
  return norm(a) === norm(b);
};
