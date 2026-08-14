import { useState } from 'react'

/** Stay true after the first time `open` is true, so heavy UI is not remounted on toggle. */
export function useHoldAfterOpen(open: boolean) {
  const [held, setHeld] = useState(false)
  if (open && !held) setHeld(true)
  return held
}
