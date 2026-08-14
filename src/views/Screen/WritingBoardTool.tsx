import { bindStyles } from '@/utils/cssm'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'
import styles from './WritingBoardTool.module.scss'
const cx = bindStyles(styles)
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import { db } from '@/utils/database'
import { resolveFikaPortalTarget } from '@/utils/portal'
import { KEYS } from '@/configs/hotkey'
import type { ShapeType } from '@/utils/inkCommands'
import WritingBoard, { type WritingBoardHandle } from '@/components/WritingBoard'
import MoveablePanel from '@/components/MoveablePanel'
import Slider from '@/components/Slider'
import Popover from '@/components/Popover'
import Divider from '@/components/Divider'
import InkPaintSwatches from '@/components/InkPaintSwatches'
import { solidPaint, type InkPaint } from '@/configs/inkPaint'
import { useI18nContext } from '@/i18n/useI18nContext'

type WritingBoardModel = 'pen' | 'mark' | 'eraser' | 'shape'

const AUDIENCE_SYNC_CHANNEL = 'fika-audience-sync'

const SHAPE_OPTIONS: Array<{ type: ShapeType; icon: IconName }> = [
  { type: 'rect', icon: 'square' },
  { type: 'circle', icon: 'circle' },
  { type: 'triangle', icon: 'triangle' },
  { type: 'line', icon: 'minus' },
  { type: 'arrow', icon: 'arrow-right' },
]

export type IWritingBoardToolProps = {
  slideWidth: number
  slideHeight: number
  left?: number
  top?: number
  drawing?: boolean
  onClose?: () => void
}

