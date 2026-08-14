import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import EmbedRoot from './EmbedRoot'
import Contextmenu from '@/components/Contextmenu/index'

import 'prosemirror-view/style/prosemirror.css'
import 'animate.css'
import '@/assets/styles/prosemirror.scss'
import '@/assets/styles/global.scss'
import '@/assets/styles/font.scss'

import { TypesafeI18n } from '@/i18n/i18n-react'
import { getFikaLocale, setFikaLocale, type Locales } from '@/i18n/locale'
import { clearFikaPortalTarget, setFikaPortalTarget } from '@/utils/portal'
import { setFikaAssetBase } from '@/utils/assetBase'
import { setFikaExportTabs } from '@/configs/exportTabs'
import { setFikaExportMediaResolver } from '@/configs/exportMediaResolver'
import { setFikaMediaConfig } from '@/configs/mediaUpload'
import { setFikaHeaderMenuItems } from '@/configs/headerMenu'
import { setFikaLocaleSwitcherEnabled } from '@/configs/localeSwitcher'
import { setCustomTemplateLoaders } from '@/configs/templates'
import { applyLocale } from './localeBridge'
import { bindTooltips } from '@/utils/tooltipBind'
import { setContextmenuRenderer } from '@/utils/openContextmenu'
import { createController } from './createController'
import type { FikaController, FikaMountOptions, FikaMountResult } from './types'

const activeMounts = new WeakMap<HTMLElement, Promise<FikaMountResult>>()

function resolveHostElement(target: HTMLElement | string): HTMLElement {
  if (typeof target === 'string') {
    const el = document.querySelector<HTMLElement>(target)
    if (!el) throw new Error(`Fika mount target not found: ${target}`)
    return el
  }
  return target
}

/**
 * Mount Fika into a DOM node (for React / other embedding hosts).
 * React is a peer dependency (`>19.2`). The host must provide React and React DOM.
 */
export async function mountFika(
  target: HTMLElement | string,
  options: FikaMountOptions = {},
): Promise<FikaMountResult> {
  const el = resolveHostElement(target)

  const previousMount = activeMounts.get(el)
  if (previousMount) {
    try {
      const previous = await previousMount
      previous.controller.destroy()
    }
    catch {
    }
  }

  const mountPromise = (async () => {
    el.classList.add('fika-embed-root')
    el.innerHTML = ''

    const appRoot = document.createElement('div')
    appRoot.className = 'fika-embed-app'
    appRoot.style.cssText = 'display:block;height:100%;width:100%;min-height:0;overflow:hidden;'

    const portalRoot = document.createElement('div')
    portalRoot.className = 'fika-embed-portal'
    portalRoot.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;'
    if (!document.getElementById('fika-embed-portal-style')) {
      const portalStyle = document.createElement('style')
      portalStyle.id = 'fika-embed-portal-style'
      portalStyle.textContent = '.fika-embed-portal > * { pointer-events: auto; }'
      document.head.appendChild(portalStyle)
    }

    el.appendChild(appRoot)
    el.appendChild(portalRoot)
    setFikaPortalTarget(portalRoot)

    setFikaAssetBase(options.assetBaseUrl)
    setFikaExportTabs(options.exportTabs)
    setFikaExportMediaResolver(options.exportMediaResolver)
    setFikaMediaConfig(options.media)
    setFikaHeaderMenuItems(options.headerMenuItems)
    setFikaLocaleSwitcherEnabled(options.showLocaleSwitcher)
    setCustomTemplateLoaders(options.templateLoaders)

    const locale: Locales = options.locale ?? getFikaLocale()
    setFikaLocale(locale)
    await applyLocale(locale)

    let root: Root | null = createRoot(appRoot)
    const unmount = () => {
      root?.unmount()
      root = null
    }

    setContextmenuRenderer((container, props) => {
      const menuRoot = createRoot(container)
      flushSync(() => {
        menuRoot.render(createElement(Contextmenu, props))
      })
      return () => menuRoot.unmount()
    })
    bindTooltips(el)

    root.render(
      createElement(TypesafeI18n, {
        locale,
        children: createElement(EmbedRoot, { init: options }),
      }),
    )

    const controller: FikaController = createController({
      onChange: options.onChange,
      onChangeDebounceMs: options.onChangeDebounceMs,
      onPresentationModeChange: options.onPresentationModeChange,
      unmount,
    })

    let destroyed = false
    const originalDestroy = controller.destroy.bind(controller)
    controller.destroy = () => {
      if (destroyed) return
      destroyed = true
      originalDestroy()
      unmount()
      if (activeMounts.get(el) === mountPromise) activeMounts.delete(el)
      setFikaExportMediaResolver(null)
      setFikaMediaConfig(null)
      setFikaHeaderMenuItems()
      setFikaLocaleSwitcherEnabled()
      clearFikaPortalTarget(portalRoot)
      el.classList.remove('fika-embed-root')
      el.innerHTML = ''
    }

    return {
      controller,
      app: { unmount: () => controller.destroy() },
    }
  })()

  activeMounts.set(el, mountPromise)

  try {
    return await mountPromise
  }
  catch (error) {
    if (activeMounts.get(el) === mountPromise) activeMounts.delete(el)
    throw error
  }
}

export async function unmountFika(result: FikaMountResult): Promise<void> {
  result.controller.destroy()
}
