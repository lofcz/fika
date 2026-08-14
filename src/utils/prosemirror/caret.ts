import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
export type ClientCoords = {
  left: number;
  top: number;
};
const views = new Map<string, EditorView>();
export function registerEditorView(elementId: string, view: EditorView) {
  views.set(elementId, view);
}
export function unregisterEditorView(elementId: string, view?: EditorView) {
  if (view && views.get(elementId) !== view) return;
  views.delete(elementId);
}
export function getEditorView(elementId: string): EditorView | undefined {
  return views.get(elementId);
}
let pendingCaret: {
  elementId: string;
  coords: ClientCoords;
} | null = null;
export function setPendingCaret(elementId: string, coords: ClientCoords) {
  pendingCaret = {
    elementId,
    coords
  };
}
export function clearPendingCaret() {
  pendingCaret = null;
}
export function clampPointToRect(coords: ClientCoords, rect: DOMRect): ClientCoords {
  const leftMax = Math.max(rect.left + 1, rect.right - 1);
  const topMax = Math.max(rect.top + 1, rect.bottom - 1);
  return {
    left: Math.min(Math.max(coords.left, rect.left + 1), leftMax),
    top: Math.min(Math.max(coords.top, rect.top + 1), topMax)
  };
}
export function caretDomAtPoint(left: number, top: number, doc?: Document): {
  node: Node;
  offset: number;
} | null {
  const caretDoc = (doc ?? (typeof document !== 'undefined' ? document : undefined)) as (Document & {
    caretPositionFromPoint?: (x: number, y: number) => {
      offsetNode: Node;
      offset: number;
    } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  }) | undefined;
  if (!caretDoc) return null;
  if (typeof caretDoc.caretPositionFromPoint === 'function') {
    const pos = caretDoc.caretPositionFromPoint(left, top);
    if (pos?.offsetNode) return {
      node: pos.offsetNode,
      offset: pos.offset
    };
  }
  if (typeof caretDoc.caretRangeFromPoint === 'function') {
    const range = caretDoc.caretRangeFromPoint(left, top);
    if (range?.startContainer) return {
      node: range.startContainer,
      offset: range.startOffset
    };
  }
  return null;
}
function docPosAtCoords(view: EditorView, coords: ClientCoords): number | null {
  const hit = view.posAtCoords(coords);
  if (hit) return hit.pos;
  const clamped = clampPointToRect(coords, view.dom.getBoundingClientRect());
  const clampedHit = view.posAtCoords(clamped);
  if (clampedHit) return clampedHit.pos;
  const caret = caretDomAtPoint(coords.left, coords.top) ?? caretDomAtPoint(clamped.left, clamped.top);
  if (!caret || !view.dom.contains(caret.node)) return null;
  try {
    return view.posAtDOM(caret.node, caret.offset);
  } catch {
    return null;
  }
}

/**
 * Place the ProseMirror caret at a viewport (client) point.
 * Uses posAtCoords so marks, wrapping, lists, and atomic nodes (math) map correctly.
 */
export function placeCaretAtClientPoint(view: EditorView, coords: ClientCoords): boolean {
  const pos = docPosAtCoords(view, coords);
  if (pos == null) return false;
  const max = view.state.doc.content.size;
  const $pos = view.state.doc.resolve(Math.max(0, Math.min(pos, max)));
  const selection = TextSelection.near($pos);
  if (!selection.eq(view.state.selection)) {
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  }
  view.focus();
  return true;
}
export function consumePendingCaret(elementId: string, view: EditorView): boolean {
  if (!pendingCaret || pendingCaret.elementId !== elementId) return false;
  if (!view.state.selection.empty) {
    pendingCaret = null;
    return false;
  }
  if (typeof getComputedStyle === 'function' && getComputedStyle(view.dom).visibility === 'hidden') {
    return false;
  }
  const ok = placeCaretAtClientPoint(view, pendingCaret.coords);
  if (ok) pendingCaret = null;
  return ok;
}
