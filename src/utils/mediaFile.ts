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
export function getAcceptAttribute(): string {
  const constraints = getMediaConstraints();
  if (constraints.accept) return constraints.accept;
  const tokens: string[] = [];
  if (constraints.mimeTypes?.length) tokens.push(...constraints.mimeTypes);
  if (constraints.extensions?.length) {
    tokens.push(...constraints.extensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`));
  }
  const kinds = constraints.kinds ?? ['image', 'video', 'audio'];
  if (!constraints.mimeTypes?.length && !constraints.extensions?.length) {
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
export function validateMediaFile(file: File): MediaFileRejection | null {
  const constraints = getMediaConstraints();
  const kind = detectMediaKind(file);
  if (!kind) return {
    file,
    reason: 'type'
  };
  const allowedKinds = constraints.kinds ?? ['image', 'video', 'audio'];
  if (!allowedKinds.includes(kind)) return {
    file,
    reason: 'kind'
  };
  if (constraints.mimeTypes?.length) {
    const mime = (file.type || '').toLowerCase();
    const mimeOk = constraints.mimeTypes.some(allowed => allowed.toLowerCase() === mime);
    if (!mimeOk) return {
      file,
      reason: 'type'
    };
  }
  if (constraints.extensions?.length) {
    const ext = getFileExtension(file);
    const allowed = new Set(constraints.extensions.map(item => item.replace(/^\./, '').toLowerCase()));
    if (!allowed.has(ext)) return {
      file,
      reason: 'type'
    };
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
export function maxSizeLabel(): string {
  const constraints = getMediaConstraints();
  const limit = constraints.maxFileSize;
  if (limit == null) return '';
  if (typeof limit === 'number') return formatBytes(limit);
  const kinds = constraints.kinds ?? ['image', 'video', 'audio'];
  const values = kinds.map(kind => getKindMaxFileSize(kind, limit)).filter((value): value is number => value != null);
  if (!values.length) return '';
  return formatBytes(Math.max(...values));
}
