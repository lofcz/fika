/** Measure actual raster text in the solid-background text fixtures. */
export async function thumbnailTextGeometry(page, { id, needle } = {}) {
  return page.evaluate(({ id, needle }) => {
    const state = window.__FIKA_SLIDES__.getState()
    const slide = state.slides[state.slideIndex]
    const element = slide.elements.find(el => id ? el.id === id : (el.content || el.text?.content || '').includes(needle))
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => el.dataset.thumbnailSlide === slide.id)
    const canvas = host?.querySelector('canvas[data-canvas-painted]')
    if (!element || !canvas) return { ok: false, reason: 'missing-text-or-painted-thumbnail' }
    const sx = canvas.width / state.viewportSize
    const sy = canvas.height / (state.viewportSize * state.viewportRatio)
    const x = Math.max(0, Math.floor(element.left * sx))
    const y = Math.max(0, Math.floor(element.top * sy))
    const w = Math.min(canvas.width - x, Math.ceil(element.width * sx))
    const h = Math.min(canvas.height - y, Math.ceil(element.height * sy))
    if (w <= 0 || h <= 0) return { ok: false, reason: 'empty-text-bounds' }
    const pixels = canvas.getContext('2d').getImageData(x, y, w, h).data
    // The modal color is the fixture's flat background, independent of theme.
    const colors = new Map()
    for (let p = 0; p < pixels.length; p += 4) {
      const key = (pixels[p] >> 4) * 256 + (pixels[p + 1] >> 4) * 16 + (pixels[p + 2] >> 4)
      colors.set(key, (colors.get(key) || 0) + 1)
    }
    const background = [...colors].sort((a, b) => b[1] - a[1])[0][0]
    const bg = [(background >> 8) * 16 + 8, ((background >> 4) & 15) * 16 + 8, (background & 15) * 16 + 8]
    const rows = []
    let minX = w
    for (let row = 0; row < h; row++) {
      let ink = 0
      for (let col = 0; col < w; col++) {
        const p = (row * w + col) * 4
        const contrast = Math.max(...bg.map((value, c) => Math.abs(pixels[p + c] - value)))
        if (pixels[p + 3] > 128 && contrast > 70) { ink++; minX = Math.min(minX, col) }
      }
      if (ink) rows.push(row)
    }
    if (!rows.length) return { ok: false, reason: 'no-rendered-text-ink' }
    let lines = 1
    for (let i = 1; i < rows.length; i++) if (rows[i] - rows[i - 1] > 2) lines++
    return { ok: true, lines, left: (x + minX) / canvas.width, top: (y + rows[0]) / canvas.height }
  }, { id, needle })
}
