import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import App from './App'
import Contextmenu from '@/components/Contextmenu/index'

import 'prosemirror-view/style/prosemirror.css'
import 'animate.css'
import '@/assets/styles/prosemirror.scss'
import '@/assets/styles/global.scss'
import '@/assets/styles/font.scss'

import { TypesafeI18n } from '@/i18n/i18n-react'
import { loadLocaleAsync, loadNamespaceAsync } from '@/i18n/i18n-util.async'
import { namespaces } from '@/i18n/i18n-util'
import { getFikaLocale, setFikaLocale } from '@/i18n/locale'
import { APP_SHELL_ID } from '@/utils/portal'
import { bindTooltips } from '@/utils/tooltipBind'
import { setContextmenuRenderer } from '@/utils/openContextmenu'

async function bootstrap() {
  const locale = getFikaLocale()
  setFikaLocale(locale)

  await loadLocaleAsync(locale)
  await Promise.all(namespaces.map(ns => loadNamespaceAsync(locale, ns)))

  setContextmenuRenderer((container, props) => {
    const root = createRoot(container)
    flushSync(() => {
      root.render(<Contextmenu {...props} />)
    })
    return () => root.unmount()
  })
  const el = document.getElementById('app')
  if (!el) throw new Error('Missing #app')
  bindTooltips(document.getElementById(APP_SHELL_ID) ?? el)
  createRoot(el).render(
    <TypesafeI18n locale={locale}>
      <App />
    </TypesafeI18n>,
  )
}

void bootstrap()
