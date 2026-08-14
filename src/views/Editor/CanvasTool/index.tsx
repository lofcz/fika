import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useState, useEffect, useCallback, useMemo, memo, type CSSProperties, type MutableRefObject, type WheelEvent } from 'react'
import { OverlayScrollbars } from 'overlayscrollbars'
import { useMainStore, useSlidesStore, useSnapshotStore, selectCanUndo, selectCanRedo } from '@/store'
import type { ShapePoolItem } from '@/configs/shapes'
import type { LinePoolItem } from '@/configs/lines'
import type { CustomShapeDrawMode } from '@/types/edit'
import type { PPTShapeElement } from '@/types/slides'
import { queryFika } from '@/utils/portal'
import { clampCanvasZoom, displayedZoomPercent, getPendingZoom, occupancyForDisplayedZoom, occupancyForTargetZoom, setPendingZoom, stepCanvasZoom } from '@/utils/canvasZoom'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useCreateElement from '@/hooks/useCreateElement'
import ShapePool from './ShapePool'
import ChartPool from './ChartPool'
import TableGenerator from './TableGenerator'
import SymbolPool from './SymbolPool'
import MediaPicker from './MediaPicker'
import SVGPathEditor from './SVGPathEditor'
import { LazyLaTeXEditor, prefetchLaTeXEditor } from '@/components/LaTeXEditor/lazy'
import { LazyCodeEditor, prefetchCodeEditor } from '@/components/CodeEditor/lazy'
import { LazyMermaidEditor, prefetchMermaidEditor } from '@/components/MermaidEditor/lazy'
import type { LatexResult } from '@/components/LaTeXEditor/index'
import type { CodeEditorPayload } from '@/configs/code'
import Modal from '@/components/Modal'
import { OverlayTrigger } from '@/components/OverlayTrigger'
import Popover from '@/components/Popover'
import PopoverMenuItem from '@/components/PopoverMenuItem'
import { useI18nContext } from '@/i18n/useI18nContext'
import 'overlayscrollbars/overlayscrollbars.css'

type CreateElementApi = ReturnType<typeof useCreateElement>

function applyDisplayedZoom(targetZoom: number) {
  const main = useMainStore.getState()
  const slides = useSlidesStore.getState()
  const clamped = clampCanvasZoom(targetZoom)
  setPendingZoom(clamped)
  const canvas = queryFika<HTMLElement>('.canvas')
  const next = canvas
    ? occupancyForTargetZoom(clamped, canvas.clientWidth, canvas.clientHeight, slides.viewportSize, slides.viewportRatio)
    : occupancyForDisplayedZoom(clamped, main.canvasScale, main.canvasPercentage)
  if (Number.isFinite(next)) main.setCanvasPercentage(next)
  void Promise.resolve().then(() => {
    const pending = getPendingZoom()
    if (pending != null && Math.abs(pending - useMainStore.getState().canvasScale * 100) < 0.51) {
      setPendingZoom(null)
    }
  })
}

function scaleCanvas(command: '+' | '-') {
  setPendingZoom(null)
  const canvasScale = useMainStore.getState().canvasScale
  applyDisplayedZoom(stepCanvasZoom(displayedZoomPercent(canvasScale), command === '+' ? 1 : -1))
}

function setCanvasScalePercentage(value: number) {
  setPendingZoom(null)
  applyDisplayedZoom(value)
}

function resetCanvas() {
  const main = useMainStore.getState()
  setPendingZoom(null)
  main.setCanvasPercentage(90)
  if (main.canvasDragged) {
    main.setCanvasDragged(false)
  }
  else {
    main.setCanvasDragged(true)
    main.setCanvasDragged(false)
  }
}

function CreateElementApiBinder({ apiRef }: { apiRef: MutableRefObject<CreateElementApi | null> }) {
  apiRef.current = useCreateElement()
  return null
}

