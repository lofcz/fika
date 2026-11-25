import { FixedTextCreationContext } from '@/hooks/textCreationDefaults'
import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useEffect, useMemo, useRef, useState, Suspense, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef, type Layout, type LayoutChangedMeta, type PanelSize } from 'react-resizable-panels'

import { useMainStore, useSlidesStore, useImportConfirmStore } from '@/store'
import useGlobalHotkey from '@/hooks/useGlobalHotkey'
import usePasteEvent from '@/hooks/usePasteEvent'
import { useI18nContext } from '@/i18n/useI18nContext'
import emitter, { EmitterEvents, type OpenInlineMathPayload } from '@/utils/emitter'
import EditorHeader from './EditorHeader/index'
import Canvas from './Canvas/index'
import CanvasTool from './CanvasTool/index'
import Thumbnails from './Thumbnails/index'
import Toolbar from './Toolbar/index'
import Remark from './Remark/index'
import JobProgressOverlay from '@/components/JobProgressOverlay'
import { createRetryableLazy, LazyChunkBoundary } from '@/components/LazyChunkBoundary'
import NotesPanel from './NotesPanel'
import Modal from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { getEnabledExportTabs } from '@/configs/exportTabs'
import { PREVIEW_DEFAULT_PANE, PREVIEW_MAX_PANE, PREVIEW_MIN_PANE, setPreviewPaneWidth, setPreviewViewportRatio } from './Thumbnails/paneSize'
import { clampRightPaneWidth, readRightPanePreference, readRightPaneWidth, RIGHT_PANE_MAX, RIGHT_PANE_MIN, scalePreferredPx, scaleRightPaneWidth, writeRightPaneWidth, type PaneSizePreference } from './Toolbar/paneSize'
import { ensureMathStylesForSlides, mathReady } from '@/utils/math'

const clampLeftPaneWidth = (width: number) => (
  Math.round(Math.min(PREVIEW_MAX_PANE, Math.max(PREVIEW_MIN_PANE, width)))
)

const onThumbsResize = (size: PanelSize) => {
  setPreviewPaneWidth(size.inPixels)
}

const exportDialogLazy = createRetryableLazy(() => import('./ExportDialog/index'))
const mynaWorkspaceLazy = createRetryableLazy(() => import('../Myna/MynaWorkspace'))
const chartDataEditorDialogLazy = createRetryableLazy(() => import('./ChartDataEditorDialog'))
const latexEditorDialogLazy = createRetryableLazy(() => import('./LatexEditorDialog'))
const mermaidEditorDialogLazy = createRetryableLazy(() => import('./MermaidEditorDialog'))
const codeEditorDialogLazy = createRetryableLazy(() => import('./CodeEditorDialog'))
const inlineMathEditorDialogLazy = createRetryableLazy(() => import('./InlineMathEditorDialog'))
const imageReplaceDialogLazy = createRetryableLazy(() => import('./ImageReplaceDialog'))
const importReplaceDialogLazy = createRetryableLazy(() => import('./ImportReplaceDialog'))
const selectPanelLazy = createRetryableLazy(() => import('./SelectPanel'))
const searchPanelLazy = createRetryableLazy(() => import('./SearchPanel'))
const markupPanelLazy = createRetryableLazy(() => import('./MarkupPanel'))
const slideCodePanelLazy = createRetryableLazy(() => import('./SlideCodePanel'))

const ExportDialog = exportDialogLazy.Component
const MynaWorkspace = mynaWorkspaceLazy.Component
const ChartDataEditorDialog = chartDataEditorDialogLazy.Component
const LatexEditorDialog = latexEditorDialogLazy.Component
const MermaidEditorDialog = mermaidEditorDialogLazy.Component
const CodeEditorDialog = codeEditorDialogLazy.Component
const InlineMathEditorDialog = inlineMathEditorDialogLazy.Component
const ImageReplaceDialog = imageReplaceDialogLazy.Component
const ImportReplaceDialog = importReplaceDialogLazy.Component
const SelectPanel = selectPanelLazy.Component
const SearchPanel = searchPanelLazy.Component
const MarkupPanel = markupPanelLazy.Component
const SlideCodePanel = slideCodePanelLazy.Component

