import type { EditorState } from 'prosemirror-state'
import type { TableTextAttrs } from './table'

export interface TableEditorSession {
  state: EditorState
  value: string
}

export interface TableEditorHandle {
  cellId: string
  getAttrs: () => TableTextAttrs
  applyAttrs: (attrs: TableTextAttrs) => { text: string; wholeCell: boolean } | null
  atBoundary: (boundary: 'start' | 'end') => boolean
}

const editors = new Map<string, TableEditorHandle>()
export const getTableEditor = (elementId: string) => editors.get(elementId)
export function registerTableEditor(elementId: string, editor: TableEditorHandle) {
  editors.set(elementId, editor)
  return () => { if (editors.get(elementId) === editor) editors.delete(elementId) }
}
