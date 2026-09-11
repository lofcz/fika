import { bindStyles } from '@/utils/cssm'
import styles from './AiRevealBadge.module.scss'
const cx = bindStyles(styles)
import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

import { useMainStore, useSlidesStore } from '@/store'
import { Icon } from '@/components/Icon'
import { getElementRange } from '@/utils/element'

const GAP_PX = 6
const BADGE_H = 22

function lastVisibleTextNode(root: Element): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    if (!text.data.trim()) continue
    const parent = text.parentElement
    if (!parent || !parent.getClientRects().length) continue
    last = text
  }
  return last
}

/**
 * Small "AI is writing" pill that trails the caret of the element currently
 * being revealed by `controller.revealSlide`, or sits at the top-right of an
 * element without text.
 */
const AiRevealBadge = memo(({ canvasRef }: { canvasRef: { current: HTMLElement | null } }) => {
  const reveal = useMainStore(s => s.aiReveal)
  const canvasScale = useMainStore(s => s.canvasScale)
  const currentSlideId = useSlidesStore(s => s.slides[s.slideIndex]?.id)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const visible = !!reveal && reveal.label.length > 0 && reveal.slideId === currentSlideId
  const elementId = visible ? reveal.elementId : null
  const tick = reveal?.tick ?? 0

  useLayoutEffect(() => {
    if (!visible) {
      setPos(null)
      return
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(measure)
    })
    const measure = () => {
      const host = hostRef.current
      const canvas = canvasRef.current
      if (!host || !canvas) return
      const base = host.getBoundingClientRect()
      if (!elementId) {
        setPos(null)
        return
      }
      const dom = canvas.querySelector(`#editable-element-${CSS.escape(elementId)}`)
      const textNode = dom ? lastVisibleTextNode(dom) : null
      if (textNode) {
        const range = document.createRange()
        range.setStart(textNode, textNode.data.length)
        range.setEnd(textNode, textNode.data.length)
        const rects = range.getClientRects()
        const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect()
        if (rect.width || rect.height) {
          const left = rect.right - base.left + GAP_PX
          const top = rect.top - base.top + rect.height / 2 - BADGE_H / 2
          setPos({ left: Math.max(0, left), top: Math.max(0, top) })
          return
        }
      }
      const slide = useSlidesStore.getState().slides.find(s => s.id === reveal?.slideId)
      const element = slide?.elements.find(el => el.id === elementId)
      if (!element) {
        setPos(null)
        return
      }
      const r = getElementRange(element)
      setPos({ left: Math.max(0, r.maxX * canvasScale - 8), top: Math.max(0, r.minY * canvasScale - BADGE_H / 2) })
    }
    return () => cancelAnimationFrame(frame)
  }, [visible, elementId, tick, canvasScale, canvasRef, reveal?.slideId])

  if (!visible) return null
  const style: CSSProperties | undefined = pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : undefined
  return (
    <div ref={hostRef} className={cx('ai-reveal-host')}>
      {pos ? (
        <div className={cx('ai-reveal-badge')} style={style}>
          <Icon icon="sparkles" className={cx('icon')} />
          <span className={cx('label')}>{reveal!.label}</span>
        </div>
      ) : null}
    </div>
  )
})

export default AiRevealBadge
