/** Map local class names through a CSS module; leave unknown tokens (parent hashes) intact.
 *  Local names emit both the hashed module class and the original token so
 *  `:global(.name)` pierce selectors still match. */
export function bindStyles(styles: Record<string, string>) {
  const hashedValues = new Set(Object.values(styles))
  const lookup = (name: string) => {
    if (hashedValues.has(name)) return name
    const hashed = styles[name]
    if (hashed && hashed !== name) return `${hashed} ${name}`
    return hashed || name
  }
  return (...args: Array<string | number | false | null | undefined | Record<string, unknown> | Array<unknown>>): string => {
    const parts: string[] = []
    const push = (value: unknown) => {
      if (!value && value !== 0) return
      if (typeof value === 'string' || typeof value === 'number') {
        String(value).split(/\s+/).filter(Boolean).forEach(name => parts.push(lookup(name)))
      }
      else if (Array.isArray(value)) {
        value.forEach(push)
      }
      else if (typeof value === 'object') {
        for (const [key, on] of Object.entries(value as Record<string, unknown>)) {
          if (on) key.split(/\s+/).forEach(name => parts.push(lookup(name)))
        }
      }
    }
    args.forEach(push)
    return parts.filter(Boolean).join(' ')
  }
}
