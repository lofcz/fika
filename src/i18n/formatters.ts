import type { FormattersInitializer } from 'typesafe-i18n'
import { number } from 'typesafe-i18n/formatters'
import type { Locales, Formatters } from './i18n-types'

export const LOCALE_BCP47: Record<Locales, string> = {
  en: 'en-US',
  cs: 'cs-CZ',
  sk: 'sk-SK',
  pl: 'pl-PL',
}

export function localeToBcp47(locale: Locales): string {
  return LOCALE_BCP47[locale] ?? 'en-US'
}

export function formatLocaleDateTime(
  timestamp: number,
  locale: Locales,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string {
  return new Date(timestamp).toLocaleString(localeToBcp47(locale), options)
}

export const initFormatters: FormattersInitializer<Locales, Formatters> = (locale: Locales) => {
  const bcp47 = localeToBcp47(locale)

  const formatters: Formatters = {
    num: number(bcp47, { useGrouping: true }),
  }

  return formatters
}
