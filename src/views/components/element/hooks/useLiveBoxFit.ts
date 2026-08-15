import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { fitUniformScale, liveBoxOf, readLiveBoxSize, type LiveBoxSize } from '@/utils/liveElementSize'

/**
 * Fit a naturally-sized stage into the live `[data-live-box]`.
 *
 * `applyLiveSize` writes the box; this hook only re-measures the stage when
 * `contentKey` changes, then writes `transform: scale()` from live box / natural
 * size. No React state on the resize path.
 */
export default function useLiveBoxFit(
  stageRef: RefObject<HTMLElement | null>,
  authored: LiveBoxSize & { contentKey?: string },
) {
  const naturalRef = useRef<LiveBoxSize>({ width: 0, height: 0 })
  const authoredRef = useRef(authored)
  authoredRef.current = authored
  const rafRef = useRef(0)
  const lastKeyRef = useRef<string | undefined>(undefined)

  const apply = () => {
    const stage = stageRef.current
    if (!stage) return
    const box = liveBoxOf(stage)
    const live = readLiveBoxSize(box, authoredRef.current)
    if (lastKeyRef.current !== authoredRef.current.contentKey || !(naturalRef.current.width > 0)) {
      const prev = stage.style.transform
      stage.style.transform = 'none'
      const width = stage.offsetWidth
      const height = stage.offsetHeight
      stage.style.transform = prev
      if (width > 0 && height > 0) naturalRef.current = { width, height }
      lastKeyRef.current = authoredRef.current.contentKey
    }
    const scale = fitUniformScale(naturalRef.current, live)
    const next = `scale(${scale})`
    if (stage.style.transform !== next) stage.style.transform = next
  }

  const schedule = () => {
    if (typeof requestAnimationFrame === 'undefined') {
      apply()
      return
    }
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      apply()
    })
  }

  useLayoutEffect(() => {
    naturalRef.current = { width: 0, height: 0 }
    schedule()
  }, [authored.contentKey, authored.width, authored.height])

  useEffect(() => {
    const stage = stageRef.current
    const box = liveBoxOf(stage)
    if (!box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => schedule())
    observer.observe(box)
    return () => {
      observer.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [authored.contentKey])
}
