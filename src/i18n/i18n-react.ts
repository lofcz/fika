import { useContext } from 'react'
import { initI18nReact } from 'typesafe-i18n/react'
import type { Formatters, Locales, TranslationFunctions, Translations } from './i18n-types'
import { loadedFormatters, loadedLocales } from './i18n-util'

const {
  component: TypesafeI18n,
  context: I18nContext,
} = initI18nReact<Locales, Translations, TranslationFunctions, Formatters>(loadedLocales, loadedFormatters)

export { TypesafeI18n, I18nContext }

export function useI18nContext() {
  return useContext(I18nContext)
}

export const useI18nReact = useI18nContext

