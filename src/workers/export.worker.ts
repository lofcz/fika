import type { PptxExportCommand } from '../utils/pptxExportCommands'
import type { PDFDocument } from 'pdf-lib'
let pdf: PDFDocument | undefined
let marks: any
const scope = globalThis as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (data: unknown, transfer?: Transferable[]) => void }
async function run(task: string, data: any): Promise<any> {
  if (task === 'font') {
    const { woff2Decode } = await import('woff-lib/woff2/decode')
    return new Uint8Array(await woff2Decode(new Uint8Array(data))).buffer
  }
  if (task === 'pptx') {
    const { default: PptxGen } = await import('pptxgenjs-plus')
    const deck = new PptxGen()
    const slides: any[] = []
    for (const command of data.commands as PptxExportCommand[]) {
      const target: any = command.target === -1 ? deck : slides[command.target]
      if (command.args) {
        const result = await target[command.property](...command.args)
        if (command.slide !== undefined) slides[command.slide] = result
      } else target[command.property] = command.value
    }
    let bytes = await deck.write({ outputType: 'arraybuffer' }) as ArrayBuffer
    if (data.stamp) {
      const { applyPptxExportWatermark } = await import('../utils/pptxExportWatermark')
      bytes = new Uint8Array(await applyPptxExportWatermark(bytes, data.stamp.watermark, data.stamp.images)).buffer
    }
    return bytes
  }
  if (task === 'stamp') {
    const { applyPptxExportWatermark } = await import('../utils/pptxExportWatermark')
    return new Uint8Array(await applyPptxExportWatermark(data.bytes, data.watermark, data.images)).buffer
  }
  if (task === 'pdf-start') {
    const { PDFDocument } = await import('pdf-lib')
    pdf = await PDFDocument.create()
    pdf.setTitle(data.title || 'Presentation')
    pdf.setCreator('Fika')
    const embed = (image: any) => image.mime === 'image/png' ? pdf!.embedPng(image.bytes) : pdf!.embedJpg(image.bytes)
    marks = data.watermark ? { config: data.watermark, light: await embed(data.light), dark: data.dark ? await embed(data.dark) : null } : null
    return null
  }
  if (task === 'pdf-page') {
    if (!pdf) throw new Error('PDF export has not started')
    const image = data.format === 'image/jpeg' ? await pdf.embedJpg(data.bytes) : await pdf.embedPng(data.bytes)
    const { width, height } = data
    const page = pdf.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
    if (marks) {
      const mark = data.dark ? marks.dark || marks.light : marks.light
      const config = marks.config
      const ratio = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! > 0 && value! <= 1 ? value! : fallback
      const markWidth = width * ratio(config.widthRatio, 0.12)
      const markHeight = markWidth * mark.height / mark.width
      const margin = width * ratio(config.marginRatio, 0.02)
      const position = config.position ?? 'bottom-right'
      page.drawImage(mark, { x: position.endsWith('left') ? margin : width - markWidth - margin, y: position.startsWith('top') ? height - markHeight - margin : margin, width: markWidth, height: markHeight, opacity: ratio(config.opacity, 1) })
    }
    return null
  }
  if (task === 'pdf-save') {
    if (!pdf) throw new Error('PDF export has not started')
    return new Uint8Array(await pdf.save()).buffer
  }
  throw new Error(`Unknown export task: ${task}`)
}
scope.onmessage = async ({ data: { id, task, data } }) => {
  try {
    const value = await run(task, data)
    scope.postMessage({ id, value }, value instanceof ArrayBuffer ? [value] : [])
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