const onImportReplaceChunkError = () => {
  importReplaceDialogLazy.reset()
  if (useImportConfirmStore.getState().visible) {
    useImportConfirmStore.getState().settle(null)
  }
}

/**
 * Mount heavy modal dialogs only after their first open request so initial
 * editor render avoids loading lazy dialog chunks, mounting hidden portals,
 * and subscribing closed dialogs to selection/slide store updates.
 */
const EditorDialogs = memo(() => {
  const importConfirmVisible = useImportConfirmStore(s => s.visible)
  const [chartReq, setChartReq] = useState<{ seq: number } | null>(null)
  const [latexReq, setLatexReq] = useState<{ seq: number } | null>(null)
  const [mermaidReq, setMermaidReq] = useState<{ seq: number; elementId: string } | null>(null)
  const [codeReq, setCodeReq] = useState<{ seq: number; elementId: string } | null>(null)
  const [inlineMathReq, setInlineMathReq] = useState<{ seq: number; payload: OpenInlineMathPayload } | null>(null)
  const [imageReplaceReq, setImageReplaceReq] = useState<{ seq: number; elementId: string } | null>(null)

  useEffect(() => {
    const unregister = useImportConfirmStore.getState().register()
    const onChart = () => setChartReq(prev => ({ seq: (prev?.seq ?? 0) + 1 }))
    const onLatex = () => setLatexReq(prev => ({ seq: (prev?.seq ?? 0) + 1 }))
    const onMermaid = (elementId: string) => setMermaidReq(prev => ({ seq: (prev?.seq ?? 0) + 1, elementId }))
    const onCode = (elementId: string) => setCodeReq(prev => ({ seq: (prev?.seq ?? 0) + 1, elementId }))
    const onInlineMath = (payload: OpenInlineMathPayload) => setInlineMathReq(prev => ({ seq: (prev?.seq ?? 0) + 1, payload }))
    const onImageReplace = (elementId: string) => setImageReplaceReq(prev => ({ seq: (prev?.seq ?? 0) + 1, elementId }))

    emitter.on(EmitterEvents.OPEN_CHART_DATA_EDITOR, onChart)
    emitter.on(EmitterEvents.OPEN_LATEX_EDITOR, onLatex)
    emitter.on(EmitterEvents.OPEN_MERMAID_EDITOR, onMermaid)
    emitter.on(EmitterEvents.OPEN_CODE_EDITOR, onCode)
    emitter.on(EmitterEvents.OPEN_INLINE_MATH_EDITOR, onInlineMath)
    emitter.on(EmitterEvents.OPEN_IMAGE_REPLACE_DIALOG, onImageReplace)

    return () => {
      unregister()
      if (useImportConfirmStore.getState().visible) {
        useImportConfirmStore.getState().settle(null)
      }
      useMainStore.getState().setDisableHotkeysState(false)
      emitter.off(EmitterEvents.OPEN_CHART_DATA_EDITOR, onChart)
      emitter.off(EmitterEvents.OPEN_LATEX_EDITOR, onLatex)
      emitter.off(EmitterEvents.OPEN_MERMAID_EDITOR, onMermaid)
      emitter.off(EmitterEvents.OPEN_CODE_EDITOR, onCode)
      emitter.off(EmitterEvents.OPEN_INLINE_MATH_EDITOR, onInlineMath)
      emitter.off(EmitterEvents.OPEN_IMAGE_REPLACE_DIALOG, onImageReplace)
    }
  }, [])

  return (
    <>
      {chartReq !== null ? (
        <LazyChunkBoundary
          onRetry={chartDataEditorDialogLazy.reset}
          onError={chartDataEditorDialogLazy.reset}
          resetKey={chartReq.seq}
          fallback={null}
        >
          <Suspense fallback={null}>
            <ChartDataEditorDialog request={chartReq} />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      {latexReq !== null ? (
        <LazyChunkBoundary
          onRetry={latexEditorDialogLazy.reset}
          onError={latexEditorDialogLazy.reset}
          resetKey={latexReq.seq}
          fallback={null}
        >
          <Suspense fallback={null}>
            <LatexEditorDialog request={latexReq} />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      {mermaidReq !== null ? (
        <LazyChunkBoundary
          onRetry={mermaidEditorDialogLazy.reset}
          onError={mermaidEditorDialogLazy.reset}
          resetKey={mermaidReq.seq}
          fallback={null}
        >
          <Suspense fallback={null}>
            <MermaidEditorDialog request={mermaidReq} />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      {codeReq !== null ? (
        <LazyChunkBoundary
          onRetry={codeEditorDialogLazy.reset}
          onError={codeEditorDialogLazy.reset}
          resetKey={codeReq.seq}
          fallback={null}
        >
          <Suspense fallback={null}>
            <CodeEditorDialog request={codeReq} />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      {inlineMathReq !== null ? (
        <LazyChunkBoundary
          onRetry={inlineMathEditorDialogLazy.reset}
          onError={inlineMathEditorDialogLazy.reset}
          resetKey={inlineMathReq.seq}
          fallback={null}
        >
          <Suspense fallback={null}>
            <InlineMathEditorDialog request={inlineMathReq} />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      {imageReplaceReq !== null ? (
        <LazyChunkBoundary
          onRetry={imageReplaceDialogLazy.reset}
          onError={imageReplaceDialogLazy.reset}
          resetKey={imageReplaceReq.seq}
          fallback={null}
        >
          <Suspense fallback={null}>
            <ImageReplaceDialog request={imageReplaceReq} />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      {importConfirmVisible ? (
        <LazyChunkBoundary
          onRetry={importReplaceDialogLazy.reset}
          onError={onImportReplaceChunkError}
          resetKey={importConfirmVisible}
          fallback={null}
        >
          <Suspense fallback={null}>
            <ImportReplaceDialog skipRegister />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
    </>
  )
})

const DEFAULT_CODE_PANEL_HEIGHT = 180
const NARROW_RIGHT_PANEL_PX = 1100

const measureHostWidth = (editorRoot?: HTMLElement | null) => {
  const embed = editorRoot?.closest('.fika-embed-root') as HTMLElement | null
  return embed?.clientWidth
    || editorRoot?.clientWidth
    || document.querySelector('.fika-embed-root')?.clientWidth
    || window.innerWidth
}

const syncRightPanelToWidth = (width: number) => {
  useMainStore.getState().applyRightPanelAuto(width, NARROW_RIGHT_PANEL_PX)
}

const Editor = memo(({ myna = false }: { myna?: boolean }) => {
  const dialogForExport = useMainStore(s => s.dialogForExport)
  const showSelectPanel = useMainStore(s => s.showSelectPanel)
  const showSearchPanel = useMainStore(s => s.showSearchPanel)
  const showNotesPanel = useMainStore(s => s.showNotesPanel)
  const showMarkupPanel = useMainStore(s => s.showMarkupPanel)

  const closeExportDialog = useCallback(() => useMainStore.getState().setDialogForExport(''), [])

  const [remarkHeight, setRemarkHeight] = useState(40)
  const [codePanelHeight, setCodePanelHeight] = useState(DEFAULT_CODE_PANEL_HEIGHT)
  const [showCodePanel, setShowCodePanel] = useState(false)
  const [lastCodePanelHeight, setLastCodePanelHeight] = useState(DEFAULT_CODE_PANEL_HEIGHT)

  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const thumbsPanelRef = usePanelRef()
  const leftPanePrefRef = useRef<PaneSizePreference | null>(null)
  const [panelMotionReady, setPanelMotionReady] = useState(false)
  const panelMotionReadyRef = useRef(false)
  const [dockOpen, setDockOpen] = useState(() => {
    syncRightPanelToWidth(measureHostWidth())
    return !useMainStore.getState().rightPanelCollapsed
  })
  const [rightPaneWidth, setRightPaneWidth] = useState(() => readRightPaneWidth(measureHostWidth()))
  const [rightPaneDragging, setRightPaneDragging] = useState(false)
  const [hostResizing, setHostResizing] = useState(false)
  const rightPaneWidthRef = useRef(rightPaneWidth)
  const rightPanePrefRef = useRef<PaneSizePreference | null>(null)
  const rightPaneDraggingRef = useRef(false)
  const hostResizeIdleRef = useRef(0)
  const lastHostWidthRef = useRef(0)
  const applyHostLayoutRef = useRef<(width: number) => void>(() => {})
  const rightPanelCollapsed = useMainStore(s => s.rightPanelCollapsed)
  const readOnly = useMainStore(s => s.readOnly)

  useEffect(() => {
    setDockOpen(!rightPanelCollapsed)
  }, [rightPanelCollapsed])

  useEffect(() => {
    rightPaneWidthRef.current = rightPaneWidth
  }, [rightPaneWidth])

  const measureEditorWidth = () => editorRootRef.current?.clientWidth || measureHostWidth(editorRootRef.current)

  applyHostLayoutRef.current = (width: number) => {
    syncRightPanelToWidth(width)
    if (!rightPanePrefRef.current) {
      rightPanePrefRef.current = readRightPanePreference(width)
    }
    if (!rightPaneDraggingRef.current) {
      const nextRight = scaleRightPaneWidth(rightPanePrefRef.current, width)
      if (nextRight !== rightPaneWidthRef.current) {
        rightPaneWidthRef.current = nextRight
        setRightPaneWidth(nextRight)
      }
    }
    const thumbs = thumbsPanelRef.current
    if (!thumbs) return
    const currentLeft = thumbs.getSize().inPixels
    if (!leftPanePrefRef.current) {
      if (currentLeft > 0) leftPanePrefRef.current = { width: currentLeft, hostWidth: width }
      return
    }
    const nextLeft = clampLeftPaneWidth(scalePreferredPx(leftPanePrefRef.current.width, leftPanePrefRef.current.hostWidth, width))
    if (nextLeft !== currentLeft) thumbs.resize(nextLeft)
  }

  const onRightPaneResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || rightPanelCollapsed) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = rightPaneWidthRef.current
    rightPaneDraggingRef.current = true
    setRightPaneDragging(true)

    const onMove = (moveEvent: PointerEvent) => {
      const hostWidth = editorRootRef.current?.clientWidth
      const next = clampRightPaneWidth(startWidth + (startX - moveEvent.clientX), hostWidth)
      rightPaneWidthRef.current = next
      setRightPaneWidth(next)
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      const hostWidth = editorRootRef.current?.clientWidth
      rightPanePrefRef.current = writeRightPaneWidth(rightPaneWidthRef.current, hostWidth)
      rightPaneDraggingRef.current = false
      setRightPaneDragging(false)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  const openCodePanel = useCallback(() => {
    setCodePanelHeight(lastCodePanelHeight || DEFAULT_CODE_PANEL_HEIGHT)
    setShowCodePanel(true)
  }, [lastCodePanelHeight])

  const closeCodePanel = useCallback(() => {
    if (codePanelHeight > 0) setLastCodePanelHeight(codePanelHeight)
    setShowCodePanel(false)
  }, [codePanelHeight])

  const toggleCodePanel = useCallback(() => {
    if (showCodePanel) closeCodePanel()
    else openCodePanel()
  }, [showCodePanel, closeCodePanel, openCodePanel])

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'fika-editor-main',
    onlySaveAfterUserInteractions: true,
  })
  const onMainLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    onLayoutChanged(layout, meta)
    if (!meta.isUserInteraction) return
    const left = thumbsPanelRef.current?.getSize().inPixels
    const hostWidth = measureEditorWidth()
    if (left && hostWidth > 0) {
      leftPanePrefRef.current = { width: left, hostWidth }
    }
  }
  const { LL } = useI18nContext()
  const importLabels = useMemo(() => ({
    running: LL.editor.import.importing(),
    preparing: LL.editor.import.preparing(),
    finishing: LL.editor.import.applying(),
    slideProgress: LL.editor.import.slideProgress,
  }), [LL])

  useGlobalHotkey()
  usePasteEvent()

  useEffect(() => {
    setPreviewViewportRatio(useSlidesStore.getState().viewportRatio)
    ensureMathStylesForSlides(useSlidesStore.getState().slides)
    const unsubSlides = useSlidesStore.subscribe((state, prev) => {
      if (state.viewportRatio !== prev.viewportRatio) setPreviewViewportRatio(state.viewportRatio)
      if (!mathReady.value && state.slides !== prev.slides) ensureMathStylesForSlides(state.slides)
    })
    const onHostResize = () => {
      if (!panelMotionReadyRef.current) return
      const width = measureEditorWidth()
      if (width === lastHostWidthRef.current) return
      lastHostWidthRef.current = width
      setHostResizing(true)
      window.clearTimeout(hostResizeIdleRef.current)
      hostResizeIdleRef.current = window.setTimeout(() => setHostResizing(false), 120)
      applyHostLayoutRef.current(width)
    }
    window.addEventListener('resize', onHostResize)
    window.visualViewport?.addEventListener('resize', onHostResize)
    lastHostWidthRef.current = measureEditorWidth()
    applyHostLayoutRef.current(lastHostWidthRef.current)
    setDockOpen(!useMainStore.getState().rightPanelCollapsed)
    let cancelled = false
    const enableMotion = () => {
      if (cancelled) return
      panelMotionReadyRef.current = true
      setPanelMotionReady(true)
    }
    requestAnimationFrame(() => requestAnimationFrame(enableMotion))
    const root = editorRootRef.current
    let editorResizeObserver: ResizeObserver | null = null
    if (root && typeof ResizeObserver !== 'undefined') {
      editorResizeObserver = new ResizeObserver(() => {
        if (!panelMotionReadyRef.current) return
        onHostResize()
      })
      editorResizeObserver.observe(root)
    }
    return () => {
      cancelled = true
      unsubSlides()
      editorResizeObserver?.disconnect()
      editorResizeObserver = null
      window.clearTimeout(hostResizeIdleRef.current)
      window.removeEventListener('resize', onHostResize)
      window.visualViewport?.removeEventListener('resize', onHostResize)
    }
  }, [])

  return (
    <>
      <div
        className={cx('fika-editor', { 'right-panel-collapsed': rightPanelCollapsed, 'read-only': readOnly, 'myna-editor': myna })}
        ref={editorRootRef}
        style={{ '--right-pane-width': `${rightPaneWidth}px` } as CSSProperties}
      >
        {!myna ? <EditorHeader className={cx('layout-header')} /> : null}
        {myna ? (
          <LazyChunkBoundary
            onRetry={mynaWorkspaceLazy.reset}
            onError={mynaWorkspaceLazy.reset}
            resetKey={myna}
          >
            <Suspense fallback={null}>
              <MynaWorkspace />
            </Suspense>
          </LazyChunkBoundary>
        ) : <Group
          id="fika-editor-main"
          orientation="horizontal"
          className={cx('layout-content')}
          defaultLayout={defaultLayout}
          onLayoutChanged={onMainLayoutChanged}
          disableCursor
          resizeTargetMinimumSize={{ fine: 8, coarse: 8 }}
        >
          <Panel
            id="thumbs"
            panelRef={thumbsPanelRef}
            className={cx('layout-content-left')}
            defaultSize={PREVIEW_DEFAULT_PANE}
            minSize={PREVIEW_MIN_PANE}
            maxSize={PREVIEW_MAX_PANE}
            groupResizeBehavior="preserve-relative-size"
            onResize={onThumbsResize}
          >
            <Thumbnails />
          </Panel>
          <Separator className={cx('layout-separator')} />
          <Panel
            id="workspace"
            className={cx('layout-workspace')}
            minSize="30%"
            groupResizeBehavior="preserve-relative-size"
          >
          <div className={cx('layout-content-center')}>
            <CanvasTool className={cx('center-top')} />
            <Canvas className={cx('center-body')} />
            {showCodePanel ? (
              <LazyChunkBoundary
                onRetry={slideCodePanelLazy.reset}
                onError={slideCodePanelLazy.reset}
                resetKey={showCodePanel}
                fallback={null}
              >
                <Suspense fallback={null}>
                  <SlideCodePanel
                    className={cx('center-code')}
                    style={{ height: `${codePanelHeight}px` }}
                    height={codePanelHeight}
                    onUpdateHeight={setCodePanelHeight}
                    onClose={closeCodePanel}
                  />
                </Suspense>
              </LazyChunkBoundary>
            ) : null}
            <Remark
              className={cx('center-bottom')}
              style={{ height: `${remarkHeight}px` }}
              height={remarkHeight}
              onUpdateHeight={setRemarkHeight}
              codePanelOpen={showCodePanel}
              onToggleCodePanel={toggleCodePanel}
            />
          </div>
          <div className={cx('right-panel-slot', { docked: dockOpen, instant: !panelMotionReady || rightPaneDragging || hostResizing })}>
            <div
              className={cx('layout-separator', 'right-panel-resizer')}
              role="separator"
              aria-orientation="vertical"
              aria-hidden={rightPanelCollapsed}
              aria-valuemin={RIGHT_PANE_MIN}
              aria-valuemax={RIGHT_PANE_MAX}
              aria-valuenow={rightPaneWidth}
              onPointerDown={onRightPaneResizePointerDown}
            />
            <button
              type="button"
              className={cx('right-panel-toggle', { collapsed: rightPanelCollapsed })}
              title={rightPanelCollapsed ? LL.editor.toolbar.expandPanel() : LL.editor.toolbar.collapsePanel()}
              aria-label={rightPanelCollapsed ? LL.editor.toolbar.expandPanel() : LL.editor.toolbar.collapsePanel()}
              aria-expanded={!rightPanelCollapsed}
              onClick={() => useMainStore.getState().toggleRightPanel()}
            >
              <Icon icon="chevron-left" className={cx('toggle-chevron')} />
            </button>
            <div className={cx('right-panel-clip')}>
              <Toolbar className={cx('layout-content-right')} />
            </div>
          </div>
          </Panel>
        </Group>}
      </div>

      {showSelectPanel ? (
        <LazyChunkBoundary
          onRetry={selectPanelLazy.reset}
          onError={selectPanelLazy.reset}
          resetKey={showSelectPanel}
          fallback={null}
        >
          <Suspense fallback={null}>
            <SelectPanel />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      {showSearchPanel ? (
        <LazyChunkBoundary
          onRetry={searchPanelLazy.reset}
          onError={searchPanelLazy.reset}
          resetKey={showSearchPanel}
          fallback={null}
        >
          <Suspense fallback={null}>
            <SearchPanel />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      {showNotesPanel ? <NotesPanel /> : null}
      {showMarkupPanel ? (
        <LazyChunkBoundary
          onRetry={markupPanelLazy.reset}
          onError={markupPanelLazy.reset}
          resetKey={showMarkupPanel}
          fallback={null}
        >
          <Suspense fallback={null}>
            <MarkupPanel />
          </Suspense>
        </LazyChunkBoundary>
      ) : null}
      <EditorDialogs />
      <JobProgressOverlay labels={importLabels} />

      <Modal
        visible={!!dialogForExport}
        width={getEnabledExportTabs().length > 1 ? 540 : 400}
        closeButton
        onClosed={closeExportDialog}
      >
        {dialogForExport ? (
          <LazyChunkBoundary
            onRetry={exportDialogLazy.reset}
            onError={exportDialogLazy.reset}
            resetKey={dialogForExport}
          >
            <Suspense fallback={null}>
              <ExportDialog />
            </Suspense>
          </LazyChunkBoundary>
        ) : null}
      </Modal>
    </>
  )
})

export default function EditorWithCreationDefaults({ myna = false }: { myna?: boolean }) {
  return <FixedTextCreationContext.Provider value={myna}><Editor myna={myna} /></FixedTextCreationContext.Provider>
}
