import { setFikaLocale, type Locales } from '@/i18n/locale';
import { clearLLCache } from '@/i18n/getLL';
import { loadLocaleAsync, loadNamespaceAsync } from '@/i18n/i18n-util.async';
import { namespaces } from '@/i18n/i18n-util';

/** Set by EmbedRoot on mount — typesafe-i18n React context lives inside the app tree. */
let syncLocale: ((locale: Locales) => void) | null = null;
export function registerLocaleSync(fn: (locale: Locales) => void) {
  syncLocale = fn;
}
export function unregisterLocaleSync() {
  syncLocale = null;
}
export async function applyLocale(locale: Locales): Promise<void> {
  setFikaLocale(locale);
  clearLLCache();
  await loadLocaleAsync(locale);
  await Promise.all(namespaces.map(ns => loadNamespaceAsync(locale, ns)));
  syncLocale?.(locale);
}
