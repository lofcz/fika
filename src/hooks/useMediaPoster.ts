
import { useState, useEffect } from 'react'
import { useSlidesStore } from '@/store';
import type { PPTAudioElement, PPTVideoElement } from '@/types/slides';
type MediaPosterElement = PPTVideoElement | PPTAudioElement;
export default (element: () => MediaPosterElement, slideId?: () => string | undefined) => {
  const updateElement = useSlidesStore(s => s.updateElement);
  const [synthesizing, setSynthesizing] = useState(false);
  let controller: AbortController | null = null;
  let lastKey = '';
  const poster = element().poster || '';
  const displayPoster = poster;
  const persistPoster = (next: string) => {
    const current = element();
    if ((current.poster || '') === next) return;
    updateElement({
      id: current.id,
      slideId: slideId?.(),
      props: {
        poster: next
      }
    });
  };
  const sourceKey = (current: MediaPosterElement) => `${current.id}\0${current.src}`;
  const run = async () => {
    const current = element();
    const key = sourceKey(current);
    if (!current.src) {
      setSynthesizing(false);
      return;
    }
    if (lastKey && lastKey !== key && current.poster) persistPoster('');
    const sourceChanged = lastKey !== '' && lastKey !== key;
    lastKey = key;

    if (current.type === 'video') {
      setSynthesizing(false);
      return;
    }
    if (!sourceChanged && current.poster) {
      setSynthesizing(false);
      return;
    }
    controller?.abort();
    controller = new AbortController();
    const {
      signal
    } = controller;
    setSynthesizing(true);
    try {
      const {
        synthesizeMediaPoster
      } = await import('@/utils/mediaPoster');
      if (signal.aborted) return;
      const result = await synthesizeMediaPoster({
        kind: current.type,
        src: current.src,
        color: current.type === 'audio' ? current.color : undefined,
        signal
      });
      if (signal.aborted) return;
      if (result) persistPoster(result);
    } catch {
      setSynthesizing(false);
    } finally {
      setSynthesizing(false);
    }
  };
  const current = element()
  useEffect(() => {
    void run();
  }, [current.id, current.src, current.poster]);
  useEffect(() => () => { (() => {
    controller?.abort();
  })() }, []);
  return {
    synthesizing,
    displayPoster,
    persistPoster
  };
};
