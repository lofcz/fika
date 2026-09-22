/** Opt-in development counters used by the interaction benchmark; no production instrumentation. */
export function recordRender(name: string) {
  if (import.meta.env.MODE !== 'development') return
  const metrics = (globalThis as typeof globalThis & { __FIKA_RENDER_METRICS__?: Record<string, number> }).__FIKA_RENDER_METRICS__
  if (metrics) metrics[name] = (metrics[name] || 0) + 1
}
