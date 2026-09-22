import type { FikaAgentCommand, FikaCanvasOperation } from './types'

/** Expand concise canvas operations into the existing validated native handlers. */
export function canvasOperationCommand(operation: FikaCanvasOperation): FikaAgentCommand {
  const op = operation
  if (!op || typeof op !== 'object') throw new Error('Canvas operation must be an object')
  if ('x' in op && op.x !== undefined && !Number.isFinite(op.x)) throw new Error('x must be finite')
  if ('y' in op && op.y !== undefined && !Number.isFinite(op.y)) throw new Error('y must be finite')
  if ('width' in op && (!Number.isFinite(op.width) || op.width <= 0)) throw new Error('width must be positive')
  if ('height' in op && (!Number.isFinite(op.height) || op.height <= 0)) throw new Error('height must be positive')
  switch (op.op) {
    case 'title': return { type: 'deck.setTitle', payload: { title: op.title } }
    case 'viewport': return { type: 'deck.setViewport', payload: { size: op.width, ratio: op.height / op.width } }
    case 'page': return { type: 'slides.create', payload: { slide: { ...(op.id ? { id: op.id } : {}), canvasName: op.name, canvasPosition: { x: op.x || 0, y: op.y || 0 }, elements: [], background: { type: 'solid', color: op.background || '#ffffff' } }, select: true } }
    case 'pageUpdate': return { type: 'slides.update', payload: { slideId: op.id, patch: op.patch } }
    case 'text': return { type: 'text.create', payload: { slideId: op.pageId, markdown: op.text, style: { fontSize: op.fontSize || 32, fontName: op.fontName, color: op.color || '#202024', bold: op.bold, align: op.align }, element: { ...(op.id ? { id: op.id } : {}), left: op.x, top: op.y, width: op.width, height: op.height, fixedHeight: true }, select: false } }
    case 'textUpdate': return { type: 'text.setMarkdown', payload: { slideId: op.pageId, elementId: op.id, markdown: op.text, style: op.style } }
    case 'shape': return { type: 'shapes.create', payload: { slideId: op.pageId, ...(op.id ? { id: op.id } : {}), left: op.x, top: op.y, width: op.width, height: op.height, viewBox: [200, 200], path: op.shape === 'ellipse' ? 'M 100 0 A 100 100 0 1 1 100 200 A 100 100 0 1 1 100 0 Z' : 'M 0 0 L 200 0 L 200 200 L 0 200 Z', fill: op.fill || '#202024', select: false } }
    case 'element': return { type: 'elements.create', payload: { slideId: op.pageId, element: op.element, select: false } }
    case 'update': return { type: 'elements.update', payload: { slideId: op.pageId, elementId: op.id, patch: op.patch } }
    case 'remove': return { type: 'elements.delete', payload: { slideId: op.pageId, elementId: op.id } }
    default: throw new Error('Unknown canvas operation')
  }
}
