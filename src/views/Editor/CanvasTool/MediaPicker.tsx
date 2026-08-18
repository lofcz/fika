import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './MediaPicker.module.scss'
const cx = bindStyles(styles)
import { useRef, useState, useEffect, type CSSProperties, type DragEvent, type ClipboardEvent } from 'react'
import { getMediaConstraints, type FikaMediaKind } from '@/configs/mediaUpload'
import { formatBytes, getAcceptAttribute, maxSizeLabel } from '@/utils/mediaFile'
import useMediaQueue from '@/hooks/useMediaQueue'
import useCreateElement from '@/hooks/useCreateElement'
import message from '@/utils/message'
import Button from '@/components/Button'
import FileInput from '@/components/FileInput'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IMediaPickerProps = {
  className?: string
  style?: CSSProperties
  onClose?: () => void
}

export default function MediaPicker(props: IMediaPickerProps) {
  const { LL } = useI18nContext()
  const { createMediaElements } = useCreateElement()
  const {
    items,
    readyItems,
    inFlight,
    overallProgress,
    addFiles,
    removeItem,
    retryItem,
    reset,
  } = useMediaQueue()

  const [dragOver, setDragOver] = useState(false)
  const [inserting, setInserting] = useState(false)
  const accept = getAcceptAttribute()

  const constraints = getMediaConstraints()
  const maxFiles = constraints.maxFiles ?? 12

  const kindLabel = (kind: FikaMediaKind) => {
    if (kind === 'image') return LL.editor.canvasTool.mediaPicker.kindImage()
    if (kind === 'video') return LL.editor.canvasTool.mediaPicker.kindVideo()
    return LL.editor.canvasTool.mediaPicker.kindAudio()
  }

  const typeList = (() => {
    const kinds = constraints.kinds ?? ['image', 'video', 'audio']
    return kinds.map(kind => kindLabel(kind)).join(', ')
  })()

  const constraintsHint = (() => {
    const maxSize = maxSizeLabel()
    return LL.editor.canvasTool.mediaPicker.constraintsHint({
      maxFiles,
      types: typeList,
      maxSize: maxSize || '—',
    })
  })()

  const canInsert = readyItems.length > 0 && !inFlight

  const insertLabel = (() => {
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
    if (!rejections.length) return
    const tooMany = rejections.some(item => item.reason === 'tooMany')
    if (tooMany) {
      message.error(LL.editor.canvasTool.mediaPicker.errorTooMany({ max: maxFiles }))
    }
    for (const rejection of rejections) {
      if (rejection.reason === 'tooMany') continue
      if (rejection.reason === 'size') {
        message.error(LL.editor.canvasTool.mediaPicker.errorTooLarge({
          name: rejection.file.name,
          maxSize: formatBytes(rejection.maxSize || 0),
        }))
      }
      else {
        message.error(LL.editor.canvasTool.mediaPicker.errorType({ name: rejection.file.name }))
      }
    }
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

  const insert = async () => {
    if (!canInsert || inserting) return
    setInserting(true)
    try {
      await createMediaElements(readyItems.map(item => ({
        kind: item.kind,
        src: item.result!.src,
        ext: item.result!.ext,
      })))
      reset(true)
      close()
    }
    catch {
      message.error(LL.editor.canvasTool.mediaPicker.errorPrepare())
    }
    finally {
      setInserting(false)
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

  return (
    <div className={cx('media-picker', props.className)} style={props.style}>
      <header className={cx('header')}>
        <div className={cx('mark')} aria-hidden="true">
          <Icon icon="image" />
        </div>
        <div className={cx('titles')}>
          <h2>{LL.editor.canvasTool.mediaPicker.title()}</h2>
          <p>{LL.editor.canvasTool.mediaPicker.explainer()}</p>
        </div>
      </header>

      <div
        className={cx('dropzone', { compact: items.length, over: dragOver })}
        onDragEnter={event => { event.preventDefault(); setDragOver(true) }}
        onDragOver={event => { event.preventDefault(); setDragOver(true) }}
        onDragLeave={event => { event.preventDefault(); setDragOver(false) }}
        onDrop={event => { event.preventDefault(); onDrop(event) }}
      >
        <div className={cx('kinds')} aria-hidden="true">
          <span className={cx('kind')}><Icon icon="image" /></span>
          <span className={cx('kind')}><Icon icon="video" /></span>
          <span className={cx('kind')}><Icon icon="music" /></span>
        </div>
        <div className={cx('drop-copy')}>
          <strong>{dragOver ? LL.editor.canvasTool.mediaPicker.dropHere() : (items.length ? LL.editor.canvasTool.mediaPicker.addMore() : LL.editor.canvasTool.mediaPicker.title())}</strong>
          <span>{constraintsHint}</span>
        </div>
        <FileInput accept={accept} multiple data-media-file="picker" onChange={onPick}>
          <Button type="primary" size="small">
            <Icon icon="folder-up" />
            {LL.editor.canvasTool.mediaPicker.browse()}
          </Button>
        </FileInput>
      </div>

      {items.length ? (
        <div className={cx('queue')}>
          {inFlight || overallProgress > 0 ? (
            <div className={cx('overall')}>
              <div className={cx('overall-track')}>
                <div className={cx('overall-fill')} style={{ width: overallProgress + '%' }} />
              </div>
              <span className={cx('overall-label')}>{statusLabel}</span>
            </div>
          ) : null}

          <ul className={cx('cards')}>
            {items.map(item => (
              <li key={item.id} className={cx('card', item.status)}>
                <div className={cx('thumb')} style={{ '--progress': item.progress } as CSSProperties}>
                  {item.kind === 'image' ? <img src={item.previewUrl} alt={item.file.name} />
                    : item.kind === 'video' ? <video src={item.previewUrl} muted playsInline />
                      : <div className={cx('audio-thumb')}><Icon icon="music" /></div>}
                  {item.status === 'uploading' || item.status === 'processing' || item.status === 'queued' ? <div className={cx('progress-ring')} /> : null}
                  <div className={cx('badge')}>{kindLabel(item.kind)}</div>
                  {item.status === 'ready' ? <div className={cx('ready-check')}><Icon icon="circle-check" /></div> : null}
                </div>
                <div className={cx('meta')}>
                  <div className={cx('name')} title={item.file.name}>{item.file.name}</div>
                  <div className={cx('sub')}>
                    <span>{formatBytes(item.file.size)}</span>
                    {item.status === 'error' ? <span className={cx('error')}>{item.error || LL.editor.canvasTool.mediaPicker.errorUpload()}</span>
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
                    <button type="button" className={cx('icon-btn')} title={LL.editor.canvasTool.mediaPicker.retry()} onClick={() => retryItem(item.id)}>
                      <Icon icon="redo-2" />
                    </button>
                  ) : null}
                  <button type="button" className={cx('icon-btn')} title={LL.editor.canvasTool.mediaPicker.remove()} onClick={() => removeItem(item.id)}>
                    <Icon icon="x" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className={cx('footer')}>
        <span className={cx('hint')}>{readyHint}</span>
        <div className={cx('footer-actions')}>
          <Button onClick={() => close()}>{LL.common.cancel()}</Button>
          <Button type="primary" data-editor-insert="media" disabled={!canInsert || inserting} onClick={() => insert()}>
            {insertLabel}
          </Button>
        </div>
      </footer>
    </div>
  )
}
