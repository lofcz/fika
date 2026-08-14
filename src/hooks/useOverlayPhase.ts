import { useCallback, useState } from 'react'

export type OverlayPhase = 'closed' | 'enter' | 'open' | 'leave'

/**
 * First painted frame of an open already has the enter class, and the first
 * painted frame of a close already has the leave class. Setting those in
 * `useEffect` paints one frame at the wrong opacity / display and looks like
 * a violent blink.
 */
export function useOverlayPhase(visible: boolean) {
  const [phase, setPhase] = useState<OverlayPhase>('closed')

  if (visible && (phase === 'closed' || phase === 'leave')) {
    setPhase('enter')
  }
  else if (!visible && (phase === 'enter' || phase === 'open')) {
    setPhase('leave')
  }

  const onAnimationEnd = useCallback((event: React.AnimationEvent) => {
    if (event.target !== event.currentTarget) return
    setPhase(current => {
      if (current === 'enter') return 'open'
      if (current === 'leave') return 'closed'
      return current
    })
  }, [])

  return {
    phase,
    onAnimationEnd,
    shown: phase !== 'closed',
    entering: phase === 'enter',
    leaving: phase === 'leave',
  }
}
