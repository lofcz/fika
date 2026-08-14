import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useMemo, useCallback, memo, useEffect, type CSSProperties, type ComponentType } from 'react'
import { useMainStore } from '@/store'
import { useHasActiveGroupElement } from './common/handleElement'
import { resolveToolbarPanelState, useKeepAlive } from './common/panelSwitch'
import { ToolbarStates } from '@/types/toolbar'
import ElementStylePanel from './ElementStylePanel/index'
import ElementPositionPanel from './ElementPositionPanel'
import ElementAnimationPanel from './ElementAnimationPanel'
import SlideDesignPanel from './SlideDesignPanel/index'
import SlideAnimationPanel from './SlideAnimationPanel'
import MultiPositionPanel from './MultiPositionPanel'
import MultiStylePanel from './MultiStylePanel'
import Tabs from '@/components/Tabs'
import { useI18nContext } from '@/i18n/useI18nContext'

const PANEL_MAP: Record<ToolbarStates, ComponentType> = {
  [ToolbarStates.EL_STYLE]: ElementStylePanel,
  [ToolbarStates.EL_POSITION]: ElementPositionPanel,
  [ToolbarStates.EL_ANIMATION]: ElementAnimationPanel,
  [ToolbarStates.SLIDE_DESIGN]: SlideDesignPanel,
  [ToolbarStates.SLIDE_ANIMATION]: SlideAnimationPanel,
  [ToolbarStates.MULTI_STYLE]: MultiStylePanel,
  [ToolbarStates.MULTI_POSITION]: MultiPositionPanel,
}

const Toolbar = memo(({ className, style }: { className?: string; style?: CSSProperties }) => {
  const { LL } = useI18nContext()
  const activeCount = useMainStore(s => s.activeElementIdList.length)
  const activeGroupElementId = useMainStore(s => s.activeGroupElementId)
  const hasActiveGroupElement = useHasActiveGroupElement()
  const toolbarState = useMainStore(s => s.toolbarState)
  const setToolbarState = useMainStore(s => s.setToolbarState)

  const elementTabs = useMemo(() => [
    { label: LL.editor.toolbar.tabs.style(), key: ToolbarStates.EL_STYLE },
    { label: LL.editor.toolbar.tabs.position(), key: ToolbarStates.EL_POSITION },
    { label: LL.editor.toolbar.tabs.animation(), key: ToolbarStates.EL_ANIMATION },
  ], [LL])

  const slideTabs = useMemo(() => [
    { label: LL.editor.toolbar.tabs.design(), key: ToolbarStates.SLIDE_DESIGN },
    { label: LL.editor.toolbar.tabs.transition(), key: ToolbarStates.SLIDE_ANIMATION },
    { label: LL.editor.toolbar.tabs.animation(), key: ToolbarStates.EL_ANIMATION },
  ], [LL])

  const multiSelectTabs = useMemo(() => [
    { label: LL.editor.toolbar.tabs.multiStyle(), key: ToolbarStates.MULTI_STYLE },
    { label: LL.editor.toolbar.tabs.multiPosition(), key: ToolbarStates.MULTI_POSITION },
  ], [LL])

  const handleSetToolbarState = useCallback((value: ToolbarStates) => {
    setToolbarState(value)
  }, [setToolbarState])

  const selectionTabs = useMemo(() => {
    if (!activeCount) return slideTabs
    if (activeCount > 1) {
      if (!activeGroupElementId) return multiSelectTabs
      if (hasActiveGroupElement) return elementTabs
      return multiSelectTabs
    }
    return elementTabs
  }, [activeCount, activeGroupElementId, hasActiveGroupElement, slideTabs, multiSelectTabs, elementTabs])

  const selectionKeys = useMemo(() => selectionTabs.map(tab => tab.key), [selectionTabs])
  const activePanel = resolveToolbarPanelState(selectionKeys, toolbarState)
  const mountedPanels = useKeepAlive(activePanel)

  useEffect(() => {
    if (toolbarState !== activePanel) setToolbarState(activePanel)
  }, [activePanel, toolbarState, setToolbarState])

  return (
    <div className={[cx('toolbar'), className].filter(Boolean).join(' ')} style={style}>
      <Tabs tabs={selectionTabs} value={activePanel} card onUpdateValue={key => handleSetToolbarState(key as ToolbarStates)} />
      <div className={cx('content')}>
        {mountedPanels.map(state => {
          const Panel = PANEL_MAP[state]
          return (
            <div key={state} className={cx('panel-slot')} hidden={state !== activePanel}>
              <Panel />
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default Toolbar