const CanvasTool = memo(function CanvasTool({ className, style }: { className?: string; style?: CSSProperties }) {
  const { LL } = useI18nContext()

  const creatingElementType = useMainStore(s => s.creatingElement?.type ?? null)
  const creatingCustomShape = useMainStore(s => !!s.creatingCustomShape)
  const showSelectPanel = useMainStore(s => s.showSelectPanel)
  const showSearchPanel = useMainStore(s => s.showSearchPanel)
  const showNotesPanel = useMainStore(s => s.showNotesPanel)
  const canvasScale = useMainStore(s => s.canvasScale)
  const canUndo = useSnapshotStore(selectCanUndo)
  const canRedo = useSnapshotStore(selectCanRedo)
  const canvasScalePercentage = displayedZoomPercent(canvasScale) + '%'

  const { redo, undo } = useHistorySnapshot()
  const createApiRef = useRef<CreateElementApi | null>(null)

  const canvasScalePresetList = [200, 150, 125, 100, 75, 50]
  const [canvasScaleVisible, setCanvasScaleVisible] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [isScrollable, setIsScrollable] = useState(false)
  const [moreVisible, setMoreVisible] = useState(false)
  const moreVisibleRef = useRef(moreVisible)
  moreVisibleRef.current = moreVisible
  const scrollbarsRef = useRef<ReturnType<typeof OverlayScrollbars> | null>(null)

  const hasHorizontalOverflow = () => {
    if (!scrollRef.current || !contentRef.current) return false
    return contentRef.current.scrollWidth > scrollRef.current.clientWidth + 1
  }

  const getScrollViewport = () => scrollbarsRef.current?.elements().viewport ?? scrollRef.current

  const handleWheel = (event: WheelEvent) => {
    if (!isScrollable) return
    const viewport = getScrollViewport()
    if (!viewport) return

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) return

    event.preventDefault()
    event.stopPropagation()
    viewport.scrollLeft += delta
  }

  useEffect(() => {
    const updateScrollbars = () => {
      queueMicrotask(() => {
        if (moreVisibleRef.current && (scrollRef.current?.clientWidth ?? 0) > 640) {
          setMoreVisible(false)
        }

        const overflowing = hasHorizontalOverflow()
        setIsScrollable(overflowing)

        if (overflowing) {
          if (!scrollbarsRef.current && scrollRef.current) {
            scrollbarsRef.current = OverlayScrollbars(scrollRef.current, {
              overflow: {
                x: 'scroll',
                y: 'hidden',
              },
              scrollbars: {
                visibility: 'auto',
                autoHide: 'leave',
                autoHideDelay: 300,
              },
            })
          }
          else scrollbarsRef.current?.update(true)
        }
        else if (scrollbarsRef.current) {
          scrollbarsRef.current.destroy()
          scrollbarsRef.current = null
        }
      })
    }

    const resizeObserver = new ResizeObserver(updateScrollbars)
    if (scrollRef.current) resizeObserver.observe(scrollRef.current)
    if (contentRef.current) resizeObserver.observe(contentRef.current)
    updateScrollbars()

    return () => {
      resizeObserver.disconnect()
      scrollbarsRef.current?.destroy()
      scrollbarsRef.current = null
    }
  }, [])

  const applyCanvasPresetScale = (value: number) => {
    setCanvasScalePercentage(value)
    setCanvasScaleVisible(false)
  }

  const [shapePoolVisible, setShapePoolVisible] = useState(false)
  const [chartPoolVisible, setChartPoolVisible] = useState(false)
  const [tableGeneratorVisible, setTableGeneratorVisible] = useState(false)
  const [symbolPoolVisible, setSymbolPoolVisible] = useState(false)
  const [mediaPickerVisible, setMediaPickerVisible] = useState(false)
  const [latexEditorVisible, setLatexEditorVisible] = useState(false)
  const [mermaidEditorVisible, setMermaidEditorVisible] = useState(false)
  const [codeEditorVisible, setCodeEditorVisible] = useState(false)
  const [svgPathEditorVisible, setSvgPathEditorVisible] = useState(false)
  const [textTypeSelectVisible, setTextTypeSelectVisible] = useState(false)

  const drawText = useCallback((vertical = false) => {
    useMainStore.getState().setCreatingCustomShapeState(null)
    useMainStore.getState().setCreatingElement({
      type: 'text',
      vertical,
    })
  }, [])

  const drawShape = useCallback((shape: ShapePoolItem) => {
    useMainStore.getState().setCreatingCustomShapeState(null)
    useMainStore.getState().setCreatingElement({
      type: 'shape',
      data: shape,
    })
    setShapePoolVisible(false)
  }, [])
  const drawCustomShape = useCallback((mode: CustomShapeDrawMode) => {
    useMainStore.getState().setCreatingElement(null)
    useMainStore.getState().setCreatingCustomShapeState(mode)
    setShapePoolVisible(false)
  }, [])
  const openPathEditor = useCallback(() => {
    setSvgPathEditorVisible(true)
    setShapePoolVisible(false)
  }, [])
  const onScribble = useCallback(() => drawCustomShape('scribble'), [drawCustomShape])
  const onPolygon = useCallback(() => drawCustomShape('polygon'), [drawCustomShape])
  const drawLine = useCallback((line: LinePoolItem) => {
    useMainStore.getState().setCreatingCustomShapeState(null)
    useMainStore.getState().setCreatingElement({
      type: 'line',
      data: line,
    })
    setShapePoolVisible(false)
  }, [])
  const shapePoolContent = useMemo(() => (
    <ShapePool
      onSelect={drawShape}
      onSelectLine={drawLine}
      onScribble={onScribble}
      onPolygon={onPolygon}
      onPathDraw={openPathEditor}
    />
  ), [drawShape, drawLine, onScribble, onPolygon, openPathEditor])
  const chartPoolContent = useMemo(() => (
    <ChartPool onSelect={chart => { createApiRef.current?.createChartElement(chart); setChartPoolVisible(false) }} />
  ), [])
  const closeTableGenerator = useCallback(() => setTableGeneratorVisible(false), [])
  const tableGeneratorContent = useMemo(() => (
    <TableGenerator
      onClose={closeTableGenerator}
      onInsert={({ row, col }) => { createApiRef.current?.createTableElement(row, col); setTableGeneratorVisible(false) }}
    />
  ), [closeTableGenerator])
  const symbolPoolContent = useMemo(() => (
    <SymbolPool onSelect={() => setSymbolPoolVisible(false)} />
  ), [])
  const closeLatexEditor = useCallback(() => setLatexEditorVisible(false), [])
  const updateLatexEditor = useCallback((data: LatexResult) => {
    createApiRef.current?.createLatexElement(data)
    setLatexEditorVisible(false)
  }, [])
  const closeMermaidEditor = useCallback(() => setMermaidEditorVisible(false), [])
  const updateMermaidEditor = useCallback((code: string) => {
    createApiRef.current?.createMermaidElement(code)
    setMermaidEditorVisible(false)
  }, [])
  const closeCodeEditor = useCallback(() => setCodeEditorVisible(false), [])
  const updateCodeEditor = useCallback((data: CodeEditorPayload) => {
    createApiRef.current?.createCodeElement(data)
    setCodeEditorVisible(false)
  }, [])
  const closeMediaPicker = useCallback(() => setMediaPickerVisible(false), [])
  const closeSvgPathEditor = useCallback(() => setSvgPathEditorVisible(false), [])
  const insertSvgPath = useCallback((path: string) => {
    const { theme, viewportRatio, viewportSize } = useSlidesStore.getState()
    const width = 400
    const height = 400
    const isClosedPath = /z\s*$/i.test(path)
    const position = {
      width,
      height,
      left: (viewportSize - width) / 2,
      top: (viewportSize * viewportRatio - height) / 2,
    }
    const supplement: Partial<PPTShapeElement> = isClosedPath
      ? { fill: theme.themeColors[0] }
      : {
        fill: 'rgba(0, 0, 0, 0)',
        outline: {
          width: 2,
          color: theme.themeColors[0],
          style: 'solid',
        },
      }

    createApiRef.current?.createShapeElement(position, {
      path,
      viewBox: [width, height],
    }, supplement)
    setSvgPathEditorVisible(false)
  }, [])

  const toggleSelectPanel = () => {
    const main = useMainStore.getState()
    main.setSelectPanelState(!main.showSelectPanel)
  }

  const toggleSraechPanel = () => {
    const main = useMainStore.getState()
    main.setSearchPanelState(!main.showSearchPanel)
  }

  const toggleNotesPanel = () => {
    const main = useMainStore.getState()
    main.setNotesPanelState(!main.showNotesPanel)
  }

  const moreMenuContent = useMemo(() => (
    <>
      <PopoverMenuItem onClick={() => { toggleNotesPanel(); setMoreVisible(false) }}>
        <Icon icon="message-square" className={cx('icon')} />
        {LL.editor.canvasTool.notesPanel()}
      </PopoverMenuItem>
      <PopoverMenuItem onClick={() => { toggleSelectPanel(); setMoreVisible(false) }}>
        <Icon icon="mouse-pointer-2" className={cx('icon')} />
        {LL.editor.canvasTool.selectionPane()}
      </PopoverMenuItem>
      <PopoverMenuItem onClick={() => { toggleSraechPanel(); setMoreVisible(false) }}>
        <Icon icon="search" className={cx('icon')} />
        {LL.editor.canvasTool.findReplace()}
      </PopoverMenuItem>
    </>
  ), [LL])

  const textTypeContent = useMemo(() => (
    <>
      <PopoverMenuItem onClick={() => { drawText(); setTextTypeSelectVisible(false) }}>
        <Icon icon="baseline" className={cx('icon')} />
        {' '}
        {LL.editor.canvasTool.horizontalTextBox()}
      </PopoverMenuItem>
      <PopoverMenuItem onClick={() => { drawText(true); setTextTypeSelectVisible(false) }}>
        <Icon icon="baseline" className={cx('icon')} style={{ transform: 'rotate(90deg)' }} />
        {' '}
        {LL.editor.canvasTool.verticalTextBox()}
      </PopoverMenuItem>
    </>
  ), [LL, drawText])

  const zoomMenuContent = useMemo(() => (
    <>
      {canvasScalePresetList.map(item => (
        <PopoverMenuItem key={item} onClick={() => applyCanvasPresetScale(item)}>
          {item}%
        </PopoverMenuItem>
      ))}
      <PopoverMenuItem onClick={() => { resetCanvas(); setCanvasScaleVisible(false) }}>
        {LL.editor.canvasTool.fitScreen()}
      </PopoverMenuItem>
    </>
  ), [LL])

  return (
    <div
      ref={scrollRef}
      className={cx('canvas-tool', className, { scrollable: isScrollable })}
      style={style}
      onWheel={handleWheel}
    >
      <div ref={contentRef} className={cx('canvas-tool-content')}>
        <div className={cx('left-handler')}>
          <div className={cx('tool-cluster')}>
            <span
              className={cx('handler-item', { disable: !canUndo })}
              data-canvas-tool="undo"
              data-tooltip={LL.editor.canvasTool.undoTooltip()}
              onClick={() => { canUndo && undo() }}
            >
              <Icon icon="undo-2" />
            </span>
            <span
              className={cx('handler-item', { disable: !canRedo })}
              data-canvas-tool="redo"
              data-tooltip={LL.editor.canvasTool.redoTooltip()}
              onClick={() => { canRedo && redo() }}
            >
              <Icon icon="redo-2" />
            </span>
          </div>
          <div className={cx('tool-cluster', 'more')}>
            <Popover
              className="more-icon"
              trigger="click"
              placement="bottom"
              value={moreVisible}
              onUpdateValue={setMoreVisible}
              offset={10}
              content={moreMenuContent}
            >
              <span className={cx('handler-item')}>
                <Icon icon="ellipsis" />
              </span>
            </Popover>
            <span
              className={cx('handler-item', { active: showNotesPanel })}
              data-tooltip={LL.editor.canvasTool.notesPanel()}
              onClick={() => toggleNotesPanel()}
            >
              <Icon icon="message-square" />
            </span>
            <span
              className={cx('handler-item', { active: showSelectPanel })}
              data-tooltip={LL.editor.canvasTool.selectionPane()}
              onClick={() => toggleSelectPanel()}
            >
              <Icon icon="mouse-pointer-2" />
            </span>
            <span
              className={cx('handler-item', { active: showSearchPanel })}
              data-tooltip={LL.editor.canvasTool.findReplaceTooltip()}
              onClick={() => toggleSraechPanel()}
            >
              <Icon icon="search" />
            </span>
          </div>
        </div>

        <div className={cx('add-element-handler', 'tool-cluster')}>
          <OverlayTrigger>
            <div
              className={cx('insert-handler-item', 'group-btn', { active: creatingElementType === 'text' })}
              data-canvas-tool="insert-text"
              data-tooltip={LL.editor.canvasTool.insertText()}
            >
              <div className={cx('group-btn-main')} onClick={() => drawText()}>
                <Icon icon="type" className={cx('icon')} />
                {' '}
                <span className={cx('text')}>{LL.editor.canvasTool.textBox()}</span>
              </div>

              <Popover
                trigger="click"
                placement="bottom"
                anchorParent
                value={textTypeSelectVisible}
                onUpdateValue={setTextTypeSelectVisible}
                style={{ height: '100%' }}
                offset={10}
                content={textTypeContent}
              >
                <span className={cx('arrow')}><Icon icon="chevron-down" /></span>
              </Popover>
            </div>
          </OverlayTrigger>
          <Popover
            trigger="click"
            placement="bottom"
            value={shapePoolVisible}
            onUpdateValue={setShapePoolVisible}
            offset={10}
            content={shapePoolContent}
          >
            <div
              className={cx('insert-handler-item', {
                active: creatingCustomShape || creatingElementType === 'shape' || creatingElementType === 'line',
              })}
              data-canvas-tool="insert-shape"
              data-tooltip={LL.editor.canvasTool.insertShape()}
            >
              <Icon icon="shapes" className={cx('icon')} />
              {' '}
              <span className={cx('text')}>{LL.editor.canvasTool.shape()}</span>
            </div>
          </Popover>
          <OverlayTrigger>
            <div
              className={cx('insert-handler-item')}
              data-canvas-tool="insert-media"
              data-tooltip={LL.editor.canvasTool.insertMedia()}
              onClick={() => setMediaPickerVisible(true)}
            >
              <Icon icon="image" className={cx('icon')} />
              {' '}
              <span className={cx('text')}>{LL.editor.canvasTool.media()}</span>
            </div>
            <Modal
              visible={mediaPickerVisible}
              onUpdateVisible={setMediaPickerVisible}
              width={560}
              closeButton
            >
              <MediaPicker onClose={closeMediaPicker} />
            </Modal>
          </OverlayTrigger>
          <Popover
            trigger="click"
            placement="bottom"
            value={chartPoolVisible}
            onUpdateValue={setChartPoolVisible}
            offset={10}
            content={chartPoolContent}
          >
            <div className={cx('insert-handler-item')} data-canvas-tool="insert-chart" data-tooltip={LL.editor.canvasTool.insertChart()}>
              <Icon icon="chart-line" className={cx('icon')} />
              {' '}
              <span className={cx('text')}>{LL.editor.canvasTool.chart()}</span>
            </div>
          </Popover>
          <Popover
            trigger="click"
            placement="bottom"
            value={tableGeneratorVisible}
            onUpdateValue={setTableGeneratorVisible}
            offset={10}
            content={tableGeneratorContent}
          >
            <div className={cx('insert-handler-item')} data-canvas-tool="insert-table" data-tooltip={LL.editor.canvasTool.insertTable()}>
              <Icon icon="grid-3x3" className={cx('icon')} />
              {' '}
              <span className={cx('text')}>{LL.editor.canvasTool.table()}</span>
            </div>
          </Popover>
          <OverlayTrigger>
            <div
              className={cx('insert-handler-item')}
              data-canvas-tool="insert-formula"
              data-tooltip={LL.editor.canvasTool.insertFormula()}
              onPointerEnter={prefetchLaTeXEditor}
              onClick={() => setLatexEditorVisible(true)}
            >
              <Icon icon="radical" className={cx('icon')} />
              {' '}
              <span className={cx('text')}>{LL.editor.canvasTool.formula()}</span>
            </div>
            <Modal
              visible={latexEditorVisible}
              onUpdateVisible={setLatexEditorVisible}
              width={520}
            >
              <LazyLaTeXEditor
                onClose={closeLatexEditor}
                onUpdate={updateLatexEditor}
              />
            </Modal>
          </OverlayTrigger>
          <OverlayTrigger>
            <div
              className={cx('insert-handler-item')}
              data-canvas-tool="insert-mermaid"
              data-tooltip={LL.editor.canvasTool.insertMermaid()}
              onPointerEnter={prefetchMermaidEditor}
              onClick={() => setMermaidEditorVisible(true)}
            >
              <Icon icon="git-branch" className={cx('icon')} />
              {' '}
              <span className={cx('text')}>{LL.editor.canvasTool.mermaid()}</span>
            </div>
            <Modal visible={mermaidEditorVisible} onUpdateVisible={setMermaidEditorVisible} width={880}>
              <LazyMermaidEditor
                onClose={closeMermaidEditor}
                onUpdate={updateMermaidEditor}
              />
            </Modal>
          </OverlayTrigger>
          <OverlayTrigger>
            <div
              className={cx('insert-handler-item')}
              data-canvas-tool="insert-code"
              data-tooltip={LL.editor.canvasTool.insertCode()}
              onPointerEnter={prefetchCodeEditor}
              onClick={() => setCodeEditorVisible(true)}
            >
              <Icon icon="code" className={cx('icon')} />
              {' '}
              <span className={cx('text')}>{LL.editor.canvasTool.code()}</span>
            </div>
            <Modal visible={codeEditorVisible} onUpdateVisible={setCodeEditorVisible} width={880}>
              <LazyCodeEditor
                onClose={closeCodeEditor}
                onUpdate={updateCodeEditor}
              />
            </Modal>
          </OverlayTrigger>
          <Popover
            trigger="click"
            placement="bottom"
            value={symbolPoolVisible}
            onUpdateValue={setSymbolPoolVisible}
            offset={10}
            content={symbolPoolContent}
          >
            <div
              className={cx('insert-handler-item')}
              data-canvas-tool="insert-symbol"
              data-tooltip={LL.editor.canvasTool.insertSymbol()}
            >
              <Icon icon="sticker" className={cx('icon')} />
              {' '}
              <span className={cx('text')}>{LL.editor.canvasTool.symbol()}</span>
            </div>
          </Popover>
        </div>

        <div className={cx('right-handler', 'tool-cluster')}>
          <span
            className={cx('handler-item', 'viewport-size')}
            data-tooltip={LL.editor.canvasTool.zoomOutTooltip()}
            onClick={() => scaleCanvas('-')}
          >
            <Icon icon="minus" />
          </span>
          <Popover
            trigger="click"
            placement="bottom"
            value={canvasScaleVisible}
            onUpdateValue={setCanvasScaleVisible}
            content={zoomMenuContent}
          >
            <span className={cx('zoom-value')}>{canvasScalePercentage}</span>
          </Popover>
          <span
            className={cx('handler-item', 'viewport-size')}
            data-tooltip={LL.editor.canvasTool.zoomInTooltip()}
            onClick={() => scaleCanvas('+')}
          >
            <Icon icon="plus" />
          </span>
          <span
            className={cx('handler-item', 'viewport-size-adaptation')}
            data-tooltip={LL.editor.canvasTool.fitScreenTooltip()}
            onClick={() => resetCanvas()}
          >
            <Icon icon="maximize" />
          </span>
        </div>
      </div>

      <Modal
        visible={svgPathEditorVisible}
        onUpdateVisible={setSvgPathEditorVisible}
        width={800}
      >
        <SVGPathEditor
          onClose={closeSvgPathEditor}
          onInsert={insertSvgPath}
        />
      </Modal>
      <CreateElementApiBinder apiRef={createApiRef} />
    </div>
  )
})

export default CanvasTool
