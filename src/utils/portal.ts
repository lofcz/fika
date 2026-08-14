export const APP_SHELL_ID = 'fika-shell'
export const APP_PORTALS_ID = 'fika-portals'
export const EMBED_ROOT_CLASS = 'fika-embed-root'

let portalTarget: HTMLElement | null = null

export function setFikaPortalTarget(target: HTMLElement | null) {
  portalTarget = target
}

export function clearFikaPortalTarget(target: HTMLElement) {
  if (portalTarget === target) portalTarget = null
}

/** Overlay mount for the standalone app. Never document.body — that is the page, not Fika. */
export function ensureAppPortalRoot(): HTMLElement {
  const existing = document.getElementById(APP_PORTALS_ID)
  if (existing instanceof HTMLElement) return existing

  const portals = document.createElement('div')
  portals.id = APP_PORTALS_ID
  const shell = document.getElementById(APP_SHELL_ID)
  if (shell) shell.appendChild(portals)
  else document.documentElement.appendChild(portals)
  return portals
}

export function getFikaPortalTarget(): HTMLElement {
  if (portalTarget?.isConnected) return portalTarget
  return ensureAppPortalRoot()
}

/**
 * Resolve the portal target for a *specific* embed instance.
 *
 * The module-level `portalTarget` only tracks the last-mounted embed, so when
 * several embeds coexist (e.g. multiple decks force-mounted side by side in a
 * host app) it points at the wrong one — overlays then render into a sibling
 * embed's portal, which the host may have hidden (`display:none`), so they
 * never appear. Resolving from the interacted element keeps each overlay in
 * its own embed. Falls back to the standalone portal root.
 */
export function resolveFikaPortalTarget(el?: Element | null): HTMLElement {
  const root = el?.closest(`.${EMBED_ROOT_CLASS}`)
  if (root instanceof HTMLElement) {
    const scoped = root.querySelector<HTMLElement>(':scope > .fika-embed-portal')
    if (scoped?.isConnected) return scoped
    return root
  }
  return getFikaPortalTarget()
}

const FIXED_WILL_CHANGE = new Set(['transform', 'perspective', 'filter'])

/** Ancestor that becomes the containing block for `position: fixed` descendants. */
export function findFixedContainingBlock(from: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = from
  while (node && node !== document.body && node !== document.documentElement) {
    const cs = getComputedStyle(node)
    const contain = cs.contain
    const willChange = cs.willChange
    if (
      cs.transform !== 'none' ||
      cs.perspective !== 'none' ||
      (cs.filter && cs.filter !== 'none') ||
      contain === 'strict' ||
      contain === 'content' ||
      contain.includes('layout') ||
      contain.includes('paint') ||
      (cs.containerType && cs.containerType !== 'normal') ||
      willChange.split(',').some(value => FIXED_WILL_CHANGE.has(value.trim()))
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

export function menuAxisFromEvent(event: MouseEvent, portal: HTMLElement): {
  x: number
  y: number
  width: number
  height: number
} {
  const containingBlock = findFixedContainingBlock(portal)
  if (!containingBlock) {
    return {
      x: event.clientX,
      y: event.clientY,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }
  const rect = containingBlock.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    width: containingBlock.clientWidth || rect.width,
    height: containingBlock.clientHeight || rect.height,
  }
}

function getFikaQueryRoot(): Document | ShadowRoot {
  const root = portalTarget?.getRootNode()
  if (root instanceof ShadowRoot) return root
  return document
}

export function queryFika<T extends Element = Element>(selector: string): T | null {
  return getFikaQueryRoot().querySelector<T>(selector) ?? document.querySelector<T>(selector)
}

export function queryFikaAll<T extends Element = Element>(selector: string): NodeListOf<T> {
  const rootMatches = getFikaQueryRoot().querySelectorAll<T>(selector)
  return rootMatches.length ? rootMatches : document.querySelectorAll<T>(selector)
}

const isAppRootElement = (node: EventTarget | null): boolean => (
  node instanceof Element && (
    node.id === APP_SHELL_ID
    || node.classList.contains(EMBED_ROOT_CLASS)
  )
)

const isDocumentLevelTarget = (target: EventTarget | null): boolean => (
  target === document || target === document.documentElement || target === document.body
)

const isAppMounted = (): boolean => (
  !!document.getElementById(APP_SHELL_ID) || !!document.querySelector(`.${EMBED_ROOT_CLASS}`)
)

/**
 * True when the event belongs to Fika (shell / embed), not a host overlay.
 *
 * Canvas clicks set editorAreaFocus but do not move DOM focus, so keydown/paste
 * land on document.body. Those document-level events are app-owned while Fika
 * is mounted. Foreign overlays (react-scan) focus their own nodes and stay out.
 */
export function isAppOwnedEvent(event: Event): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.some(isAppRootElement)) return true
  const target = event.target
  if (isDocumentLevelTarget(target)) return isAppMounted()
  if (!(target instanceof Node)) return false
  const el = target instanceof Element ? target : target.parentElement
  return !!el?.closest(`#${APP_SHELL_ID}, .${EMBED_ROOT_CLASS}`)
}
