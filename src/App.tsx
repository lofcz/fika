import './App.scss'
import { Activity, lazy, memo, Suspense, useEffect } from 'react'

import { nanoid } from 'nanoid'
import { useScreenStore, useMainStore, useSnapshotStore, useSlidesStore } from '@/store'
import { LOCALSTORAGE_KEY_DISCARDED_DB } from '@/configs/storage'
import { deleteDiscardedDB } from '@/utils/database'
import { isPC } from '@/utils/common'
import { buildStarterPresentation } from '@/configs/starterPresentation'
import { importScreen, prefetchScreen } from '@/views/Screen/lazy'

import Editor from './views/Editor/index'
import Mobile from './views/Mobile/index'
import FullscreenSpin from '@/components/FullscreenSpin'
import ScreenShell from '@/views/Screen/ScreenShell'
import { useI18nContext } from '@/i18n/useI18nContext'
import { setFikaLocaleSwitcherEnabled } from '@/configs/localeSwitcher'

const Screen = lazy(importScreen)

setFikaLocaleSwitcherEnabled(true)

const _isPC = isPC()
const isAudienceMode = new URLSearchParams(window.location.search).get('mode') === 'audience'

const App = memo(() => {
  const { LL } = useI18nContext()
  const hasSlides = useSlidesStore(s => s.slides.length > 0)
  const screening = useScreenStore(s => s.screening)

  useEffect(() => {
    void (async () => {
      if (isAudienceMode) {
        useSlidesStore.getState().setSlides([{
          id: nanoid(10),
          elements: [],
        }])
        useScreenStore.getState().setScreening(true)
      }
      else {
        const starter = buildStarterPresentation(LL)
        const slidesState = useSlidesStore.getState()
        slidesState.setTitle(starter.title)
        slidesState.setSlides(starter.slides, starter.theme)

        await deleteDiscardedDB()
        useSnapshotStore.getState().initSnapshotDatabase()
      }
    })()
  }, [])

  useEffect(() => {
    if (import.meta.env.MODE !== 'development') {
      window.onbeforeunload = () => false
    }

    const persistDiscardedDb = () => {
      const discardedDB = localStorage.getItem(LOCALSTORAGE_KEY_DISCARDED_DB)
      const discardedDBList: string[] = discardedDB ? JSON.parse(discardedDB) : []
      discardedDBList.push(useMainStore.getState().databaseId)
      localStorage.setItem(LOCALSTORAGE_KEY_DISCARDED_DB, JSON.stringify(discardedDBList))
    }

    window.addEventListener('beforeunload', persistDiscardedDb)
    return () => window.removeEventListener('beforeunload', persistDiscardedDb)
  }, [])

  useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const idle = requestIdleCallback(() => prefetchScreen(), { timeout: 1500 })
      return () => cancelIdleCallback(idle)
    }
    const timeout = window.setTimeout(() => prefetchScreen(), 400)
    return () => clearTimeout(timeout)
  }, [])

  if (!hasSlides) {
    return <FullscreenSpin tip={LL.common.loadingData()} loading mask={false} />
  }
  if (isAudienceMode) {
    return (
      <Suspense fallback={<ScreenShell />}>
        <Screen />
      </Suspense>
    )
  }
  return (
    <>
      <Activity mode={screening ? 'hidden' : 'visible'}>
        {_isPC ? <Editor /> : <Mobile />}
      </Activity>
      {screening ? (
        <Suspense fallback={<ScreenShell />}>
          <Screen />
        </Suspense>
      ) : null}
    </>
  )
})

export default App
