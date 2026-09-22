// Assert subscription isolation; frame timings remain diagnostic, never hardware-sensitive gates.
process.env.FIKA_PERF_ASSERT = '1'
await import('./bench-myna-interactions.mjs')
