import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import MessageComponent from '@/components/Message'
import { getFikaPortalTarget } from '@/utils/portal'

export interface MessageOptions {
  type?: 'info' | 'success' | 'warning' | 'error' | 'loading'
  title?: string
  message?: string
  duration?: number
  closable?: boolean
  ctx?: unknown
  onClose?: () => void
}

export type MessageTypeOptions = Omit<MessageOptions, 'type' | 'message'>

export interface MessageIntance {
  id: string
  close: () => void
}

export type MessageFn = (message: string, options?: MessageTypeOptions) => MessageIntance

export interface Message {
  (options: MessageOptions): MessageIntance
  info: MessageFn
  success: MessageFn
  error: MessageFn
  warning: MessageFn
  loading: MessageFn
  closeAll: () => void
  _context?: unknown
}

const instances: MessageIntance[] = []
const roots = new Map<string, Root>()
let wrap: HTMLDivElement | null = null
let seed = 0
const defaultOptions: MessageOptions = {
  duration: 3000,
}

const message: Message = (options: MessageOptions) => {
  const id = 'message-' + seed++
  const props = {
    ...defaultOptions,
    ...options,
    id,
  }
  if (!wrap) {
    const portalTarget = getFikaPortalTarget()
    wrap = document.createElement('div')
    wrap.className = 'message-wrap'
    portalTarget.appendChild(wrap)
  }
  const div = document.createElement('div')
  wrap.appendChild(div)
  const root = createRoot(div)
  roots.set(id, root)

  const destroy = () => {
    const idx = instances.findIndex(item => item.id === id)
    if (idx !== -1) instances.splice(idx, 1)
    root.unmount()
    roots.delete(id)
    div.remove()
    if (wrap && wrap.childNodes.length === 0) {
      wrap.remove()
      wrap = null
    }
  }

  root.render(createElement(MessageComponent, {
    ...props,
    message: props.message || '',
    onClose: options.onClose,
    onDestroy: destroy,
  }))

  const instance = {
    id,
    close: () => destroy(),
  }
  instances.push(instance)
  return instance
}

message.success = (msg: string, options?: MessageTypeOptions) => message({
  ...options,
  type: 'success',
  message: msg,
})
message.info = (msg: string, options?: MessageTypeOptions) => message({
  ...options,
  type: 'info',
  message: msg,
})
message.warning = (msg: string, options?: MessageTypeOptions) => message({
  ...options,
  type: 'warning',
  message: msg,
})
message.error = (msg: string, options?: MessageTypeOptions) => message({
  ...options,
  type: 'error',
  message: msg,
})
message.loading = (msg: string, options?: MessageTypeOptions) => message({
  ...options,
  type: 'loading',
  message: msg,
})
message.closeAll = function () {
  for (let i = instances.length - 1; i >= 0; i--) {
    instances[i].close()
  }
}

export default message
