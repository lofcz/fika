/**
 * Live paint for fill / gradient / opacity. Same contract as applyLiveSize:
 * write the canvas DOM during the gesture. Do not go through the store until
 * pointerup — a store write rebuilds the preview raster and the canvas list.
 */

import { gradientToCss } from '@/configs/theme'
import type { Gradient } from '@/types/slides'

const SVG_NS = 'http://www.w3.org/2000/svg'

export const liveGradientId = (elementId: string, source = 'editable') => (
  `${source}-gradient-${elementId}`
)

export const liveGradientTransform = (rotate: number) => `rotate(${rotate},0.5,0.5)`

const ensureStop = (def: Element, index: number): SVGStopElement => {
  const existing = def.querySelectorAll('stop')[index]
  if (existing) return existing
  const stop = document.createElementNS(SVG_NS, 'stop')
  def.appendChild(stop)
  return stop
}

/** Single writer for SVG gradient stops. React must not also own these children. */
export const syncGradientDef = (def: Element, gradient: Pick<Gradient, 'colors' | 'rotate'>): void => {
  if (def.tagName.toLowerCase() === 'lineargradient') {
    def.setAttribute('gradientTransform', liveGradientTransform(gradient.rotate || 0))
  }
  const colors = gradient.colors
  for (let i = 0; i < colors.length; i++) {
    const stop = ensureStop(def, i)
    stop.setAttribute('offset', `${colors[i].pos}%`)
    stop.setAttribute('stop-color', colors[i].color)
  }
  const extras = def.querySelectorAll('stop')
  for (let i = colors.length; i < extras.length; i++) extras[i].remove()
}

export const applyLiveGradient = (
  elementId: string,
  gradient: Gradient,
  source = 'editable',
): boolean => {
  if (typeof document === 'undefined') return false
  const def = document.getElementById(liveGradientId(elementId, source))
  if (!def) return false
  syncGradientDef(def, gradient)
  return true
}

export const applyLiveBackgroundGradient = (gradient: Gradient): boolean => {
  if (typeof document === 'undefined') return false
  const node = document.querySelector('[data-live-background]')
  if (!(node instanceof HTMLElement)) return false
  node.style.backgroundImage = gradientToCss(gradient)
  node.style.backgroundColor = ''
  return true
}

export const readPaintedGradientRotate = (elementId: string, source = 'editable'): number | null => {
  if (typeof document === 'undefined') return null
  const def = document.getElementById(liveGradientId(elementId, source))
  const raw = def?.getAttribute('gradientTransform') || ''
  const match = raw.match(/rotate\(([-.\d]+)/)
  if (!match) return null
  const rotate = Number(match[1])
  return Number.isFinite(rotate) ? rotate : null
}
