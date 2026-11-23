/**
 * Proofing language of the text in PPTX downloads.
 *
 * PowerPoint checks spelling, hyphenates and applies AutoCorrect per text run
 * by its `lang` attribute. Without one every run is US English, so a Czech
 * deck opens with every word underlined as a typo. The host names the deck's
 * language (BCP-47, e.g. `cs` or `sk-SK`); runs that already carry a
 * language keep it.
 */

let exportLanguage: string | null = null

/** Region-qualified tag PowerPoint recognises (`cs` → `cs-CZ`), or null for an invalid tag. */
export function pptxLanguageTag(tag?: string | null): string | null {
  if (!tag?.trim()) return null
  try {
    const [canonical] = Intl.getCanonicalLocales(tag.trim())
    const locale = new Intl.Locale(canonical).maximize()
    return locale.region ? `${locale.language}-${locale.region}` : locale.language
  } catch {
    return null
  }
}

export function setFikaExportLanguage(tag?: string | null) {
  exportLanguage = pptxLanguageTag(tag)
}

export function getFikaExportLanguage(): string | null {
  return exportLanguage
}
