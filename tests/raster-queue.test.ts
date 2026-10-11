import { describe, expect, it } from '@rstest/core'
import { collectRasterJobs, hasPendingRasters, requestRaster } from '@/paint/rasterResources'

const raster = { width: 1, height: 1 } as unknown as HTMLCanvasElement
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('raster work queue', () => {
  it('overlaps a bounded number of producers instead of running them one by one', async () => {
    let active = 0
    let peak = 0
    const release: Array<() => void> = []
    const produce = () => {
      active++
      peak = Math.max(peak, active)
      return new Promise<HTMLCanvasElement>(resolve => release.push(() => { active--; resolve(raster) }))
    }
    for (let i = 0; i < 6; i++) requestRaster(`queue:${i}`, produce, () => {})
    await tick()
    expect(active).toBe(4)
    release.splice(0).forEach(done => done())
    await tick(); await tick()
    expect(active).toBe(2)
    release.splice(0).forEach(done => done())
    await tick()
    expect(peak).toBe(4)
    expect(hasPendingRasters()).toBe(false)
    expect(requestRaster('queue:0', produce, () => {})).toBe(raster)
  })

  it('reports only the rasters a paint is missing, so other slides do not hold it up', async () => {
    const slow = new Promise<HTMLCanvasElement>(() => {})
    requestRaster('other-slide', () => slow, () => {})
    const missing = collectRasterJobs(() => {
      requestRaster('this-slide', () => raster, () => {})
    })
    expect([...missing.keys()]).toEqual(['this-slide'])
    await Promise.all(missing.values())
    expect(collectRasterJobs(() => { requestRaster('this-slide', () => raster, () => {}) }).size).toBe(0)
    expect(hasPendingRasters()).toBe(true)
  })
})
