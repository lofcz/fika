/** Browser image drags supply HTML/URI data, not a File. Never insert active URLs. */
export function imageSourceFromTransfer(transfer: Pick<DataTransfer, 'getData'>): string | null {
  const safe = (value: string | null): string | null => {
    if (!value) return null
    const src = value.trim()
    return /^(https?:\/\/|blob:|data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml)[;,])/i.test(src) ? src : null
  }
  const html = transfer.getData('text/html')
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const src = safe(doc.querySelector('img')?.getAttribute('src') ?? null)
    if (src) return src
  }
  const uri = transfer.getData('text/uri-list').split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'))
    ?? transfer.getData('text/plain')
  const src = safe(uri)
  // Plain links remain text unless their path identifies an image. Signed
  // artifact links often carry the filename in a storageKey query parameter.
  if (src && /\.(?:png|jpe?g|gif|webp|avif|svg)(?:$|[?&#])/i.test(src)) return src
  return null
}
