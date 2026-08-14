export type DebounceOptions = {
  leading?: boolean
  trailing?: boolean
}

type DebounceConfig = DebounceOptions & {
  maxWait?: number
}

export type Debounced<T extends (...args: never[]) => void> = ((...args: Parameters<T>) => void) & {
  cancel: () => void
  flush: () => void
}

/**
 * Lodash-compatible debounce: trailing by default, optional leading, cancel, flush.
 * `maxWait` is what makes throttle a real throttle (invoke at least every wait in a burst).
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  wait: number,
  options: DebounceConfig = {},
): Debounced<T> {
  const delay = wait > 0 ? wait : 0
  const leading = !!options.leading
  const trailing = options.trailing !== false
  const maxing = options.maxWait !== undefined
  const maxWait = maxing ? Math.max(options.maxWait! > 0 ? options.maxWait! : 0, delay) : 0

  let timerId: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Parameters<T> | undefined
  let lastThis: unknown
  let lastCallTime: number | undefined
  let lastInvokeTime = 0

  const invokeFunc = (time: number) => {
    const args = lastArgs
    const ctx = lastThis
    lastArgs = undefined
    lastThis = undefined
    lastInvokeTime = time
    if (args) (fn as (this: unknown, ...a: Parameters<T>) => void).apply(ctx, args)
  }

  const leadingEdge = (time: number) => {
    lastInvokeTime = time
    timerId = setTimeout(timerExpired, delay)
    if (leading) invokeFunc(time)
  }

  const remainingWait = (time: number) => {
    const timeWaiting = delay - (time - (lastCallTime as number))
    if (!maxing) return timeWaiting
    return Math.min(timeWaiting, maxWait - (time - lastInvokeTime))
  }

  const shouldInvoke = (time: number) => {
    if (lastCallTime === undefined) return true
    const timeSinceLastCall = time - lastCallTime
    return (
      timeSinceLastCall >= delay
      || timeSinceLastCall < 0
      || (maxing && time - lastInvokeTime >= maxWait)
    )
  }

  const trailingEdge = (time: number) => {
    timerId = undefined
    if (trailing && lastArgs) {
      invokeFunc(time)
      return
    }
    lastArgs = undefined
    lastThis = undefined
  }

  const timerExpired = () => {
    const time = Date.now()
    if (shouldInvoke(time)) {
      trailingEdge(time)
      return
    }
    timerId = setTimeout(timerExpired, remainingWait(time))
  }

  function debounced(this: unknown, ...args: Parameters<T>) {
    const time = Date.now()
    const isInvoking = shouldInvoke(time)
    lastArgs = args
    lastThis = this
    lastCallTime = time

    if (isInvoking) {
      if (timerId === undefined) {
        leadingEdge(lastCallTime)
        return
      }
      if (maxing) {
        clearTimeout(timerId)
        timerId = setTimeout(timerExpired, delay)
        invokeFunc(time)
      }
      return
    }
    if (timerId === undefined) timerId = setTimeout(timerExpired, delay)
  }

  const wrapped = debounced as Debounced<T>
  wrapped.cancel = () => {
    if (timerId !== undefined) clearTimeout(timerId)
    lastInvokeTime = 0
    lastArgs = undefined
    lastThis = undefined
    lastCallTime = undefined
    timerId = undefined
  }
  wrapped.flush = () => {
    if (timerId !== undefined) trailingEdge(Date.now())
  }
  return wrapped
}

/** Throttle is debounce with maxWait = wait. Defaults: leading and trailing both on. */
export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  wait: number,
  options: DebounceOptions = {},
): Debounced<T> {
  return debounce(fn, wait, {
    leading: options.leading !== false,
    trailing: options.trailing !== false,
    maxWait: wait,
  })
}
