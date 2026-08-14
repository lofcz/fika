import type { Locales } from './i18n-types'
import { isLocale } from './i18n-util'

export type { Locales }

declare global {
  interface Window {
    /** Set by the embedding host (e.g. a React app) before Fika mount in embed mode */
    __FIKA_LOCALE__?: string
  }
}

const DEFAULT_LOCALE: Locales = 'en'

function detectInitialLocale(): Locales {
  const urlLocale = new URLSearchParams(window.location.search).get('locale')
  if (urlLocale && isLocale(urlLocale)) return urlLocale

  const hostLocale = window.__FIKA_LOCALE__
  if (hostLocale && isLocale(hostLocale)) return hostLocale

  return DEFAULT_LOCALE
}

let currentLocale: Locales = detectInitialLocale()

/** Default locale for Fika during migration (English is the canonical key source). */
export const fikaDefaultLocale = DEFAULT_LOCALE

export function getFikaLocale(): Locales {
  return currentLocale
}

export function setFikaLocale(locale: Locales): void {
  currentLocale = locale
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}
