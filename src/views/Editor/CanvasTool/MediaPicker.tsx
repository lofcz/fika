import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './MediaPicker.module.scss'
const cx = bindStyles(styles)
import { useId, useMemo, useRef, useState, useEffect, type CSSProperties, type DragEvent, type ClipboardEvent } from 'react'
import { getMediaConstraints, type FikaMediaKind } from '@/configs/mediaUpload'
import { formatBytes, getAcceptAttribute, maxSizeLabel } from '@/utils/mediaFile'
import useMediaQueue, { type MediaQueueItem } from '@/hooks/useMediaQueue'
import useCreateElement from '@/hooks/useCreateElement'
import message from '@/utils/message'
import Button from '@/components/Button'
import FileInput from '@/components/FileInput'
import { useI18nContext } from '@/i18n/useI18nContext'

export interface MediaPickerReplacePayload {
  src: string
  width: number
  height: number
}

export type IMediaPickerProps = {
  className?: string
  style?: CSSProperties
  mode?: 'insert' | 'replace'
  titleId?: string
  onReplace?: (payload: MediaPickerReplacePayload) => Promise<void> | void
  onClose?: () => void
}

const IMAGE_ONLY_KINDS: FikaMediaKind[] = ['image']

export default function MediaPicker(props: IMediaPickerProps) {
  const isReplace = props.mode === 'replace'
  const { LL } = useI18nContext()
  const { createMediaElements } = useCreateElement()
  const queueOptions = useMemo(() => (
    isReplace
      ? { kinds: IMAGE_ONLY_KINDS, maxFiles: 1, replaceOnAdd: true, verifyImageDecode: true }
      : undefined
  ), [isReplace])
  const {
    items,
    readyItems,
    inFlight,
    overallProgress,
    addFiles,
    removeItem,
    retryItem,
    reset,
  } = useMediaQueue(queueOptions)

  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rejectionMessage, setRejectionMessage] = useState('')
  const dropHintId = useId()
  const accept = getAcceptAttribute(queueOptions)

  const constraints = getMediaConstraints()
  const maxFiles = isReplace ? 1 : (constraints.maxFiles ?? 12)

  const kindLabel = (kind: FikaMediaKind) => {
    if (kind === 'image') return LL.editor.canvasTool.mediaPicker.kindImage()
    if (kind === 'video') return LL.editor.canvasTool.mediaPicker.kindVideo()
    return LL.editor.canvasTool.mediaPicker.kindAudio()
  }

  const typeList = (() => {
    const kinds = isReplace ? IMAGE_ONLY_KINDS : (constraints.kinds ?? ['image', 'video', 'audio'])
    return kinds.map(kind => kindLabel(kind)).join(', ')
  })()

  const constraintsHint = (() => {
    const maxSize = maxSizeLabel(queueOptions)
    if (isReplace) {
      return LL.editor.canvasTool.mediaPicker.replaceConstraintsHint({
        types: typeList,
        maxSize: maxSize || '—',
      })
    }
    return LL.editor.canvasTool.mediaPicker.constraintsHint({
      maxFiles,
      types: typeList,
      maxSize: maxSize || '—',
    })
  })()

  const itemErrorText = (item: MediaQueueItem) => {
    if (item.errorCode === 'decode') return LL.editor.canvasTool.mediaPicker.errorDecode()
    return item.error || LL.editor.canvasTool.mediaPicker.errorUpload()
  }

  const firstErrorItem = items.find(item => item.status === 'error')
  const inlineError = rejectionMessage || (firstErrorItem ? itemErrorText(firstErrorItem) : '')

  const canSubmit = isReplace
    ? readyItems.length === 1 && !!readyItems[0].naturalSize && !inFlight
    : readyItems.length > 0 && !inFlight

  const primaryLabel = (() => {
    if (isReplace) return LL.editor.canvasTool.mediaPicker.replaceAction()
    const count = readyItems.length
    if (count <= 1) return LL.editor.canvasTool.mediaPicker.insertOne()
    return LL.editor.canvasTool.mediaPicker.insert({ count })
  })()

  const statusLabel = (() => {
    if (inFlight) return LL.editor.canvasTool.mediaPicker.uploading()
    return LL.editor.canvasTool.mediaPicker.ready({
      ready: readyItems.length,
      total: items.length,
    })
  })()

  const readyHint = (() => {
    if (!items.length) return ''
    return LL.editor.canvasTool.mediaPicker.ready({
      ready: readyItems.length,
      total: items.length,
    })
  })()

  const reportRejections = (rejections: ReturnType<typeof addFiles>) => {
    if (!rejections.length) {
      setRejectionMessage('')
      return
    }
    const messages: string[] = []
    const tooMany = rejections.some(item => item.reason === 'tooMany')
    if (tooMany) {
      const text = isReplace
        ? LL.editor.canvasTool.mediaPicker.errorSingleOnly()
        : LL.editor.canvasTool.mediaPicker.errorTooMany({ max: maxFiles })
      messages.push(text)
      message.error(text)
    }
    for (const rejection of rejections) {
      if (rejection.reason === 'tooMany') continue
      if (rejection.reason === 'size') {
        const text = LL.editor.canvasTool.mediaPicker.errorTooLarge({
          name: rejection.file.name,
          maxSize: formatBytes(rejection.maxSize || 0),
        })
        messages.push(text)
        message.error(text)
      }
      else {
        const text = isReplace
          ? LL.editor.canvasTool.mediaPicker.errorImageOnly({ name: rejection.file.name })
          : LL.editor.canvasTool.mediaPicker.errorType({ name: rejection.file.name })
        messages.push(text)
        message.error(text)
      }
    }
    setRejectionMessage(messages[0] || '')
  }

  const onPick = (files: FileList) => {
    reportRejections(addFiles(files))
  }

  const onDrop = (event: DragEvent) => {
    setDragOver(false)
    const files = event.dataTransfer?.files
    if (files?.length) reportRejections(addFiles(files))
  }

  const onPaste = (event: ClipboardEvent) => {
    const files = event.clipboardData?.files
    if (!files?.length) return
    event.preventDefault()
    reportRejections(addFiles(files))
  }

  const close = () => {
    props.onClose?.()
  }

  const submit = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      if (isReplace) {
        const ready = readyItems[0]
        if (!ready?.result || !ready.naturalSize) return
        await props.onReplace?.({
          src: ready.result.src,
          width: ready.naturalSize.width,
          height: ready.naturalSize.height,
        })
        reset(true)
        close()
      }
      else {
        await createMediaElements(readyItems.map(item => ({
          kind: item.kind,
          src: item.result!.src,
          ext: item.result!.ext,
        })))
        reset(true)
        close()
      }
    }
    catch {
      const text = LL.editor.canvasTool.mediaPicker.errorPrepare()
      setRejectionMessage(text)
      message.error(text)
    }
    finally {
      setSubmitting(false)
    }
  }

  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste
  const resetRef = useRef(reset)
  resetRef.current = reset

  useEffect(() => {
    const handlePaste = (event: Event) => onPasteRef.current(event as unknown as ClipboardEvent)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('paste', handlePaste)
      resetRef.current()
    }
  }, [])

  const headerTitle = isReplace
    ? LL.editor.canvasTool.mediaPicker.replaceTitle()
    : LL.editor.canvasTool.mediaPicker.title()
  const headerExplainer = isReplace
    ? LL.editor.canvasTool.mediaPicker.replaceExplainer()
    : LL.editor.canvasTool.mediaPicker.explainer()
  const dropHeadline = isReplace
    ? (dragOver
        ? LL.editor.canvasTool.mediaPicker.replaceDropHere()
        : (items.length
            ? LL.editor.canvasTool.mediaPicker.replaceChooseAnother()
            : LL.editor.canvasTool.mediaPicker.replaceDropTitle()))
    : (dragOver
        ? LL.editor.canvasTool.mediaPicker.dropHere()
        : (items.length
            ? LL.editor.canvasTool.mediaPicker.addMore()
            : LL.editor.canvasTool.mediaPicker.title()))

  return (
    <div
      className={cx('media-picker', props.className)}
      style={props.style}
      data-media-picker-mode={isReplace ? 'replace' : 'insert'}
    >
      <header className={cx('header')}>
        <div className={cx('mark')} aria-hidden="true">
          <Icon icon="image" />
        </div>
        <div className={cx('titles')}>
          <h2 id={props.titleId}>{headerTitle}</h2>
          <p>{headerExplainer}</p>
        </div>
      </header>

      <div
        className={cx('dropzone', { compact: items.length, over: dragOver })}
        role="region"
        aria-label={isReplace ? LL.editor.canvasTool.mediaPicker.dropzoneLabel() : headerTitle}
        aria-describedby={dropHintId}
        data-media-dropzone={isReplace ? 'replace-image' : 'insert-media'}
        onDragEnter={event => { event.preventDefault(); setDragOver(true) }}
        onDragOver={event => { event.preventDefault(); setDragOver(true) }}
        onDragLeave={event => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDragOver(false)
        }}
        onDrop={event => { event.preventDefault(); onDrop(event) }}
      >
        <div className={cx('kinds')} aria-hidden="true">
          <span className={cx('kind')}><Icon icon="image" /></span>
          {!isReplace ? (
            <>
              <span className={cx('kind')}><Icon icon="video" /></span>
              <span className={cx('kind')}><Icon icon="music" /></span>
            </>
          ) : null}
        </div>
        <div className={cx('drop-copy')}>
          <strong>{dropHeadline}</strong>
          <span id={dropHintId}>{constraintsHint}</span>
        </div>
        <FileInput
          accept={accept}
          multiple={!isReplace}
          data-media-file={isReplace ? 'replace-image' : 'picker'}
          ariaLabel={LL.editor.canvasTool.mediaPicker.browse()}
          onChange={onPick}
        >
          <Button type="primary" size="small">
            <Icon icon="folder-up" />
            {LL.editor.canvasTool.mediaPicker.browse()}
          </Button>
        </FileInput>
      </div>

      {inlineError ? (
        <div className={cx('inline-error')} role="alert" aria-live="assertive" data-media-picker-error>
          <Icon icon="triangle-alert" className={cx('inline-error-icon')} />
          <span>{inlineError}</span>
        </div>
      ) : null}

      {items.length ? (
        <div className={cx('queue')}>
          {inFlight || overallProgress > 0 ? (
            <div className={cx('overall')}>
              <div className={cx('overall-track')}>
                <div className={cx('overall-fill')} style={{ width: overallProgress + '%' }} />
              </div>
              <span className={cx('overall-label')} aria-live="polite">{statusLabel}</span>
            </div>
          ) : null}

          <ul className={cx('cards')}>
            {items.map(item => (
              <li key={item.id} className={cx('card', item.status)} data-media-card-status={item.status}>
                <div className={cx('thumb')} style={{ '--progress': item.progress } as CSSProperties}>
                  {item.status === 'error' ? (
                    <div className={cx('error-thumb')} aria-hidden="true"><Icon icon="image" /></div>
                  ) : item.kind === 'image' ? (
                    <img src={item.previewUrl} alt={item.file.name} />
                  ) : item.kind === 'video' ? (
                    <video src={item.previewUrl} muted playsInline />
                  ) : (
                    <div className={cx('audio-thumb')}><Icon icon="music" /></div>
                  )}
                  {item.status === 'uploading' || item.status === 'processing' || item.status === 'queued' ? <div className={cx('progress-ring')} /> : null}
                  <div className={cx('badge')}>{kindLabel(item.kind)}</div>
                  {item.status === 'ready' ? <div className={cx('ready-check')}><Icon icon="circle-check" /></div> : null}
                </div>
                <div className={cx('meta')}>
                  <div className={cx('name')} title={item.file.name}>{item.file.name}</div>
                  <div className={cx('sub')}>
                    <span>{formatBytes(item.file.size)}</span>
                    {item.status === 'error' ? <span className={cx('error')}>{itemErrorText(item)}</span>
                      : item.status === 'ready' ? <span>{LL.common.ok()}</span>
                        : item.status === 'uploading' ? <span>{item.progress}%</span>
                          : item.status === 'processing' ? <span>{LL.editor.canvasTool.mediaPicker.processing()}</span>
                            : <span>{LL.editor.canvasTool.mediaPicker.queued()}</span>}
                  </div>
                  {item.status === 'uploading' || item.status === 'processing' ? (
                    <div className={cx('bar')}>
                      <div
                        className={cx('bar-fill', { indeterminate: item.status === 'processing' && item.progress < 8 })}
                        style={{ width: Math.max(item.progress, 8) + '%' }}
                      />
                    </div>
                  ) : null}
                </div>
                <div className={cx('actions')}>
                  {item.status === 'error' ? (
                    <button
                      type="button"
                      className={cx('icon-btn')}
                      title={LL.editor.canvasTool.mediaPicker.retry()}
                      aria-label={LL.editor.canvasTool.mediaPicker.retry()}
                      onClick={() => {
                        setRejectionMessage('')
                        retryItem(item.id)
                      }}
                    >
                      <Icon icon="redo-2" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={cx('icon-btn')}
                    title={LL.editor.canvasTool.mediaPicker.remove()}
                    aria-label={LL.editor.canvasTool.mediaPicker.remove()}
                    onClick={() => {
                      setRejectionMessage('')
                      removeItem(item.id)
                    }}
                  >
                    <Icon icon="x" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className={cx('footer')}>
        <span className={cx('hint')} aria-live="polite">{readyHint}</span>
        <div className={cx('footer-actions')}>
          <Button onClick={() => close()}>{LL.common.cancel()}</Button>
          <Button
            type="primary"
            data-editor-insert={isReplace ? undefined : 'media'}
            data-editor-replace={isReplace ? 'image' : undefined}
            disabled={!canSubmit || submitting}
            onClick={() => void submit()}
          >
            {primaryLabel}
          </Button>
        </div>
      </footer>
    </div>
  )
}
