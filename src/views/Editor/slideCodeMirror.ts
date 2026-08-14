/**
 * CodeMirror bootstrap for SlideCodePanel.
 * Loaded via dynamic import so codemirror stays out of the initial embed graph.
 */
import { basicSetup, EditorView } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { EditorState, StateEffect, StateField, Transaction, type Extension } from '@codemirror/state';
import { Decoration, keymap, type DecorationSet } from '@codemirror/view';
import { foldable, foldedRanges, indentUnit, unfoldEffect } from '@codemirror/language';
import { indentWithTab } from '@codemirror/commands';
export type ElementHighlightRange = {
  from: number;
  to: number;
};
export { basicSetup, EditorView, json, EditorState, StateEffect, StateField, Transaction, Decoration, keymap, foldable, foldedRanges, indentUnit, unfoldEffect, indentWithTab };
export type { DecorationSet };
export const createElementHighlightField = (setElementHighlightEffect: ReturnType<typeof StateEffect.define<ElementHighlightRange | null>>): Extension => StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(highlights, transaction) {
    if (transaction.docChanged) highlights = Decoration.none;else highlights = highlights.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setElementHighlightEffect)) continue;
      const value = effect.value;
      highlights = value ? Decoration.set([Decoration.mark({
        class: 'cm-element-highlight'
      }).range(value.from, value.to)]) : Decoration.none;
    }
    return highlights;
  },
  provide: field => EditorView.decorations.from(field)
});
