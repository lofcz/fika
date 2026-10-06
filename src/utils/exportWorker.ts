/** Per-export worker: bounded lifetime, no editor state or host callbacks cross the boundary. */
export function createExportWorker() {
  const worker = new Worker(new URL('../workers/export.worker.ts', import.meta.url), { type: 'module' })
  let nextId = 0
  let failure: Error | null = null
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const fail = (error: Error) => {
    failure ??= error
    worker.terminate()
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(failure) }
    pending.clear()
  }
  worker.onmessage = ({ data }) => {
    const job = pending.get(data.id)
    if (!job) return
    pending.delete(data.id)
    clearTimeout(job.timer)
    if (data.error) job.reject(new Error(data.error))
    else job.resolve(data.value)
  }
  worker.onerror = event => fail(new Error(event.message || 'Export worker failed'))
  worker.onmessageerror = () => fail(new Error('Export worker response could not be read'))
  return {
    request<T>(task: string, data: unknown, transfer: Transferable[] = []): Promise<T> {
      if (failure) return Promise.reject(failure)
      const id = ++nextId
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail(new Error('Export worker timed out')), 5 * 60_000)
        pending.set(id, { resolve, reject, timer })
        try { worker.postMessage({ id, task, data }, transfer) }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
      })
    },
    close() { fail(new Error('Export worker closed')) },
  }
}

/** Yield to another browser task, rather than resuming work inside a rAF callback. */
export const yieldExportTask = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/** DOM conversion remains on the main thread; bound work between input opportunities. */
export function exportTimeSlice(budgetMs = 8) {
  let started = performance.now()
  return async () => {
    if (performance.now() - started < budgetMs) return
    await yieldExportTask()
    started = performance.now()
  }
}
