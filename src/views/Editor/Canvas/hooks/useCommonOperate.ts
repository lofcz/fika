import { OperateResizeHandlers, OperateBorderLines } from '@/types/edit'

const BOX_RESIZE_HANDLERS = [
  { direction: OperateResizeHandlers.LEFT_TOP },
  { direction: OperateResizeHandlers.TOP },
  { direction: OperateResizeHandlers.RIGHT_TOP },
  { direction: OperateResizeHandlers.LEFT },
  { direction: OperateResizeHandlers.RIGHT },
  { direction: OperateResizeHandlers.LEFT_BOTTOM },
  { direction: OperateResizeHandlers.BOTTOM },
  { direction: OperateResizeHandlers.RIGHT_BOTTOM },
] as const

const TEXT_RESIZE_HANDLERS = [
  { direction: OperateResizeHandlers.LEFT },
  { direction: OperateResizeHandlers.RIGHT },
] as const

const VERTICAL_TEXT_RESIZE_HANDLERS = [
  { direction: OperateResizeHandlers.TOP },
  { direction: OperateResizeHandlers.BOTTOM },
] as const

const BORDER_LINES = [
  { type: OperateBorderLines.T },
  { type: OperateBorderLines.B },
  { type: OperateBorderLines.L },
  { type: OperateBorderLines.R },
] as const

/**
 * Handle/border lists only. Positions live in CSS against the operate wrapper
 * so applyLiveSize can resize the box without a React re-render.
 */
export default () => ({
  resizeHandlers: BOX_RESIZE_HANDLERS,
  textElementResizeHandlers: TEXT_RESIZE_HANDLERS,
  verticalTextElementResizeHandlers: VERTICAL_TEXT_RESIZE_HANDLERS,
  borderLines: BORDER_LINES,
})
