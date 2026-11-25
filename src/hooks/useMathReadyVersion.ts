import { useSyncExternalStore } from 'react'
import { getMathReadyVersion, subscribeMathReady } from '@/utils/math'

const noopSubscribe = () => () => {}

/**
 * Subscribe to the monotonic MathLive readiness revision. Passing `enabled = false`
 * avoids re-rendering elements that contain no math when MathLive finishes loading.
 */
export function useMathReadyVersion(enabled = true): number {
  return useSyncExternalStore(
    enabled ? subscribeMathReady : noopSubscribe,
    enabled ? getMathReadyVersion : () => 0,
    () => 0,
  )
}
