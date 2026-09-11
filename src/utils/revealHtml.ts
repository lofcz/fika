/**
 * Progressive "typing" prefixes of rich-text HTML.
 *
 * A prefix keeps the markup well-formed: text nodes are cut mid-run, atomic
 * nodes (inline math, images, line breaks) are either fully in or fully out,
 * and elements left with nothing visible after the cut are dropped so no
 * empty paragraphs flash before their text arrives.
 */

const ATOMIC_SELECTOR = 'span.fika-math, img, br, video, audio, svg'
/** Weight of one atomic node in typing units (≈ the pause a formula deserves). */
const ATOMIC_UNITS = 4

let parser: DOMParser | null = null

function parse(html: string): HTMLElement {
  if (!parser) parser = new DOMParser()
  return parser.parseFromString(`<!doctype html><body>${html}</body>`, 'text/html').body
}

function isAtomic(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(ATOMIC_SELECTOR)
}

/** Total typing units in `html` (characters plus a fixed weight per atomic node). */
export function revealUnits(html: string): number {
  if (!html) return 0
  let units = 0
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      units += (node as Text).data.length
      return
    }
    if (isAtomic(node)) {
      units += ATOMIC_UNITS
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(parse(html))
  return units
}

function hasVisibleContent(el: Element): boolean {
  if (el.matches(ATOMIC_SELECTOR) || el.querySelector(ATOMIC_SELECTOR)) return true
  return (el.textContent ?? '').length > 0
}

/** Remove `node` and then every ancestor left without visible content. */
function pruneUpwards(node: Node, root: HTMLElement) {
  let parent = node.parentNode
  node.parentNode?.removeChild(node)
  while (parent && parent !== root && parent.nodeType === Node.ELEMENT_NODE) {
    const el = parent as Element
    if (hasVisibleContent(el)) break
    const next = el.parentNode
    next?.removeChild(el)
    parent = next
  }
}

/** The first `units` typing units of `html` as well-formed HTML. */
export function revealPrefix(html: string, units: number): string {
  if (!html) return ''
  if (units <= 0) return ''
  const root = parse(html)
  let remaining = units
  let cut = false
  const dropped: Node[] = []

  const walk = (node: Node) => {
    if (cut) {
      dropped.push(node)
      return
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      if (remaining >= text.data.length) {
        remaining -= text.data.length
        return
      }
      text.data = text.data.slice(0, remaining)
      remaining = 0
      cut = true
      if (text.data.length === 0) dropped.push(text)
      return
    }
    if (isAtomic(node)) {
      if (remaining >= ATOMIC_UNITS) {
        remaining -= ATOMIC_UNITS
        return
      }
      cut = true
      dropped.push(node)
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(root)

  if (!cut) return html
  for (const node of dropped) {
    if (node.parentNode) pruneUpwards(node, root)
  }
  return root.innerHTML
}
