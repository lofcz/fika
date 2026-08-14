import { bindStyles } from '@/utils/cssm'
import { createPortal } from 'react-dom'
import { getFikaPortalTarget } from '@/utils/portal'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useEffect, useRef, useState } from 'react'
import { KEYS } from '@/configs/hotkey'
import useScreening from '@/hooks/useScreening'
import './screen-portal.scss'
import AudienceView from './AudienceView'
import BaseView from './BaseView'
import PresenterView from './PresenterView'

export default function Screen() {
  const isAudienceMode = new URLSearchParams(window.location.search).get('mode') === 'audience'
  const [viewMode, setViewMode] = useState<'base' | 'presenter'>('base')
  const changeViewMode = (mode: 'base' | 'presenter') => {
    setViewMode(mode)
  }
  const { exitScreening: _exitScreening } = useScreening()
  const syncChannelRef = useRef<BroadcastChannel | null>(!isAudienceMode ? new BroadcastChannel('fika-audience-sync') : null)

  const exitScreening = () => {
    syncChannelRef.current?.postMessage({ type: 'EXIT' })
    _exitScreening()
  }

  useEffect(() => {
    const keydownListener = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase()
      if (key === KEYS.ESC) exitScreening()
    }
    if (!isAudienceMode) document.addEventListener('keydown', keydownListener)
    return () => {
      if (!isAudienceMode) document.removeEventListener('keydown', keydownListener)
      syncChannelRef.current?.close()
    }
  }, [])

  return createPortal(
    <div className="fika-embed-root" style={{ position: 'fixed', inset: 0, zIndex: 2147483000 }}>
      <div className={cx('fika-screen')}>
        {isAudienceMode ? <AudienceView /> : viewMode === 'base' ? <BaseView changeViewMode={changeViewMode} /> : viewMode === 'presenter' ? <PresenterView changeViewMode={changeViewMode} /> : null}
      </div>
      <div className={cx('fika-embed-portal')} />
    </div>,
    getFikaPortalTarget(),
  )
}
