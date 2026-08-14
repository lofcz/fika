export type FikaMediaKind = 'image' | 'video' | 'audio';
export interface FikaMediaUploadProgress {
  loaded: number;
  total: number;
}
export interface FikaMediaUploadRequest {
  file: File;
  kind: FikaMediaKind;
  signal: AbortSignal;
  onProgress: (progress: FikaMediaUploadProgress) => void;
}
export interface FikaMediaUploadResult {
  /** URL stored on the slide element (https, data, or blob). */
  src: string;
  /** Optional extension for video/audio export (e.g. `mp4`). */
  ext?: string;
}
export type FikaMediaUploader = (request: FikaMediaUploadRequest) => Promise<FikaMediaUploadResult | string>;
export type FikaMediaSizeLimit = number | Partial<Record<FikaMediaKind, number>>;
export interface FikaMediaConstraints {
  /** Maximum files accepted in one picker session. Default: 12. */
  maxFiles?: number;
  /**
   * Maximum size per file in bytes. Pass a number for a global cap, or a
   * per-kind map. Unspecified kinds fall back to the global/`image` value.
   */
  maxFileSize?: FikaMediaSizeLimit;
  /** Restrict which media kinds the picker accepts. Default: all three. */
  kinds?: FikaMediaKind[];
  /** Extra MIME allowlist (exact types, e.g. `image/png`). */
  mimeTypes?: string[];
  /** Extra extension allowlist without dots (`png`, `mp4`). */
  extensions?: string[];
  /**
   * `accept` attribute for the file input. When omitted, it is derived from
   * `kinds` / `mimeTypes` / `extensions`.
   */
  accept?: string;
}
export interface FikaMediaConfig {
  constraints?: FikaMediaConstraints;
  /**
   * Optional host upload. When omitted, images become data URLs and
   * audio/video become blob URLs (fine for demos, not for persistence).
   */
  upload?: FikaMediaUploader;
  /** Parallel uploads when `upload` is set. Default: 3. */
  concurrency?: number;
}
export interface FikaXhrMediaUploaderOptions {
  url: string;
  method?: 'POST' | 'PUT';
  fieldName?: string;
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  formData?: Record<string, string> | ((file: File, kind: FikaMediaKind) => Record<string, string>);
  withCredentials?: boolean;
  timeoutMs?: number;
  parseResponse?: (response: unknown, file: File, kind: FikaMediaKind) => FikaMediaUploadResult | string;
}
const MB = 1024 * 1024;
export const DEFAULT_MEDIA_CONSTRAINTS: Required<Omit<FikaMediaConstraints, 'mimeTypes' | 'extensions' | 'accept'>> & Pick<FikaMediaConstraints, 'mimeTypes' | 'extensions' | 'accept'> = {
  maxFiles: 12,
  maxFileSize: {
    image: 20 * MB,
    audio: 50 * MB,
    video: 200 * MB
  },
  kinds: ['image', 'video', 'audio']
};
const DEFAULT_CONCURRENCY = 3;
let mediaConfig: FikaMediaConfig = {};
export function setFikaMediaConfig(config?: FikaMediaConfig | null) {
  mediaConfig = config ?? {};
}
export function getFikaMediaConfig(): FikaMediaConfig {
  return mediaConfig;
}
export function getMediaConstraints(): FikaMediaConstraints {
  return {
    ...DEFAULT_MEDIA_CONSTRAINTS,
    ...mediaConfig.constraints,
    maxFileSize: mediaConfig.constraints?.maxFileSize ?? DEFAULT_MEDIA_CONSTRAINTS.maxFileSize,
    kinds: mediaConfig.constraints?.kinds ?? DEFAULT_MEDIA_CONSTRAINTS.kinds
  };
}
export function getMediaUploader(): FikaMediaUploader | undefined {
  return mediaConfig.upload;
}
export function getMediaConcurrency(): number {
  const value = mediaConfig.concurrency ?? DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(6, value));
}
function defaultParseResponse(response: unknown): FikaMediaUploadResult {
  let payload: unknown = response;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) throw new Error('Empty upload response');
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      payload = JSON.parse(trimmed);
    } else if (/^(https?:|data:|blob:)/i.test(trimmed)) {
      return {
        src: trimmed
      };
    }
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const nested = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : undefined;
    const src = record.src ?? record.url ?? nested?.src ?? nested?.url;
    if (typeof src === 'string' && src) {
      const ext = record.ext ?? nested?.ext;
      return {
        src,
        ext: typeof ext === 'string' ? ext : undefined
      };
    }
  }
  throw new Error('Upload response did not include a media URL');
}

/**
 * Build a progress-aware `upload` callback for typical FormData endpoints.
 * Hosts that need signed URLs or multipart policies can still pass a custom
 * `FikaMediaUploader` instead.
 */
export function createFikaMediaUploader(options: FikaXhrMediaUploaderOptions): FikaMediaUploader {
  return async ({
    file,
    kind,
    signal,
    onProgress
  }) => {
    const headers = typeof options.headers === 'function' ? await options.headers() : options.headers ?? {};
    const extraFields = typeof options.formData === 'function' ? options.formData(file, kind) : options.formData ?? {};
    const body = new FormData();
    body.append(options.fieldName ?? 'file', file, file.name);
    for (const [key, value] of Object.entries(extraFields)) {
      body.append(key, value);
    }
    return new Promise<FikaMediaUploadResult | string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method ?? 'POST', options.url);
      xhr.withCredentials = options.withCredentials ?? false;
      if (options.timeoutMs) xhr.timeout = options.timeoutMs;
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === 'content-type') continue;
        xhr.setRequestHeader(key, value);
      }
      const onAbort = () => {
        xhr.abort();
        reject(new DOMException('Upload aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, {
        once: true
      });
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress({
          loaded: event.loaded,
          total: event.total
        });
      };
      xhr.onerror = () => reject(new Error('Network error during media upload'));
      xhr.ontimeout = () => reject(new Error('Media upload timed out'));
      xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
      xhr.onload = () => {
        signal.removeEventListener('abort', onAbort);
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Upload failed (${xhr.status})`));
          return;
        }
        try {
          const parsed = options.parseResponse ? options.parseResponse(xhr.responseText, file, kind) : defaultParseResponse(xhr.responseText);
          resolve(parsed);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Invalid upload response'));
        }
      };
      xhr.send(body);
    });
  };
}
