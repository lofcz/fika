import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import {
  getMediaConcurrency,
  getMediaConstraints,
  getMediaUploader,
  type FikaMediaKind,
  type FikaMediaUploadResult,
} from '@/configs/mediaUpload'
import { MIME_MAP } from '@/configs/mime'
import {
  detectMediaKind,
  getFileExtension,
  validateMediaFile,
  type MediaFileRejection,
} from '@/utils/mediaFile'

export type MediaQueueStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'error'

export interface MediaQueueItem {
  id: string
  file: File
  kind: FikaMediaKind
  previewUrl: string
  status: MediaQueueStatus
  progress: number
  error?: string
  result?: FikaMediaUploadResult
}

const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError')
  || (error instanceof Error && error.name === 'AbortError')

const readFileAsDataURL = (file: File, signal: AbortSignal, onProgress: (loaded: number, total: number) => void) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const onAbort = () => {
      reader.abort()
      reject(new DOMException('Upload aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })

    reader.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded, event.total)
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'))
    reader.onload = () => {
      signal.removeEventListener('abort', onAbort)
      resolve(reader.result as string)
    }
    reader.readAsDataURL(file)
  })
}

const normalizeResult = (
  result: FikaMediaUploadResult | string,
  file: File,
  kind: FikaMediaKind,
): FikaMediaUploadResult => {
  const parsed = typeof result === 'string' ? { src: result } : result
  const ext = parsed.ext || MIME_MAP[file.type] || getFileExtension(file)
  if (kind === 'image') return { src: parsed.src }
  return ext ? { src: parsed.src, ext } : { src: parsed.src }
}

export default () => {
  const itemsRef = useRef<MediaQueueItem[]>([])
  const activeCountRef = useRef(0)
  const controllers = useRef(new Map<string, AbortController>()).current
  const [items, setItems] = useState<MediaQueueItem[]>([])

  const syncItems = (next: MediaQueueItem[]) => {
    itemsRef.current = next
    setItems(next)
  }

  const readyItems = items.filter(item => item.status === 'ready' && item.result)
  const inFlight = items.some(item => item.status === 'queued' || item.status === 'uploading' || item.status === 'processing')
  const overallProgress = (() => {
    if (!items.length) return 0
    const total = items.reduce((sum, item) => sum + (item.status === 'error' ? 0 : 100), 0)
    if (!total) return 0
    const loaded = items.reduce((sum, item) => {
      if (item.status === 'ready') return sum + 100
      if (item.status === 'error') return sum
      return sum + item.progress
    }, 0)
    return Math.round((loaded / total) * 100)
  })()

  const patchItem = (id: string, patch: Partial<MediaQueueItem>) => {
    const index = itemsRef.current.findIndex(item => item.id === id)
    if (index === -1) return
    const next = itemsRef.current.slice()
    next[index] = { ...next[index], ...patch }
    syncItems(next)
  }

  const finishItem = (id: string) => {
    controllers.delete(id)
    activeCountRef.current = Math.max(0, activeCountRef.current - 1)
    void pump()
  }

  const processItem = async (item: MediaQueueItem) => {
    const controller = new AbortController()
    controllers.set(item.id, controller)

    const uploader = getMediaUploader()
    patchItem(item.id, {
      status: uploader ? 'uploading' : 'processing',
      progress: 0,
      error: undefined,
    })

    try {
      let result: FikaMediaUploadResult
      if (uploader) {
        const uploaded = await uploader({
          file: item.file,
          kind: item.kind,
          signal: controller.signal,
          onProgress: ({ loaded, total }) => {
            const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
            patchItem(item.id, { progress: percent, status: 'uploading' })
          },
        })
        result = normalizeResult(uploaded, item.file, item.kind)
      }
      else if (item.kind === 'image') {
        const src = await readFileAsDataURL(item.file, controller.signal, (loaded, total) => {
          const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
          patchItem(item.id, { progress: percent })
        })
        result = { src }
      }
      else {
        result = normalizeResult(item.previewUrl, item.file, item.kind)
      }

      patchItem(item.id, { status: 'ready', progress: 100, result, error: undefined })
    }
    catch (error) {
      if (isAbortError(error)) return
      patchItem(item.id, {
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Upload failed',
      })
    }
    finally {
      finishItem(item.id)
    }
  }

  const pump = async () => {
    const concurrency = getMediaConcurrency()
    while (activeCountRef.current < concurrency) {
      const next = itemsRef.current.find(item => item.status === 'queued')
      if (!next) break
      patchItem(next.id, { status: 'processing', progress: 0 })
      activeCountRef.current += 1
      void processItem(next)
    }
  }

  const addFiles = (fileList: FileList | File[]): MediaFileRejection[] => {
    const incoming = Array.from(fileList)
    const constraints = getMediaConstraints()
    const maxFiles = constraints.maxFiles ?? 12
    const remaining = Math.max(0, maxFiles - itemsRef.current.length)
    const rejections: MediaFileRejection[] = incoming.slice(remaining).map(file => ({
      file,
      reason: 'tooMany' as const,
    }))

    const nextItems: MediaQueueItem[] = []
    for (const file of incoming.slice(0, remaining)) {
      const rejection = validateMediaFile(file)
      if (rejection) {
        rejections.push(rejection)
        continue
      }
      const kind = detectMediaKind(file)
      if (!kind) {
        rejections.push({ file, reason: 'type' })
        continue
      }
      nextItems.push({
        id: nanoid(10),
        file,
        kind,
        previewUrl: URL.createObjectURL(file),
        status: 'queued',
        progress: 0,
      })
    }

    if (nextItems.length) {
      syncItems([...itemsRef.current, ...nextItems])
      void pump()
    }

    return rejections
  }

  const revokePreview = (item: MediaQueueItem, preserveReadySrc = false) => {
    if (preserveReadySrc && item.result?.src === item.previewUrl) return
    URL.revokeObjectURL(item.previewUrl)
  }

  const removeItem = (id: string) => {
    const item = itemsRef.current.find(entry => entry.id === id)
    if (!item) return
    controllers.get(id)?.abort()
    controllers.delete(id)
    revokePreview(item)
    syncItems(itemsRef.current.filter(entry => entry.id !== id))
  }

  const retryItem = (id: string) => {
    const item = itemsRef.current.find(entry => entry.id === id)
    if (!item || item.status !== 'error') return
    patchItem(id, { status: 'queued', progress: 0, error: undefined })
    void pump()
  }

  const reset = (preserveReadySrc = false) => {
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    activeCountRef.current = 0
    for (const item of itemsRef.current) revokePreview(item, preserveReadySrc)
    syncItems([])
  }

  return {
    items,
    readyItems,
    inFlight,
    overallProgress,
    addFiles,
    removeItem,
    retryItem,
    reset,
  }
}
