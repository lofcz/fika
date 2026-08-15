export type RasterStats = {
  fullPaints: number
  patchPaints: number
  elementInvalidations: number
  backgroundInvalidations: number
  booths: number
}

export const rasterStats: RasterStats = {
  fullPaints: 0,
  patchPaints: 0,
  elementInvalidations: 0,
  backgroundInvalidations: 0,
  booths: 0,
}

export const resetRasterStats = () => {
  rasterStats.fullPaints = 0
  rasterStats.patchPaints = 0
  rasterStats.elementInvalidations = 0
  rasterStats.backgroundInvalidations = 0
  rasterStats.booths = 0
}

export const readRasterStats = (): RasterStats => ({ ...rasterStats })
