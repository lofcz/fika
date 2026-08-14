/** Join class names from strings, arrays, and conditional maps. */
export function cls(
  ...args: Array<string | number | false | null | undefined | Record<string, unknown> | Array<unknown>>
): string {
  const parts: string[] = []
  const push = (value: unknown) => {
    if (!value && value !== 0) return
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value))
    }
    else if (Array.isArray(value)) {
      value.forEach(push)
    }
    else if (typeof value === 'object') {
      for (const [key, on] of Object.entries(value as Record<string, unknown>)) {
        if (on) parts.push(key)
      }
    }
  }
  args.forEach(push)
  return parts.filter(Boolean).join(' ')
}

export default cls
