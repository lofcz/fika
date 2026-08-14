import mitt, { type Emitter } from 'mitt';
export const enum EmitterEvents {
  RICH_TEXT_COMMAND = 'RICH_TEXT_COMMAND',
  TABLE_COMMAND = 'TABLE_COMMAND',
  SYNC_RICH_TEXT_ATTRS_TO_STORE = 'SYNC_RICH_TEXT_ATTRS_TO_STORE',
  OPEN_CHART_DATA_EDITOR = 'OPEN_CHART_DATA_EDITOR',
  OPEN_LATEX_EDITOR = 'OPEN_LATEX_EDITOR',
  OPEN_MERMAID_EDITOR = 'OPEN_MERMAID_EDITOR',
  OPEN_CODE_EDITOR = 'OPEN_CODE_EDITOR',
  OPEN_INLINE_MATH_EDITOR = 'OPEN_INLINE_MATH_EDITOR',
  APPLY_INLINE_MATH = 'APPLY_INLINE_MATH',
}
export interface RichTextAction {
  command: string;
  value?: string;
}
export interface RichTextCommand {
  target?: string;
  action: RichTextAction | RichTextAction[];
}
export interface TableCommand {
  targetId: string;
  command: 'insert-row' | 'insert-col' | 'delete-row' | 'delete-col';
  position?: 'before' | 'after';
}

/** Request to open the inline-math (MathLive) editor for a math node in a text element. */
export interface OpenInlineMathPayload {
  elementId: string;
  /** Document position immediately before the math node (for `setNodeMarkup`). */
  pos: number;
  latex: string;
  display: boolean;
}

/** Result of editing an inline-math node, applied back to its text element. */
export interface ApplyInlineMathPayload {
  elementId: string;
  pos: number;
  latex: string;
  html: string;
  display: boolean;
}
type Events = {
  [EmitterEvents.RICH_TEXT_COMMAND]: RichTextCommand;
  [EmitterEvents.TABLE_COMMAND]: TableCommand;
  [EmitterEvents.SYNC_RICH_TEXT_ATTRS_TO_STORE]: void;
  [EmitterEvents.OPEN_CHART_DATA_EDITOR]: void;
  [EmitterEvents.OPEN_LATEX_EDITOR]: void;
  [EmitterEvents.OPEN_MERMAID_EDITOR]: string;
  [EmitterEvents.OPEN_CODE_EDITOR]: string;
  [EmitterEvents.OPEN_INLINE_MATH_EDITOR]: OpenInlineMathPayload;
  [EmitterEvents.APPLY_INLINE_MATH]: ApplyInlineMathPayload;
};
const emitter: Emitter<Events> = mitt<Events>();
export default emitter;
