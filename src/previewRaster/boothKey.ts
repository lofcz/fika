export const boothCacheKey = (html: string, width: number, height: number, captureScale: number) => {
  const input = `${captureScale}|${width}x${height}|${html}`
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
