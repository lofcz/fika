/**
 * Runtime asset base resolution.
 *
 * The standalone app serves runtime data (`mocks/`, `imgs/`, fonts) relative to
 * the page. When Fika is embedded in a host those files are
 * served from a configurable location (`assetBaseUrl`, default `/fika-assets`),
 * so any hard-coded `./mocks/...` / `./imgs/...` path resolves against the host
 * page and 404s — which is what leaves the template/style picker empty.
 *
 * `mountFika()` calls `setFikaAssetBase()` with the host's `assetBaseUrl`, and
 * data/asset lookups go through `resolveFikaAsset()` so they resolve correctly
 * in both the standalone app (empty base) and an embedded host.
 */
let assetBase = '';
export function setFikaAssetBase(base: string | undefined | null) {
  assetBase = (base ?? '').replace(/\/+$/, '');
}
export function getFikaAssetBase(): string {
  return assetBase;
}

/** Resolve a packaged-asset path against the configured asset base. */
export function resolveFikaAsset(path: string): string {
  if (!path) return path;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) || /^(data|blob):/i.test(path)) return path;
  const clean = path.replace(/^\.?\/+/, '');
  return assetBase ? `${assetBase}/${clean}` : clean;
}
