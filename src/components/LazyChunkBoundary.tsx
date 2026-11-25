import { Component, lazy, type ComponentType, type ErrorInfo, type LazyExoticComponent, type ReactNode } from 'react'

export interface RetryableLazy<P extends object> {
  Component: ComponentType<P>
  reset: () => void
}

/**
 * Wrap `React.lazy` so a transient chunk-load failure (e.g. stale deploy 404 or
 * offline blip) can be retried instead of being permanently cached as a
 * rejected promise.
 */
export function createRetryableLazy<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
): RetryableLazy<P> {
  let cached: LazyExoticComponent<ComponentType<P>> | null = null
  const getLazy = (): LazyExoticComponent<ComponentType<P>> => {
    if (!cached) cached = lazy(loader)
    return cached
  }
  const Wrapped = (props: P) => {
    const Target = getLazy()
    return <Target {...props} />
  }
  return {
    Component: Wrapped,
    reset() {
      cached = null
    },
  }
}

interface LazyChunkBoundaryProps {
  children: ReactNode
  /** Invoked before remounting children on retry (pass `retryable.reset`). */
  onRetry?: () => void
  /** Custom fallback when the chunk fails; pass `null` to fail silently (e.g. dialogs). */
  fallback?: ReactNode | ((retry: () => void) => ReactNode)
  /** Changing this key clears an error state automatically (e.g. reopening a dialog or switching slides). */
  resetKey?: string | number | boolean | null
  /** Optional callback notified when a chunk fails to load or render. */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface LazyChunkBoundaryState {
  hasError: boolean
  attempt: number
  prevResetKey: LazyChunkBoundaryProps['resetKey']
}

export class LazyChunkBoundary extends Component<LazyChunkBoundaryProps, LazyChunkBoundaryState> {
  state: LazyChunkBoundaryState = {
    hasError: false,
    attempt: 0,
    prevResetKey: this.props.resetKey,
  }

  static getDerivedStateFromError(): Partial<LazyChunkBoundaryState> {
    return { hasError: true }
  }

  static getDerivedStateFromProps(
    props: LazyChunkBoundaryProps,
    state: LazyChunkBoundaryState,
  ): Partial<LazyChunkBoundaryState> | null {
    if (props.resetKey !== state.prevResetKey) {
      if (state.hasError) {
        props.onRetry?.()
        return { hasError: false, attempt: state.attempt + 1, prevResetKey: props.resetKey }
      }
      return { prevResetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[fika] lazy chunk boundary caught error', error, info)
    this.props.onError?.(error, info)
  }

  handleRetry = () => {
    this.props.onRetry?.()
    this.setState(prev => ({ hasError: false, attempt: prev.attempt + 1 }))
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props
      if (typeof fallback === 'function') return fallback(this.handleRetry)
      if (fallback !== undefined) return fallback
      return (
        <div
          className="fika-lazy-chunk-fallback"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            minHeight: 24,
            background: 'rgba(148, 163, 184, 0.12)',
            borderRadius: 6,
          }}
        >
          <button
            type="button"
            onClick={this.handleRetry}
            aria-label="Retry"
            style={{
              border: '1px solid rgba(148, 163, 184, 0.45)',
              background: '#fff',
              color: '#334155',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ↻
          </button>
        </div>
      )
    }
    if (this.state.attempt === 0) return this.props.children
    return <span key={this.state.attempt} style={{ display: 'contents' }}>{this.props.children}</span>
  }
}
