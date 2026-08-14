import { i18nObject } from './i18n-util'
import { loadAllLocales } from './i18n-util.sync'
import type { Locales, TranslationFunctions } from './i18n-types'
import { getFikaLocale } from './locale'

const cache: Partial<Record<Locales, TranslationFunctions>> = {}

/**
 * Synchronous translation accessor for plain `.ts` files (hooks, configs, stores).
 * Loads all locales and namespaces via the sync util on first call.
 */
export function getLL(locale?: Locales): TranslationFunctions {
  loadAllLocales()
  const loc = locale ?? getFikaLocale()
  if (!cache[loc]) {
    cache[loc] = i18nObject(loc)
  }
  return cache[loc]!
}

/** Clear cached LL instances after locale switch (optional; call from setFikaLocale if needed). */
export function clearLLCache(): void {
  for (const key of Object.keys(cache)) {
    delete cache[key as Locales]
  }
}
