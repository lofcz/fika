/**
 * Copy `obj` without `keys`. Spread-then-delete so Immer drafts are not mutated in place.
 */
export function omit<T extends object>(obj: T, keys: string | string[]): T {
  const drop = new Set(typeof keys === 'string' ? [keys] : keys)
  const next = { ...obj }
  for (const key of drop) delete next[key as keyof T]
  return next
}

const isObjectLike = (value: unknown): value is object => value !== null && typeof value === 'object'

/**
 * Deep equality for JSON-like values (slides, plain objects, arrays).
 * Key order does not matter; array order does. Cycles are compared by pairing.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!isObjectLike(a) || !isObjectLike(b)) return false
  return deepEqual(a, b, new WeakMap())
}

function equal(a: unknown, b: unknown, seen: WeakMap<object, object>): boolean {
  if (Object.is(a, b)) return true
  if (!isObjectLike(a) || !isObjectLike(b)) return false
  return deepEqual(a, b, seen)
}

function deepEqual(a: object, b: object, seen: WeakMap<object, object>): boolean {
  const pairedA = seen.get(a)
  if (pairedA !== undefined) return pairedA === b
  const pairedB = seen.get(b)
  if (pairedB !== undefined) return pairedB === a
  seen.set(a, b)
  seen.set(b, a)

  const aIsArray = Array.isArray(a)
  if (aIsArray !== Array.isArray(b)) return false
  if (aIsArray) {
    const listA = a as unknown[]
    const listB = b as unknown[]
    const len = listA.length
    if (len !== listB.length) return false
    for (let i = 0; i < len; i++) {
      if (!equal(listA[i], listB[i], seen)) return false
    }
    return true
  }

  const recA = a as Record<string, unknown>
  const recB = b as Record<string, unknown>
  const keys = Object.keys(recA)
  const keyCount = keys.length
  if (keyCount !== Object.keys(recB).length) return false
  for (let i = 0; i < keyCount; i++) {
    const key = keys[i]
    if (!Object.hasOwn(recB, key)) return false
    if (!equal(recA[key], recB[key], seen)) return false
  }
  return true
}

export function arraysEqual<T>(a: readonly T[] | null | undefined, b: readonly T[] | null | undefined): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  const len = a.length
  if (len !== b.length) return false
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
