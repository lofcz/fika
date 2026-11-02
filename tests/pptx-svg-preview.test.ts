import { describe, expect, it, rs } from '@rstest/core'
import { preparePptxSvgPreviews } from '../src/utils/pptxSvgPreview'
import type { PptxExportCommand } from '../src/utils/pptxExportCommands'

const svg = 'data:image/svg+xml;base64,PHN2Zy8+'
const png = 'data:image/png;base64,cG5n'

describe('worker SVG previews', () => {
  it('prepares slide and master images once per source while retaining vector data and options', async () => {
    const image = { data: svg, x: 1, y: 2, w: 3, h: 4, rotate: 15 }
    const master = { objects: [{ image: { ...image } }] }
    const commands: PptxExportCommand[] = [
      { target: 0, property: 'addImage', args: [image] },
      { target: -1, property: 'defineSlideMaster', args: [master] },
    ]
    const render = rs.fn().mockResolvedValue(png)
    await preparePptxSvgPreviews(commands, render)
    expect(render).toHaveBeenCalledTimes(1)
    expect(image).toEqual({ data: svg, svgPngData: png, x: 1, y: 2, w: 3, h: 4, rotate: 15 })
    expect(master.objects[0].image).toEqual(image)
    expect(() => structuredClone(commands)).not.toThrow()
  })

  it('leaves raster images, existing previews, and font bytes alone', async () => {
    const commands: PptxExportCommand[] = [
      { target: 0, property: 'addImage', args: [{ data: png }] },
      { target: 0, property: 'addImage', args: [{ data: svg, svgPngData: png }] },
      { target: -1, property: 'addFont', args: [{ fontFile: new Uint8Array([1, 2, 3]).buffer }] },
    ]
    const before = structuredClone(commands)
    const render = rs.fn()
    await preparePptxSvgPreviews(commands, render)
    expect(render).not.toHaveBeenCalled()
    expect(commands).toEqual(before)
  })

  it('rejects a failed diagram conversion and allows a fresh export to retry', async () => {
    const commands: PptxExportCommand[] = [{ target: 0, property: 'addImage', args: [{ data: svg }] }]
    const render = rs.fn().mockRejectedValueOnce(new Error('decode failed')).mockResolvedValue(png)
    await expect(preparePptxSvgPreviews(commands, render)).rejects.toThrow('decode failed')
    expect(commands[0].args).toEqual([{ data: svg }])
    await preparePptxSvgPreviews(commands, render)
    expect(commands[0].args).toEqual([{ data: svg, svgPngData: png }])
  })
})
