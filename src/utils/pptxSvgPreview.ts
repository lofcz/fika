import type { PptxExportCommand } from './pptxExportCommands'

/** SVG decoding needs the DOM: Chromium cannot decode SVG through createImageBitmap in a worker. */
export function renderSvgPngPreview(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const finish = (error?: Error, data?: string) => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      image.src = ''
      if (error) reject(error)
      else resolve(data!)
    }
    const timer = setTimeout(() => finish(new Error('SVG preview timed out')), 30_000)
    image.onload = () => {
      let canvas: HTMLCanvasElement | undefined
      try {
        const { naturalWidth: width, naturalHeight: height } = image
        if (!width || !height) throw new Error('SVG preview has no dimensions')
        // Keep preview memory bounded; the full vector source is embedded separately.
        const scale = Math.min(2, 4096 / Math.max(width, height))
        canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.ceil(width * scale))
        canvas.height = Math.max(1, Math.ceil(height * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('SVG preview canvas is unavailable')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        finish(undefined, canvas.toDataURL('image/png'))
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0 }
      }
    }
    image.onerror = () => finish(new Error('Could not render SVG preview'))
    image.src = source
  })
}

/** Attach compatibility previews to the recorded options, never to the saved/editor document. */
export async function preparePptxSvgPreviews(
  commands: PptxExportCommand[],
  render = renderSvgPngPreview,
): Promise<void> {
  const previews = new Map<string, string>()
  const visit = async (value: unknown): Promise<void> => {
    if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return
    const options = value as Record<string, unknown>
    if (typeof options.data === 'string' && /^data:image\/svg\+xml[;,]/i.test(options.data)) {
      if (typeof options.svgPngData === 'string') return
      let preview = previews.get(options.data)
      if (!preview) {
        preview = await render(options.data)
        previews.set(options.data, preview)
      }
      options.svgPngData = preview
      return
    }
    for (const child of Object.values(value)) await visit(child)
  }
  for (const command of commands) await visit(command.args ?? command.value)
}
