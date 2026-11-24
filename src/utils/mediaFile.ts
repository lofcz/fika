import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, MIME_MAP, VIDEO_EXTENSIONS } from '@/configs/mime';
import { getMediaConstraints, type FikaMediaKind, type FikaMediaSizeLimit } from '@/configs/mediaUpload';
const IMAGE_EXT = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXT = new Set<string>(VIDEO_EXTENSIONS);
const AUDIO_EXT = new Set<string>(AUDIO_EXTENSIONS);
export type MediaRejectReason = 'type' | 'size' | 'kind' | 'tooMany';
export interface MediaFileRejection {
  file: File;
  reason: MediaRejectReason;
  maxSize?: number;
}
export function getFileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() || '';
  if (fromName && fromName !== file.name.toLowerCase()) return fromName;
  return (MIME_MAP[file.type] || '').toLowerCase();
}
export function detectMediaKind(file: File): FikaMediaKind | null {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  const ext = getFileExtension(file);
  if (IMAGE_EXT.has(ext) || ext === 'jpeg') return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return null;
}
export function getKindMaxFileSize(kind: FikaMediaKind, limit?: FikaMediaSizeLimit): number | undefined {
  if (limit == null) return undefined;
  if (typeof limit === 'number') return limit;
  return limit[kind] ?? limit.image ?? limit.video ?? limit.audio;
}
export interface MediaConstraintOverrides {
  kinds?: FikaMediaKind[];
  maxFiles?: number;
}
function resolveAllowedKinds(constraintsKinds?: FikaMediaKind[], overrideKinds?: FikaMediaKind[]): FikaMediaKind[] {
  const base = constraintsKinds ?? ['image', 'video', 'audio'];
  if (!overrideKinds?.length) return base;
  const intersection = base.filter(kind => overrideKinds.includes(kind));
  return intersection.length ? intersection : overrideKinds;
}
function mimeMatchesKinds(mime: string, kinds: FikaMediaKind[]): boolean {
  const lower = mime.toLowerCase();
  if (lower.startsWith('image/')) return kinds.includes('image');
  if (lower.startsWith('video/')) return kinds.includes('video');
  if (lower.startsWith('audio/')) return kinds.includes('audio');
  return false;
}
function extMatchesKinds(ext: string, kinds: FikaMediaKind[]): boolean {
  const clean = ext.replace(/^\./, '').toLowerCase();
  if (IMAGE_EXT.has(clean) || clean === 'jpeg') return kinds.includes('image');
  if (VIDEO_EXT.has(clean)) return kinds.includes('video');
  if (AUDIO_EXT.has(clean)) return kinds.includes('audio');
  return false;
}
export function getAcceptAttribute(overrides?: MediaConstraintOverrides): string {
  const constraints = getMediaConstraints();
  const kinds = resolveAllowedKinds(constraints.kinds, overrides?.kinds);
  const restrictedByOverride = !!overrides?.kinds?.length;
  if (constraints.accept && !restrictedByOverride) return constraints.accept;
  const tokens: string[] = [];
  if (constraints.mimeTypes?.length) {
    tokens.push(...(restrictedByOverride
      ? constraints.mimeTypes.filter(mime => mimeMatchesKinds(mime, kinds))
      : constraints.mimeTypes));
  }
  if (constraints.extensions?.length) {
    const filteredExts = restrictedByOverride
      ? constraints.extensions.filter(ext => extMatchesKinds(ext, kinds))
      : constraints.extensions;
    tokens.push(...filteredExts.map(ext => ext.startsWith('.') ? ext : `.${ext}`));
  }
  if (!tokens.length) {
    if (kinds.includes('image')) {
      tokens.push('image/*', ...IMAGE_EXTENSIONS.map(ext => `.${ext}`));
    }
    if (kinds.includes('video')) {
      tokens.push('video/*', ...VIDEO_EXTENSIONS.map(ext => `.${ext}`));
    }
    if (kinds.includes('audio')) {
      tokens.push('audio/*', ...AUDIO_EXTENSIONS.map(ext => `.${ext}`));
    }
  }
  return [...new Set(tokens)].join(',');
}
export function validateMediaFile(file: File, overrides?: MediaConstraintOverrides): MediaFileRejection | null {
  const constraints = getMediaConstraints();
  const kind = detectMediaKind(file);
  if (!kind) return {
    file,
    reason: 'type'
  };
  const allowedKinds = resolveAllowedKinds(constraints.kinds, overrides?.kinds);
  if (!allowedKinds.includes(kind)) return {
    file,
    reason: 'kind'
  };
  if (constraints.mimeTypes?.length) {
    const mime = (file.type || '').toLowerCase();
    const eligibleMimes = overrides?.kinds?.length
      ? constraints.mimeTypes.filter(allowed => mimeMatchesKinds(allowed, allowedKinds))
      : constraints.mimeTypes;
    if (eligibleMimes.length) {
      const mimeOk = eligibleMimes.some(allowed => allowed.toLowerCase() === mime);
      if (!mimeOk) return {
        file,
        reason: 'type'
      };
    }
  }
  if (constraints.extensions?.length) {
    const ext = getFileExtension(file);
    const eligibleExts = overrides?.kinds?.length
      ? constraints.extensions.filter(item => extMatchesKinds(item, allowedKinds))
      : constraints.extensions;
    if (eligibleExts.length) {
      const allowed = new Set(eligibleExts.map(item => item.replace(/^\./, '').toLowerCase()));
      if (!allowed.has(ext)) return {
        file,
        reason: 'type'
      };
    }
  }
  const maxSize = getKindMaxFileSize(kind, constraints.maxFileSize);
  if (maxSize != null && file.size > maxSize) return {
    file,
    reason: 'size',
    maxSize
  };
  return null;
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
export function maxSizeLabel(overrides?: MediaConstraintOverrides): string {
  const constraints = getMediaConstraints();
  const limit = constraints.maxFileSize;
  if (limit == null) return '';
  if (typeof limit === 'number') return formatBytes(limit);
  const kinds = resolveAllowedKinds(constraints.kinds, overrides?.kinds);
  const values = kinds.map(kind => getKindMaxFileSize(kind, limit)).filter((value): value is number => value != null);
  if (!values.length) return '';
  return formatBytes(Math.max(...values));
}
