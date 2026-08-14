const POSTER_MAX_EDGE = 640;
const POSTER_QUALITY = 0.72;
const SYNTH_TIMEOUT_MS = 8000;
export interface SynthesizeMediaPosterOptions {
  kind: 'video' | 'audio';
  src: string;
  color?: string;
  signal?: AbortSignal;
}
type PosterCacheEntry = string | null;
const posterCache = new Map<string, PosterCacheEntry>();
const inflight = new Map<string, Promise<PosterCacheEntry>>();
const posterCacheKey = (opts: SynthesizeMediaPosterOptions) => {
  return `${opts.kind}:${opts.src}:${opts.color || ''}`;
};
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    window.clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, {
    once: true
  });
});
const waitEvent = (target: EventTarget, event: string, signal?: AbortSignal) => {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      signal?.removeEventListener('abort', onAbort);
    };
    target.addEventListener(event, onEvent, {
      once: true
    });
    signal?.addEventListener('abort', onAbort, {
      once: true
    });
  });
};
const withTimeout = async <T,>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> => {
  let timer: number | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('timeout')), ms);
      signal?.addEventListener('abort', () => {
        if (timer) window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, {
        once: true
      });
    })]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};
const syncCanvasSize = (width: number, height: number, maxEdge = POSTER_MAX_EDGE) => {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
};
const canvasToJpeg = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/jpeg', POSTER_QUALITY);
const parseHex = (color: string) => {
  const hex = color.trim().replace('#', '');
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16)
    };
  }
  if (hex.length >= 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  return {
    r: 24,
    g: 24,
    b: 27
  };
};
const mixRgb = (a: {
  r: number;
  g: number;
  b: number;
}, b: {
  r: number;
  g: number;
  b: number;
}, t: number) => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t)
});
const rgbCss = (c: {
  r: number;
  g: number;
  b: number;
}, alpha = 1) => {
  return alpha === 1 ? `rgb(${c.r}, ${c.g}, ${c.b})` : `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
};
const synchId3Size = (bytes: Uint8Array, offset: number) => {
  return bytes[offset] << 21 | bytes[offset + 1] << 14 | bytes[offset + 2] << 7 | bytes[offset + 3];
};
const readU32 = (bytes: Uint8Array, offset: number) => {
  return (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
};
const sniffImageMime = (bytes: Uint8Array) => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return '';
};
const extractId3Picture = (bytes: Uint8Array): Blob | null => {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
  const version = bytes[3];
  if (version < 3 || version > 4) return null;
  const tagSize = synchId3Size(bytes, 6);
  const end = Math.min(bytes.length, 10 + tagSize);
  let offset = 10;
  if (bytes[5] & 0x40) {
    if (end - offset < 4) return null;
    const extSize = version === 4 ? synchId3Size(bytes, offset) : readU32(bytes, offset);
    offset += Math.max(4, extSize);
  }
  while (offset + 10 <= end) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    if (id === '\u0000\u0000\u0000\u0000') break;
    const frameSize = version === 4 ? synchId3Size(bytes, offset + 4) : readU32(bytes, offset + 4);
    const frameStart = offset + 10;
    const frameEnd = Math.min(end, frameStart + frameSize);
    offset = frameEnd;
    if (id !== 'APIC' || frameSize <= 0) continue;
    let cursor = frameStart;
    cursor += 1;
    while (cursor < frameEnd && bytes[cursor] !== 0) cursor += 1;
    cursor += 1;
    if (cursor >= frameEnd) continue;
    cursor += 1;
    const encoding = bytes[frameStart];
    if (encoding === 1 || encoding === 2) {
      while (cursor + 1 < frameEnd && (bytes[cursor] !== 0 || bytes[cursor + 1] !== 0)) cursor += 2;
      cursor = Math.min(frameEnd, cursor + 2);
    } else {
      while (cursor < frameEnd && bytes[cursor] !== 0) cursor += 1;
      cursor = Math.min(frameEnd, cursor + 1);
    }
    const payload = bytes.subarray(cursor, frameEnd);
    const mime = sniffImageMime(payload) || 'image/jpeg';
    return new Blob([new Uint8Array(payload)], {
      type: mime
    });
  }
  return null;
};
const extractMp4Cover = (bytes: Uint8Array): Blob | null => {
  const marker = [0x63, 0x6f, 0x76, 0x72];
  for (let i = 0; i < bytes.length - 16; i++) {
    if (bytes[i] !== marker[0] || bytes[i + 1] !== marker[1] || bytes[i + 2] !== marker[2] || bytes[i + 3] !== marker[3]) continue;
    const dataIndex = i + 4;
    if (dataIndex + 8 >= bytes.length) continue;
    if (bytes[dataIndex + 4] !== 0x64 || bytes[dataIndex + 5] !== 0x61 || bytes[dataIndex + 6] !== 0x74 || bytes[dataIndex + 7] !== 0x61) continue;
    const boxSize = readU32(bytes, dataIndex);
    const payloadStart = dataIndex + 16;
    const payloadEnd = Math.min(bytes.length, dataIndex + boxSize);
    if (payloadStart >= payloadEnd) continue;
    const payload = bytes.subarray(payloadStart, payloadEnd);
    const mime = sniffImageMime(payload);
    if (!mime) continue;
    return new Blob([new Uint8Array(payload)], {
      type: mime
    });
  }
  return null;
};
const blobToImage = (blob: Blob, signal?: AbortSignal) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error('image'));
    };
    signal?.addEventListener('abort', () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    }, {
      once: true
    });
    img.src = url;
  });
};
const drawCover = (ctx: CanvasRenderingContext2D, source: CanvasImageSource, sw: number, sh: number, dw: number, dh: number) => {
  const scale = Math.max(dw / Math.max(sw, 1), dh / Math.max(sh, 1));
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(source, (dw - w) / 2, (dh - h) / 2, w, h);
};
const encodeCoverImage = async (blob: Blob, signal?: AbortSignal) => {
  const img = await blobToImage(blob, signal);
  const size = syncCanvasSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, size.width, size.height);
  drawCover(ctx, img, img.naturalWidth || img.width, img.naturalHeight || img.height, size.width, size.height);
  return canvasToJpeg(canvas);
};
const scoreFrame = (data: Uint8ClampedArray) => {
  let sum = 0;
  let sumSq = 0;
  let color = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 32) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += y;
    sumSq += y * y;
    color += Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
    n += 1;
  }
  if (!n) return -Infinity;
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const blackPenalty = mean < 16 ? (16 - mean) * 10 : 0;
  const whitePenalty = mean > 242 ? (mean - 242) * 6 : 0;
  return variance + color / n * 0.35 - blackPenalty - whitePenalty;
};
const candidateTimes = (duration: number) => {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const raw = duration < 1 ? [Math.min(0.12, duration * 0.4)] : [Math.min(1, duration * 0.12), duration * 0.25, Math.min(3, duration * 0.4), 0.35];
  const unique: number[] = [];
  for (const time of raw) {
    const clamped = Math.min(Math.max(time, 0.04), Math.max(duration - 0.08, 0));
    if (!unique.some(item => Math.abs(item - clamped) < 0.05)) unique.push(clamped);
  }
  return unique.slice(0, 4);
};
export const captureVideoPoster = (video: HTMLVideoElement | null, opts?: {
  acceptBlank?: boolean;
}): string | null => {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  try {
    const size = syncCanvasSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', {
      willReadFrequently: true
    });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, size.width, size.height);
    if (!opts?.acceptBlank) {
      const sample = ctx.getImageData(0, 0, size.width, size.height);
      if (scoreFrame(sample.data) < 2) return null;
    }
    return canvasToJpeg(canvas);
  } catch {
    return null;
  }
};
const seekVideo = async (video: HTMLVideoElement, time: number, signal?: AbortSignal) => {
  if (Math.abs(video.currentTime - time) < 0.02 && video.readyState >= 2) {
    await wait(32, signal);
    return;
  }
  video.currentTime = time;
  await withTimeout(waitEvent(video, 'seeked', signal), 1500, signal);
  await wait(48, signal);
};
export const synthesizeVideoPoster = async (src: string, signal?: AbortSignal): Promise<string | null> => {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:160px;height:90px;opacity:0;pointer-events:none';
  if (/^https?:/i.test(src)) video.crossOrigin = 'anonymous';
  document.body.appendChild(video);
  video.src = src;
  try {
    const work = (async () => {
      await waitEvent(video, 'loadeddata', signal);
      await video.play().then(() => video.pause()).catch(() => undefined);
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const size = syncCanvasSize(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d', {
        willReadFrequently: true
      });
      if (!ctx) return null;
      let bestScore = -Infinity;
      let best: string | null = captureVideoPoster(video);
      if (best) bestScore = 1;
      for (const time of candidateTimes(video.duration || 0)) {
        await seekVideo(video, time, signal);
        ctx.drawImage(video, 0, 0, size.width, size.height);
        const sample = ctx.getImageData(0, 0, size.width, size.height);
        const score = scoreFrame(sample.data);
        if (score > bestScore) {
          bestScore = score;
          best = canvasToJpeg(canvas);
        }
      }
      return best;
    })();
    return await withTimeout(work, SYNTH_TIMEOUT_MS, signal);
  } catch {
    return captureVideoPoster(video);
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
};
const downsamplePeaks = (channel: Float32Array, buckets: number) => {
  const peaks = new Float32Array(buckets);
  const block = Math.max(1, Math.floor(channel.length / buckets));
  for (let i = 0; i < buckets; i++) {
    const start = i * block;
    const end = Math.min(channel.length, start + block);
    let max = 0;
    for (let j = start; j < end; j += 8) {
      const value = Math.abs(channel[j]);
      if (value > max) max = value;
    }
    peaks[i] = max;
  }
  return peaks;
};
const drawWaveformPoster = (peaks: Float32Array, color: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const ink = {
    r: 24,
    g: 24,
    b: 27
  };
  const accent = parseHex(color);
  const top = mixRgb(ink, accent, 0.55);
  const bottom = mixRgb(ink, accent, 0.18);
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, rgbCss(top));
  bg.addColorStop(1, rgbCss(bottom));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.42, 20, canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.62);
  glow.addColorStop(0, rgbCss(accent, 0.28));
  glow.addColorStop(1, rgbCss(ink, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const midY = canvas.height * 0.54;
  const amp = canvas.height * 0.28;
  const step = canvas.width / peaks.length;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  for (let i = 0; i < peaks.length; i++) {
    const x = i * step;
    const y = midY - peaks[i] * amp;
    ctx.lineTo(x, y);
  }
  for (let i = peaks.length - 1; i >= 0; i--) {
    const x = i * step;
    const y = midY + peaks[i] * amp * 0.72;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  const wave = ctx.createLinearGradient(0, midY - amp, 0, midY + amp);
  wave.addColorStop(0, 'rgba(255,255,255,0.55)');
  wave.addColorStop(0.5, rgbCss(accent, 0.55));
  wave.addColorStop(1, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = wave;
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < peaks.length; i++) {
    const x = i * step;
    const y = midY - peaks[i] * amp;
    if (i === 0) ctx.moveTo(x, y);else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const vignette = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.2, canvas.width / 2, canvas.height / 2, canvas.width * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(24,24,27,0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvasToJpeg(canvas);
};
const drawFallbackPoster = (kind: 'video' | 'audio', color?: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const ink = {
    r: 24,
    g: 24,
    b: 27
  };
  const accent = parseHex(color || '#71717a');
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, rgbCss(mixRgb(ink, accent, 0.4)));
  bg.addColorStop(1, rgbCss(ink));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  if (kind === 'video') {
    ctx.moveTo(canvas.width / 2 - 28, canvas.height / 2 - 36);
    ctx.lineTo(canvas.width / 2 + 40, canvas.height / 2);
    ctx.lineTo(canvas.width / 2 - 28, canvas.height / 2 + 36);
    ctx.closePath();
  } else {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.arc(cx - 18, cy + 16, 16, 0, Math.PI * 2);
    ctx.arc(cx + 22, cy + 8, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 6, cy - 48, 8, 68);
    ctx.fillRect(cx + 34, cy - 40, 6, 52);
    return canvasToJpeg(canvas);
  }
  ctx.fill();
  return canvasToJpeg(canvas);
};
export const synthesizeAudioPoster = async (src: string, color = '#71717a', signal?: AbortSignal): Promise<string | null> => {
  try {
    const response = await withTimeout(fetch(src, {
      signal
    }), SYNTH_TIMEOUT_MS, signal);
    if (!response.ok) return drawFallbackPoster('audio', color);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const embedded = extractId3Picture(bytes) || extractMp4Cover(bytes);
    if (embedded) {
      const cover = await encodeCoverImage(embedded, signal);
      if (cover) return cover;
    }
    const AudioCtx = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioCtx) return drawFallbackPoster('audio', color);
    const ctx = new AudioCtx();
    try {
      const decoded = await withTimeout(ctx.decodeAudioData(buffer.slice(0)), SYNTH_TIMEOUT_MS, signal);
      const peaks = downsamplePeaks(decoded.getChannelData(0), 128);
      return drawWaveformPoster(peaks, color) || drawFallbackPoster('audio', color);
    } finally {
      void ctx.close();
    }
  } catch {
    return drawFallbackPoster('audio', color);
  }
};
export const synthesizeMediaPoster = async (opts: SynthesizeMediaPosterOptions): Promise<string | null> => {
  const key = posterCacheKey(opts);
  if (posterCache.has(key)) return posterCache.get(key) ?? null;
  const pending = inflight.get(key);
  if (pending) return pending;
  const task = (async () => {
    const result = opts.kind === 'video' ? await synthesizeVideoPoster(opts.src, opts.signal) : await synthesizeAudioPoster(opts.src, opts.color, opts.signal);
    if (result) posterCache.set(key, result);
    return result;
  })();
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
};
