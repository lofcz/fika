import type { hfmath as HfmathClass } from '@/components/LaTeXEditor/hfmath'

type HfmathCtor = typeof HfmathClass

let cachedHfmath: HfmathCtor | null = null
let hfmathPromise: Promise<HfmathCtor> | null = null

/** Lazily load the legacy `hfmath` SVG-path engine (~180 KB) only when needed. */
export async function ensureHfmath(): Promise<HfmathCtor> {
  if (cachedHfmath) return cachedHfmath
  if (!hfmathPromise) {
    hfmathPromise = import('@/components/LaTeXEditor/hfmath').then(mod => {
      cachedHfmath = mod.hfmath
      return mod.hfmath
    }).catch(error => {
      hfmathPromise = null
      throw error
    })
  }
  return hfmathPromise
}

export function getCachedHfmath(): HfmathCtor | null {
  return cachedHfmath
}
