import { TextSelection, type Transaction } from 'prosemirror-state';
import type { Mark, MarkType, Node as ProsemirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { TextAlign } from '@/types/slides';
import { setTextAlign } from './setTextAlign';
export interface PlaceholderStyleOptions {
  fontSize: string;
  align: string;
  color: string;
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
}
export interface EmptyPlaceholderStylePatch {
  placeholderFontSize?: number;
  placeholderAlign?: TextAlign;
  placeholderBold: boolean;
  placeholderItalic: boolean;
  defaultColor?: string;
  defaultFontName?: string;
  colorCleared: boolean;
}
export const isEmptyEditorDoc = (view: EditorView) => view.state.doc.textContent.trim().length === 0;
export const currentStoredMarks = (view: EditorView): readonly Mark[] => view.state.storedMarks ?? view.state.selection.$from.marks();
export const setStoredMark = (view: EditorView, mark: Mark) => {
  const next = [...currentStoredMarks(view).filter(item => item.type !== mark.type), mark];
  view.dispatch(view.state.tr.setStoredMarks(next));
};
export const clearStoredMark = (view: EditorView, type: MarkType) => {
  view.dispatch(view.state.tr.setStoredMarks(currentStoredMarks(view).filter(item => item.type !== type)));
};
export const readEmptyPlaceholderPatch = (view: EditorView): EmptyPlaceholderStylePatch => {
  const {
    schema
  } = view.state;
  const stored = currentStoredMarks(view);
  const fontsize = stored.find(mark => mark.type === schema.marks.fontsize)?.attrs.fontsize as string | undefined;
  const color = stored.find(mark => mark.type === schema.marks.forecolor)?.attrs.color as string | undefined;
  const fontName = stored.find(mark => mark.type === schema.marks.fontname)?.attrs.fontname as string | undefined;
  let align: TextAlign | undefined;
  view.state.doc.descendants(node => {
    if (align || !node.isTextblock) return;
    if (node.attrs.align) align = node.attrs.align as TextAlign;
  });
  return {
    placeholderFontSize: fontsize ? parseInt(fontsize, 10) : undefined,
    placeholderAlign: align,
    placeholderBold: stored.some(mark => mark.type === schema.marks.strong),
    placeholderItalic: stored.some(mark => mark.type === schema.marks.em),
    defaultColor: color,
    defaultFontName: fontName,
    colorCleared: !color
  };
};
const storedMarksFor = (
  schema: EditorView['state']['schema'],
  options: PlaceholderStyleOptions,
  phase: 'empty' | 'filled',
) => {
  const {
    fontsize,
    forecolor,
    fontname,
    strong,
    em
  } = schema.marks;
  const colorAndFont = [forecolor.create({
    color: options.color
  }), ...(options.fontName ? [fontname.create({
    fontname: options.fontName
  })] : [])];
  if (phase === 'empty') return colorAndFont;
  return [fontsize.create({
    fontsize: options.fontSize
  }), ...colorAndFont, ...(options.bold ? [strong.create()] : []), ...(options.italic ? [em.create()] : [])];
};
const alignAllTextblocks = (tr: Transaction, align: string) => {
  const updates: {
    pos: number;
    attrs: Record<string, unknown>;
  }[] = [];
  tr.doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if ((node.attrs.align || '') === align) return;
    updates.push({
      pos,
      attrs: {
        ...node.attrs,
        align
      }
    });
  });
  for (const {
    pos,
    attrs
  } of updates) {
    tr = tr.setNodeMarkup(pos, undefined, attrs);
  }
  return tr;
};
const marksCover = (have: readonly Mark[], want: readonly Mark[]) => (
  want.every(needed => have.some(mark => mark.eq(needed)))
);
const textAlreadyPainted = (doc: ProsemirrorNode, marks: readonly Mark[]) => {
  let ok = true;
  let sawText = false;
  doc.nodesBetween(0, doc.content.size, node => {
    if (!ok || !node.isText) return ok;
    sawText = true;
    if (!marksCover(node.marks, marks)) ok = false;
    return ok;
  });
  return sawText && ok;
};

const marksEq = (a: readonly Mark[], b: readonly Mark[]) => (
  a.length === b.length && a.every((mark, index) => mark.eq(b[index]))
);
const allTextblocksAligned = (doc: ProsemirrorNode, align: string) => {
  let ok = true;
  doc.descendants(node => {
    if (!ok || !node.isTextblock) return ok;
    if ((node.attrs.align || '') !== align) ok = false;
    return ok;
  });
  return ok;
};

export const paintFilledPlaceholderTr = (
  tr: Transaction,
  schema: EditorView['state']['schema'],
  options: PlaceholderStyleOptions,
) => {
  const storedMarks = storedMarksFor(schema, options, 'filled');
  const { fontsize, forecolor, fontname, strong, em } = schema.marks;
  tr.doc.nodesBetween(0, tr.doc.content.size, (node, pos) => {
    if (!node.isText) return;
    const from = pos;
    const to = pos + node.nodeSize;
    tr = tr.removeMark(from, to, fontsize);
    tr = tr.addMark(from, to, fontsize.create({ fontsize: options.fontSize }));
    tr = tr.addMark(from, to, forecolor.create({ color: options.color }));
    if (options.fontName) tr = tr.addMark(from, to, fontname.create({ fontname: options.fontName }));
    if (options.bold) tr = tr.addMark(from, to, strong.create());
    if (options.italic) tr = tr.addMark(from, to, em.create());
  });
  return tr.setStoredMarks(storedMarks);
};

/** Apply placeholder typography without leaving a range selection on empty docs. */
export const applyPlaceholderStyles = (view: EditorView, options: PlaceholderStyleOptions) => {
  const {
    state
  } = view;
  const {
    doc,
    schema,
    selection
  } = state;
  const phase = doc.textContent.trim().length === 0 ? 'empty' : 'filled';
  const storedMarks = storedMarksFor(schema, options, phase);
  const {
    fontsize,
    forecolor,
    fontname,
    strong,
    em
  } = schema.marks;
  if (phase === 'empty') {
    if (allTextblocksAligned(doc, options.align) && marksEq(currentStoredMarks(view), storedMarks)) return;
    let tr = alignAllTextblocks(state.tr, options.align);
    tr = tr.setStoredMarks(storedMarks);
    view.dispatch(tr);
    return;
  }
  if (allTextblocksAligned(doc, options.align) && textAlreadyPainted(doc, storedMarks)) return;
  const cursorPos = selection.from;
  let tr = state.tr;
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (!node.isText) return;
    const from = pos;
    const to = pos + node.nodeSize;
    tr = tr.removeMark(from, to, fontsize);
    tr = tr.addMark(from, to, fontsize.create({
      fontsize: options.fontSize
    }));
    tr = tr.addMark(from, to, forecolor.create({
      color: options.color
    }));
    if (options.fontName) {
      tr = tr.addMark(from, to, fontname.create({
        fontname: options.fontName
      }));
    }
    if (options.bold) {
      tr = tr.addMark(from, to, strong.create());
    }
    if (options.italic) {
      tr = tr.addMark(from, to, em.create());
    }
  });
  tr = setTextAlign(tr.setSelection(TextSelection.create(doc, 0, doc.content.size)), schema, options.align);
  const mappedPos = tr.mapping.map(cursorPos, -1);
  tr = tr.setSelection(TextSelection.create(tr.doc, mappedPos));
  tr = tr.setStoredMarks(storedMarks);
  view.dispatch(tr);
};
