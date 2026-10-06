import { afterEach, describe, expect, it, rs } from '@rstest/core'
import { createExportWorker } from '../src/utils/exportWorker'
const NativeWorker = globalThis.Worker
class FixtureWorker {
  static latest: FixtureWorker
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = rs.fn()
  terminate = rs.fn()
  constructor() { FixtureWorker.latest = this }
}
afterEach(() => { globalThis.Worker = NativeWorker; rs.useRealTimers() })
function create() {
  globalThis.Worker = FixtureWorker as unknown as typeof Worker
  return createExportWorker()
}
describe('export worker lifecycle', () => {
  it('rejects immediately when worker startup failed before the first request', async () => {
    const worker = create()
    FixtureWorker.latest.onerror!({ message: 'module failed to load' })
    await expect(worker.request('pptx', {})).rejects.toThrow('module failed to load')
    expect(FixtureWorker.latest.postMessage).not.toHaveBeenCalled()
    worker.close()
  })
  it('rejects outstanding and future requests after fatal worker failure', async () => {
    const worker = create()
    const pending = worker.request('pdf-save', {})
    const rejected = expect(pending).rejects.toThrow('worker stopped')
    FixtureWorker.latest.onerror!({ message: 'worker stopped' })
    await rejected
    await expect(worker.request('pdf-save', {})).rejects.toThrow('worker stopped')
    expect(FixtureWorker.latest.terminate).toHaveBeenCalled()
  })
  it('bounds a stalled request and terminates its worker', async () => {
    rs.useFakeTimers()
    const worker = create()
    const pending = worker.request('pptx', {})
    const rejected = expect(pending).rejects.toThrow('timed out')
    rs.advanceTimersByTime(5 * 60_000)
    await rejected
    await expect(worker.request('pptx', {})).rejects.toThrow('timed out')
  })
})
