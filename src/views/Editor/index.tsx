import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef, type Layout, type LayoutChangedMeta, type PanelSize } from 'react-resizable-panels'

import { useMainStore, useSlidesStore } from '@/store'
import useGlobalHotkey from '@/hooks/useGlobalHotkey'
import usePasteEvent from '@/hooks/usePasteEvent'
import { useI18nContext } from '@/i18n/useI18nContext'
import EditorHeader from './EditorHeader/index'
import Canvas from './Canvas/index'
import CanvasTool from './CanvasTool/index'
import Thumbnails from './Thumbnails/index'
import Toolbar from './Toolbar/index'
import Remark from './Remark/index'
import ChartDataEditorDialog from './ChartDataEditorDialog'
import LatexEditorDialog from './LatexEditorDialog'
import InlineMathEditorDialog from './InlineMathEditorDialog'
import ImportReplaceDialog from './ImportReplaceDialog'
import JobProgressOverlay from '@/components/JobProgressOverlay'
import ExportDialog from './ExportDialog/index'
import SelectPanel from './SelectPanel'
import SearchPanel from './SearchPanel'
import NotesPanel from './NotesPanel'
import MarkupPanel from './MarkupPanel'
import Modal from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { getEnabledExportTabs } from '@/configs/exportTabs'
import { PREVIEW_DEFAULT_PANE, PREVIEW_MAX_PANE, PREVIEW_MIN_PANE, setPreviewPaneWidth, setPreviewViewportRatio } from './Thumbnails/paneSize'
import { clampRightPaneWidth, readRightPanePreference, readRightPaneWidth, RIGHT_PANE_MAX, RIGHT_PANE_MIN, scalePreferredPx, scaleRightPaneWidth, writeRightPaneWidth, type PaneSizePreference } from './Toolbar/paneSize'

const clampLeftPaneWidth = (width: number) => (
  Math.round(Math.min(PREVIEW_MAX_PANE, Math.max(PREVIEW_MIN_PANE, width)))
)

const onThumbsResize = (size: PanelSize) => {
  setPreviewPaneWidth(size.inPixels)
}

const MermaidEditorDialog = lazy(() => import('./MermaidEditorDialog'))
const CodeEditorDialog = lazy(() => import('./CodeEditorDialog'))
const SlideCodePanel = lazy(() => import('./SlideCodePanel'))

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

const Editor = memo(() => {
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
  const rightPanePrefRef = useRef(readRightPanePreference(measureHostWidth()))
  const rightPaneDraggingRef = useRef(false)
  const hostResizeIdleRef = useRef(0)
  const lastHostWidthRef = useRef(0)
  const applyHostLayoutRef = useRef<(width: number) => void>(() => {})
  const rightPanelCollapsed = useMainStore(s => s.rightPanelCollapsed)

  useEffect(() => {
    setDockOpen(!rightPanelCollapsed)
  }, [rightPanelCollapsed])

  useEffect(() => {
    rightPaneWidthRef.current = rightPaneWidth
  }, [rightPaneWidth])

  const measureEditorWidth = () => editorRootRef.current?.clientWidth || measureHostWidth(editorRootRef.current)

  applyHostLayoutRef.current = (width: number) => {
    syncRightPanelToWidth(width)
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
    const unsubViewportRatio = useSlidesStore.subscribe(state => {
      setPreviewViewportRatio(state.viewportRatio)
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
      unsubViewportRatio()
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
        className={cx('fika-editor', { 'right-panel-collapsed': rightPanelCollapsed })}
        ref={editorRootRef}
        style={{ '--right-pane-width': `${rightPaneWidth}px` } as CSSProperties}
      >
        <EditorHeader className={cx('layout-header')} />
        <Group
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
              <Suspense fallback={null}>
                <SlideCodePanel
                  className={cx('center-code')}
                  style={{ height: `${codePanelHeight}px` }}
                  height={codePanelHeight}
                  onUpdateHeight={setCodePanelHeight}
                  onClose={closeCodePanel}
                />
              </Suspense>
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
        </Group>
      </div>

      {showSelectPanel ? <SelectPanel /> : null}
      {showSearchPanel ? <SearchPanel /> : null}
      {showNotesPanel ? <NotesPanel /> : null}
      {showMarkupPanel ? <MarkupPanel /> : null}
      <ChartDataEditorDialog />
      <LatexEditorDialog />
      <Suspense fallback={null}>
        <MermaidEditorDialog />
        <CodeEditorDialog />
      </Suspense>
      <InlineMathEditorDialog />
      <ImportReplaceDialog />
      <JobProgressOverlay labels={importLabels} />

      <Modal
        visible={!!dialogForExport}
        width={getEnabledExportTabs().length > 1 ? 540 : 400}
        closeButton
        onClosed={closeExportDialog}
      >
        <ExportDialog />
      </Modal>
    </>
  )
})

export default Editor
