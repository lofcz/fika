import { bindStyles } from '@/utils/cssm'
import styles from './EmbedRoot.module.scss'
const cx = bindStyles(styles)
import { Activity, lazy, Suspense, useEffect, useRef } from 'react'
import { useMainStore, useScreenStore, useSnapshotStore, useSlidesStore } from '@/store'
import { deleteDiscardedDB } from '@/utils/database'
import { isPC } from '@/utils/common'
import { importScreen, prefetchScreen } from '@/views/Screen/lazy'
import Editor from '@/views/Editor/index'
import Mobile from '@/views/Mobile/index'
import FullscreenSpin from '@/components/FullscreenSpin'
import ScreenShell from '@/views/Screen/ScreenShell'
import { useI18nContext } from '@/i18n/useI18nContext'
import { buildStarterPresentation } from '@/configs/starterPresentation'
import { registerLocaleSync, unregisterLocaleSync } from './localeBridge'
import { applyDocumentToStores } from './initialDocument'
import type { FikaMountOptions } from './types'

const Screen = lazy(importScreen)

export type IEmbedRootProps = {
  init: FikaMountOptions
}

export default function EmbedRoot({ init }: IEmbedRootProps) {
  const { LL, setLocale } = useI18nContext()
  const _isPC = isPC()
  const presentationOnly = init.viewMode === 'presentation'
  const slides = useSlidesStore(s => s.slides)
  const setSlides = useSlidesStore(s => s.setSlides)
  const setTemplates = useSlidesStore(s => s.setTemplates)
  const updateSlideIndex = useSlidesStore(s => s.updateSlideIndex)
  const screening = useScreenStore(s => s.screening)
  const setScreening = useScreenStore(s => s.setScreening)
  const initSnapshotDatabase = useSnapshotStore(s => s.initSnapshotDatabase)
  const prevScreeningRef = useRef(screening)

  async function resolveInitialDocument() {
    // `mountFika` already wrote `init.document` into the stores before the
    // first render; re-applying it here would clobber any host command that
    // ran between `mountFika` resolving and this effect.
    if (init.document) return
    const loadedDocument = await init.loadDocument?.()
    if (loadedDocument) {
      applyDocumentToStores(loadedDocument)
      return
    }
    if (init.loadMockOnEmpty === true) {
      const base = (init.assetBaseUrl ?? '').replace(/\/$/, '')
      const url = `${base}/mocks/slides.json`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to load mock slides from ${url}`)
      const mockSlides = await res.json()
      setSlides(mockSlides)
      return
    }
    applyDocumentToStores(buildStarterPresentation(LL, init.starterPresentation))
  }

  useEffect(() => {
    void (async () => {
      registerLocaleSync(setLocale)
      const openPanelOnTextSelection = (init as { openPanelOnTextSelection?: boolean }).openPanelOnTextSelection
      if (typeof openPanelOnTextSelection === 'boolean') {
        useMainStore.getState().setOpenPanelOnTextSelection(openPanelOnTextSelection)
      }
      if (init.templates?.length) setTemplates(init.templates)
      await resolveInitialDocument()
      await deleteDiscardedDB()
      initSnapshotDatabase()
      if (presentationOnly && useSlidesStore.getState().slides.length) setScreening(true)
    })()
    if (typeof requestIdleCallback === 'function') {
      const idle = requestIdleCallback(() => prefetchScreen(), { timeout: 1500 })
      return () => {
        cancelIdleCallback(idle)
        unregisterLocaleSync()
      }
    }
    const timeout = window.setTimeout(() => prefetchScreen(), 400)
    return () => {
      clearTimeout(timeout)
      unregisterLocaleSync()
    }
  }, [])

  useEffect(() => {
    const wasActive = prevScreeningRef.current
    prevScreeningRef.current = screening
    if (!screening && wasActive && presentationOnly && slides.length > 0) {
      updateSlideIndex(0)
      setScreening(true)
    }
  }, [screening, presentationOnly, slides.length, updateSlideIndex, setScreening])

  if (slides.length) {
    if (presentationOnly) {
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
  }
  if (init.showLoadingData !== false) {
    return <FullscreenSpin tip={LL.common.loadingData()} loading mask={false} />
  }
  return <div className={cx('fika-empty-host-state')} />
}
