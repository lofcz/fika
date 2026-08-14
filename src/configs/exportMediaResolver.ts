/**
 * Optional host-provided fallback for export-time media fetches.
 *
 * Direct browser `fetch` of third-party image URLs often fails CORS (the image
 * still displays via <img>, but XHR/fetch cannot read the bytes for PPTX
 * packaging). Hosts like sciobot-next can supply a same-origin proxy that
 * returns a data: URL.
 */
export type FikaExportMediaResolver = (url: string) => Promise<string | null | undefined>;
let exportMediaResolver: FikaExportMediaResolver | null = null;
export function setFikaExportMediaResolver(resolver?: FikaExportMediaResolver | null) {
  exportMediaResolver = resolver ?? null;
}
export function getFikaExportMediaResolver(): FikaExportMediaResolver | null {
  return exportMediaResolver;
}
