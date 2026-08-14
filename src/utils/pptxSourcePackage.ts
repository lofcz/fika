/**
 * In-memory retain store for imported PowerPoint packages.
 * Enables future source-preserving writeback (Mona-style) without
 * regenerating untouched OOXML parts.
 */

const packages = new Map<string, ArrayBuffer>();

/** Session-level clean flag: true until the deck is mutated after import. */
let activePackageId: string | null = null;
let sourcePackageClean = false;
export function retainSourcePackage(packageId: string, bytes: ArrayBuffer) {
  packages.set(packageId, bytes.slice(0));
  activePackageId = packageId;
  sourcePackageClean = true;
}
export function getSourcePackage(packageId: string): ArrayBuffer | undefined {
  return packages.get(packageId);
}
export function hasSourcePackage(packageId: string): boolean {
  return packages.has(packageId);
}
export function clearSourcePackage(packageId: string) {
  packages.delete(packageId);
  if (activePackageId === packageId) {
    activePackageId = null;
    sourcePackageClean = false;
  }
}
export function clearAllSourcePackages() {
  packages.clear();
  activePackageId = null;
  sourcePackageClean = false;
}
export function markSourcePackageDirty() {
  sourcePackageClean = false;
}
export function isSourcePackageClean(packageId?: string): boolean {
  if (!sourcePackageClean || !activePackageId) return false;
  if (packageId && packageId !== activePackageId) return false;
  return packages.has(activePackageId);
}
export function getActiveSourcePackageId(): string | null {
  return activePackageId;
}

/**
 * Hybrid export fast-path: return retained bytes when the deck is still clean.
 */
export function tryGetCleanRetainedPackage(slides: Array<{
  sourcePackageId?: string;
}>): ArrayBuffer | null {
  if (!slides.length) return null;
  const packageId = slides[0]?.sourcePackageId;
  if (!packageId) return null;
  if (!slides.every(slide => slide.sourcePackageId === packageId)) return null;
  if (!isSourcePackageClean(packageId)) return null;
  return getSourcePackage(packageId) || null;
}
