const INK_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
export const INK_MOTION_MS = 420

export function playFlip(el: HTMLElement, first: DOMRectReadOnly) {
  const last = el.getBoundingClientRect()
  const sx = last.width ? first.width / last.width : 1
  const sy = last.height ? first.height / last.height : 1
  const dx = first.left - last.left
  const dy = first.top - last.top
  if (
    Math.abs(dx) < 0.5
    && Math.abs(dy) < 0.5
    && Math.abs(sx - 1) < 0.002
    && Math.abs(sy - 1) < 0.002
  ) return

  el.style.transformOrigin = '0 0'
  el.style.transition = 'none'
  el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`
  void el.offsetWidth

  const clear = () => {
    el.style.transition = ''
    el.style.transform = ''
    el.style.transformOrigin = ''
    el.removeEventListener('transitionend', onEnd)
  }
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== el || event.propertyName !== 'transform') return
    clear()
  }
  el.addEventListener('transitionend', onEnd)
  requestAnimationFrame(() => {
    el.style.transition = `transform ${INK_MOTION_MS}ms ${INK_EASE}`
    el.style.transform = 'translate3d(0, 0, 0) scale(1)'
  })
  window.setTimeout(clear, INK_MOTION_MS + 80)
}
