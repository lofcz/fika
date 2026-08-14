import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'

import { useMainStore } from '@/store'
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
  const [panelMotionReady, setPanelMotionReady] = useState(false)
  const panelMotionReadyRef = useRef(false)
  const [dockOpen, setDockOpen] = useState(() => {
    syncRightPanelToWidth(measureHostWidth())
    return !useMainStore.getState().rightPanelCollapsed
  })
  const rightPanelCollapsed = useMainStore(s => s.rightPanelCollapsed)

  useEffect(() => {
    setDockOpen(!rightPanelCollapsed)
  }, [rightPanelCollapsed])

  const measureEditorWidth = () => editorRootRef.current?.clientWidth || measureHostWidth(editorRootRef.current)
  const onHostResize = () => {
    if (!panelMotionReadyRef.current) return
    syncRightPanelToWidth(measureEditorWidth())
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
    window.addEventListener('resize', onHostResize)
    window.visualViewport?.addEventListener('resize', onHostResize)
    syncRightPanelToWidth(measureEditorWidth())
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
      editorResizeObserver = new ResizeObserver(entries => {
        if (!panelMotionReadyRef.current) return
        const width = entries[0]?.contentRect.width ?? root.clientWidth
        syncRightPanelToWidth(width)
      })
      editorResizeObserver.observe(root)
    }
    return () => {
      cancelled = true
      editorResizeObserver?.disconnect()
      editorResizeObserver = null
      window.removeEventListener('resize', onHostResize)
      window.visualViewport?.removeEventListener('resize', onHostResize)
    }
  }, [])

  return (
    <>
      <div
        className={cx('fika-editor', { 'right-panel-collapsed': rightPanelCollapsed })}
        ref={editorRootRef}
      >
        <EditorHeader className={cx('layout-header')} />
        <div className={cx('layout-content')}>
          <Thumbnails className={cx('layout-content-left')} />
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
          <div className={cx('right-panel-slot', { docked: dockOpen, instant: !panelMotionReady })}>
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
        </div>
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