export default function WritingBoardTool({
  slideWidth,
  slideHeight,
  left = -16,
  top = -16,
  drawing = true,
  onClose,
}: IWritingBoardToolProps) {
  const { LL } = useI18nContext()
  const currentSlide = useSlidesStore(selectCurrentSlide)
  const writingBoardRef = useRef<WritingBoardHandle | null>(null)
  const toolRootRef = useRef<HTMLDivElement | null>(null)
  const shapeBtnRef = useRef<HTMLDivElement | null>(null)
  const shapeMenuRef = useRef<HTMLDivElement | null>(null)
  const [shapeMenuPortal, setShapeMenuPortal] = useState<HTMLElement | null>(null)
  const [writingBoardPaint, setWritingBoardPaint] = useState<InkPaint>(solidPaint('#ff3b30'))
  const [writingBoardModel, setWritingBoardModel] = useState<WritingBoardModel>('pen')
  const [blackboard, setBlackboard] = useState(false)
  const [sizePopoverType, setSizePopoverType] = useState<'' | WritingBoardModel>('')
  const [shapeType, setShapeType] = useState<ShapeType>('rect')
  const [penSize, setPenSize] = useState(6)
  const [markSize, setMarkSize] = useState(24)
  const [rubberSize, setRubberSize] = useState(80)
  const [shapeSize, setShapeSize] = useState(4)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const syncChannelRef = useRef<BroadcastChannel | null>(null)
  const blackboardRef = useRef(blackboard)
  blackboardRef.current = blackboard
  const shapeMenuRafRef = useRef(0)
  const shapeMenuSyncQueuedRef = useRef(false)
  const drawingRef = useRef(drawing)
  const modelRef = useRef(writingBoardModel)
  drawingRef.current = drawing
  modelRef.current = writingBoardModel

  const shapeLabel = (type: ShapeType) => {
    const labels = LL.screen.writingBoard
    if (type === 'rect') return labels.rectangle()
    if (type === 'circle') return labels.circle()
    if (type === 'triangle') return labels.triangle()
    if (type === 'line') return labels.line()
    return labels.arrow()
  }

  const changeModel = (model: WritingBoardModel) => {
    setWritingBoardModel(model)
    setSizePopoverType(model === 'shape' ? '' : (sizePopoverType === model ? '' : model))
  }

  const pickShape = (type: ShapeType) => {
    setShapeType(type)
    setWritingBoardModel('shape')
  }

  const syncShapeMenu = useCallback(() => {
    if (modelRef.current !== 'shape' || !drawingRef.current) {
      shapeMenuRafRef.current = 0
      return
    }
    const btn = shapeBtnRef.current
    const menu = shapeMenuRef.current
    if (btn && menu) {
      const rect = btn.getBoundingClientRect()
      const menuH = menu.offsetHeight || 52
      const menuW = menu.offsetWidth || 320
      const above = rect.top > menuH + 16
      const nextTop = above ? rect.top - menuH - 8 : rect.bottom + 8
      let nextLeft = rect.left
      if (nextLeft + menuW > window.innerWidth - 8) nextLeft = window.innerWidth - menuW - 8
      if (nextLeft < 8) nextLeft = 8
      menu.style.top = `${nextTop}px`
      menu.style.left = `${nextLeft}px`
    }
    shapeMenuRafRef.current = requestAnimationFrame(syncShapeMenu)
  }, [])

  const startShapeMenuSync = useCallback(() => {
    if (shapeMenuRafRef.current || shapeMenuSyncQueuedRef.current) return
    shapeMenuSyncQueuedRef.current = true
    void Promise.resolve().then(() => {
      shapeMenuSyncQueuedRef.current = false
      if (shapeMenuRafRef.current) return
      if (modelRef.current !== 'shape' || !drawingRef.current) return
      shapeMenuRafRef.current = requestAnimationFrame(syncShapeMenu)
    })
  }, [syncShapeMenu])

  useEffect(() => {
    if (writingBoardModel === 'shape' && drawing) startShapeMenuSync()
    else if (shapeMenuRafRef.current) {
      cancelAnimationFrame(shapeMenuRafRef.current)
      shapeMenuRafRef.current = 0
    }
  }, [writingBoardModel, drawing, startShapeMenuSync])

  useEffect(() => {
    if (!drawing) setSizePopoverType('')
  }, [drawing])

  const broadcastWritingBoard = useCallback((dataURL: string) => {
    syncChannelRef.current?.postMessage({
      type: 'WRITING_BOARD_UPDATE',
      dataURL,
      blackboard: blackboardRef.current,
    })
  }, [])

  const clearCanvas = () => {
    writingBoardRef.current!.clearCanvas()
    broadcastWritingBoard('')
  }

  const changePaint = (paint: InkPaint) => {
    if (writingBoardModel === 'eraser') setWritingBoardModel('pen')
    setWritingBoardPaint(paint)
  }

  const handleHistoryChange = (payload: { canUndo: boolean; canRedo: boolean }) => {
    setCanUndo(payload.canUndo)
    setCanRedo(payload.canRedo)
  }

  const undo = () => {
    if (!canUndo) return
    writingBoardRef.current?.undo()
  }

  const redo = () => {
    if (!canRedo) return
    writingBoardRef.current?.redo()
  }
  const undoRef = useRef(undo)
  const redoRef = useRef(redo)
  undoRef.current = undo
  redoRef.current = redo

  useEffect(() => {
    const syncChannel = new BroadcastChannel(AUDIENCE_SYNC_CHANNEL)
    syncChannelRef.current = syncChannel
    syncChannel.onmessage = ({ data }) => {
      if (data.type === 'REQUEST_WRITING_BOARD') {
        const dataURL = writingBoardRef.current?.getImageDataURL() || ''
        broadcastWritingBoard(dataURL)
      }
    }

    const handleHistoryHotkey = (e: KeyboardEvent) => {
      const ctrlOrMeta = e.ctrlKey || e.metaKey
      if (!ctrlOrMeta) return
      const key = e.key.toUpperCase()
      if (key === KEYS.Z) {
        e.preventDefault()
        e.stopPropagation()
        if (e.shiftKey) redoRef.current()
        else undoRef.current()
      }
      else if (key === KEYS.Y) {
        e.preventDefault()
        e.stopPropagation()
        redoRef.current()
      }
    }

    const target = resolveFikaPortalTarget(toolRootRef.current)
    setShapeMenuPortal(target === document.body ? toolRootRef.current : target)
    window.addEventListener('keydown', handleHistoryHotkey, true)

    return () => {
      if (shapeMenuRafRef.current) cancelAnimationFrame(shapeMenuRafRef.current)
      window.removeEventListener('keydown', handleHistoryHotkey, true)
      syncChannel.postMessage({ type: 'WRITING_BOARD_CLOSE' })
      syncChannel.close()
      syncChannelRef.current = null
    }
  }, [broadcastWritingBoard])

  const hideSizePopover = useCallback(() => setSizePopoverType(''), [])

  const closeWritingBoard = () => {
    syncChannelRef.current?.postMessage({ type: 'WRITING_BOARD_CLOSE' })
    onClose?.()
  }

  useEffect(() => {
    if (!currentSlide?.id) return
    db.writingBoardImgs.where('id').equals(currentSlide.id).toArray().then(ret => {
      const currentImg = ret[0]
      const dataURL = currentImg?.dataURL || ''
      writingBoardRef.current?.setImageDataURL(dataURL)
      broadcastWritingBoard(dataURL)
    })
  }, [currentSlide?.id, broadcastWritingBoard])

  useEffect(() => {
    const dataURL = writingBoardRef.current?.getImageDataURL() || ''
    broadcastWritingBoard(dataURL)
  }, [blackboard, broadcastWritingBoard])

  const handleWritingEnd = () => {
    const board = writingBoardRef.current
    if (!board) return
    requestAnimationFrame(() => {
      const dataURL = board.getImageDataURL()
      if (!dataURL) return
      broadcastWritingBoard(dataURL)
      const slideId = currentSlide.id
      db.writingBoardImgs.where('id').equals(slideId).toArray().then(ret => {
        const currentImg = ret[0]
        if (currentImg) db.writingBoardImgs.update(currentImg, { dataURL })
        else db.writingBoardImgs.add({ id: slideId, dataURL })
      })
    })
  }

  return (
    <div className={cx('writing-board-tool')} ref={toolRootRef}>
      <div
        className={cx('writing-board-wrap')}
        style={{
          width: slideWidth + 'px',
          height: slideHeight + 'px',
          pointerEvents: drawing ? 'auto' : 'none',
        }}
      >
        <WritingBoard
          ref={writingBoardRef}
          paint={writingBoardPaint}
          blackboard={blackboard}
          model={writingBoardModel}
          penSize={penSize}
          markSize={markSize}
          rubberSize={rubberSize}
          shapeSize={shapeSize}
          shapeType={shapeType}
          interactive={drawing}
          onEnd={handleWritingEnd}
          onHistoryChange={handleHistoryChange}
        />
      </div>

      <div style={{ display: drawing ? undefined : 'none' }}>
      <MoveablePanel
        className={cx('tools-panel')}
        width={680}
        height={50}
        left={left}
        top={top}
      >
        <div className={cx('tools')} onMouseDown={event => event.stopPropagation()}>
          <div className={cx('tool-content')}>
            <Popover
              placement="top"
              trigger="manual"
              value={sizePopoverType === 'pen'}
              onHide={hideSizePopover}
              content={(
                <div className={cx('setting')}>
                  <div className={cx('label')}>{LL.screen.writingBoard.inkThickness()}</div>
                  <Slider className={cx('size-slider')} min={4} max={10} step={2} value={penSize} onUpdateValue={value => { if (typeof value === 'number') setPenSize(value) }} />
                </div>
              )}
            >
              <div className={cx('btn', { active: writingBoardModel === 'pen' })} data-tooltip={LL.screen.writingBoard.pen()} onClick={() => changeModel('pen')}>
                <Icon icon="pencil" className={cx('icon')} />
              </div>
            </Popover>
            <div className={cx('shape-wrap')}>
              <div
                ref={shapeBtnRef}
                className={cx('btn', { active: writingBoardModel === 'shape' })}
                data-tooltip={LL.screen.writingBoard.shape()}
                onClick={() => changeModel('shape')}
              >
                <Icon icon="shapes" className={cx('icon')} />
              </div>
            </div>
            <Popover
              placement="top"
              trigger="manual"
              value={sizePopoverType === 'mark'}
              onHide={hideSizePopover}
              content={(
                <div className={cx('setting')}>
                  <div className={cx('label')}>{LL.screen.writingBoard.inkThickness()}</div>
                  <Slider className={cx('size-slider')} min={16} max={40} step={4} value={markSize} onUpdateValue={value => { if (typeof value === 'number') setMarkSize(value) }} />
                </div>
              )}
            >
              <div className={cx('btn', { active: writingBoardModel === 'mark' })} data-tooltip={LL.screen.writingBoard.highlighter()} onClick={() => changeModel('mark')}>
                <Icon icon="highlighter" className={cx('icon')} />
              </div>
            </Popover>
            <Popover
              placement="top"
              trigger="manual"
              value={sizePopoverType === 'eraser'}
              onHide={hideSizePopover}
              content={(
                <div className={cx('setting')}>
                  <div className={cx('label')}>{LL.screen.writingBoard.eraserSize()}</div>
                  <Slider className={cx('size-slider')} min={20} max={200} step={20} value={rubberSize} onUpdateValue={value => { if (typeof value === 'number') setRubberSize(value) }} />
                </div>
              )}
            >
              <div className={cx('btn', { active: writingBoardModel === 'eraser' })} data-tooltip={LL.screen.writingBoard.eraser()} onClick={() => changeModel('eraser')}>
                <Icon icon="eraser" className={cx('icon')} />
              </div>
            </Popover>
            <div className={cx('btn', { disabled: !canUndo })} data-tooltip={LL.screen.writingBoard.undoTooltip()} onClick={undo}>
              <Icon icon="undo-2" className={cx('icon')} />
            </div>
            <div className={cx('btn', { disabled: !canRedo })} data-tooltip={LL.screen.writingBoard.redoTooltip()} onClick={redo}>
              <Icon icon="redo-2" className={cx('icon')} />
            </div>
            <div className={cx('btn')} data-tooltip={LL.screen.writingBoard.clearInk()} onClick={clearCanvas}>
              <Icon icon="trash-2" className={cx('icon')} />
            </div>
            <div className={cx('btn', { active: blackboard })} data-tooltip={LL.screen.writingBoard.blackboard()} onClick={() => setBlackboard(!blackboard)}>
              <Icon icon="paint-bucket" className={cx('icon')} />
            </div>
            <InkPaintSwatches paint={writingBoardPaint} variant="square" onUpdatePaint={changePaint} />
          </div>
          <div className={cx('btn', 'close')} data-tooltip={LL.screen.writingBoard.closePen()} onClick={closeWritingBoard}>
            <Icon icon="x" className={cx('icon')} />
          </div>
        </div>
      </MoveablePanel>
      </div>

      {shapeMenuPortal ? createPortal(
        <div
          style={{ display: drawing && writingBoardModel === 'shape' ? undefined : 'none' }}
          ref={shapeMenuRef}
          className={cx('shape-menu')}
          onMouseDown={event => event.stopPropagation()}
        >
          {SHAPE_OPTIONS.map(shape => (
            <button
              key={shape.type}
              type="button"
              className={cx('shape-btn', { active: shapeType === shape.type })}
              title={shapeLabel(shape.type)}
              onClick={event => { event.stopPropagation(); pickShape(shape.type) }}
            >
              <Icon icon={shape.icon} className={cx('icon')} />
            </button>
          ))}
          <Divider type="vertical" />
          <div className={cx('label')}>{LL.screen.writingBoard.inkThickness()}</div>
          <Slider className={cx('size-slider')} min={2} max={8} step={2} value={shapeSize} onUpdateValue={value => { if (typeof value === 'number') setShapeSize(value) }} />
        </div>,
        shapeMenuPortal,
      ) : null}
    </div>
  )
}
