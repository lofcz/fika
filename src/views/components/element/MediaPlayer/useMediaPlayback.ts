import { useState } from 'react'

const secondToTime = (second = 0) => {
  if (second === 0 || isNaN(second)) return '00:00';
  const add0 = (num: number) => num < 10 ? '0' + num : '' + num;
  const hour = Math.floor(second / 3600);
  const min = Math.floor((second - hour * 3600) / 60);
  const sec = Math.floor(second - hour * 3600 - min * 60);
  return (hour > 0 ? [hour, min, sec] : [min, sec]).map(add0).join(':');
};

const clientXOf = (e: MouseEvent | TouchEvent) => 'clientX' in e ? e.clientX : e.changedTouches[0].clientX;

type MediaRefLike = { current?: HTMLMediaElement | null; value?: HTMLMediaElement | null }
type LoopLike = boolean | { value: boolean }

const readMedia = (mediaRef: MediaRefLike) => mediaRef?.current ?? mediaRef?.value ?? null;
const readLoop = (loop: LoopLike) => (typeof loop === 'object' && loop != null && 'value' in loop ? loop.value : !!loop);

export const SPEED_OPTIONS = [{
  label: '2×',
  value: 2
}, {
  label: '1.5×',
  value: 1.5
}, {
  label: '1.25×',
  value: 1.25
}, {
  label: '1×',
  value: 1
}, {
  label: '0.75×',
  value: 0.75
}, {
  label: '0.5×',
  value: 0.5
}];

export default (mediaRef: MediaRefLike, options: {
  loop: LoopLike;
  onLoopToggle?: (next: boolean) => void;
}) => {
  const [volume, setVolumeState] = useState(0.8);
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [bezelTransition, setBezelTransition] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [speedMenuVisible, setSpeedMenuVisible] = useState(false);
  const [playBarTimeVisible, setPlayBarTimeVisible] = useState(false);
  const [playBarTime, setPlayBarTime] = useState('00:00');
  const [playBarTimeLeft, setPlayBarTimeLeft] = useState('0');
  const ptime = secondToTime(currentTime);
  const dtime = secondToTime(duration);
  const playedRatio = duration ? currentTime / duration : 0;
  const loadedRatio = duration ? loaded / duration : 0;
  const volumeRatio = volume;
  const seek = (time: number) => {
    const media = readMedia(mediaRef);
    if (!media) return;
    const next = Math.min(Math.max(time, 0), duration || 0);
    media.currentTime = next;
    setCurrentTime(next);
  };
  const play = async () => {
    const media = readMedia(mediaRef);
    if (!media) return;
    setPaused(false);
    setBezelTransition(true);
    try {
      await media.play();
    }
    catch {
      setPaused(true);
    }
  };
  const pause = () => {
    const media = readMedia(mediaRef);
    if (!media) return;
    setPaused(true);
    media.pause();
    setBezelTransition(true);
  };
  const toggle = () => {
    if (paused) void play();
    else pause();
  };
  const setVolume = (percentage: number) => {
    const media = readMedia(mediaRef);
    if (!media) return;
    const next = Math.min(Math.max(percentage, 0), 1);
    media.volume = next;
    setVolumeState(next);
    if (media.muted && next !== 0) media.muted = false;
  };
  const speed = (rate: number) => {
    const media = readMedia(mediaRef);
    if (media) media.playbackRate = rate;
    setPlaybackRate(rate);
    setSpeedMenuVisible(false);
  };
  const handleDurationchange = () => {
    setDuration(readMedia(mediaRef)?.duration || 0);
  };
  const handleTimeupdate = () => {
    setCurrentTime(readMedia(mediaRef)?.currentTime || 0);
  };
  const handleEnded = () => {
    if (!readLoop(options.loop)) pause();
    else {
      seek(0);
      void play();
    }
  };
  const handleProgress = () => {
    const media = readMedia(mediaRef);
    setLoaded(media?.buffered.length ? media.buffered.end(media.buffered.length - 1) : 0);
  };
  const handleError = () => {
    setLoadError(true);
  };
  const handlePlay = () => {
    setPaused(false);
  };
  const handlePause = () => {
    setPaused(true);
  };
  const ratioFromEvent = (e: MouseEvent | TouchEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return Math.min(Math.max((clientXOf(e) - rect.left) / Math.max(rect.width, 1), 0), 1);
  };
  const bindSeek = (playBarWrapRef: { current: HTMLElement | null; value?: HTMLElement | null }) => {
    const bar = () => playBarWrapRef.current ?? playBarWrapRef.value ?? null;
    const move = (e: MouseEvent | TouchEvent) => {
      const media = readMedia(mediaRef);
      const wrap = bar();
      if (!media || !wrap) return;
      const time = ratioFromEvent(e, wrap) * duration;
      media.currentTime = time;
      setCurrentTime(time);
    };
    const up = (e: MouseEvent | TouchEvent) => {
      move(e);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchend', up);
    };
    const down = () => {
      document.addEventListener('mousemove', move);
      document.addEventListener('touchmove', move);
      document.addEventListener('mouseup', up);
      document.addEventListener('touchend', up);
    };
    const hover = (e: MouseEvent) => {
      const wrap = bar();
      if (!duration || !wrap) return;
      const ratio = ratioFromEvent(e, wrap);
      setPlayBarTimeLeft(`${ratio * wrap.offsetWidth}px`);
      setPlayBarTime(secondToTime(ratio * duration));
      setPlayBarTimeVisible(true);
    };
    return { down, hover };
  };
  const bindVolume = (volumeBarRef: { current: HTMLElement | null; value?: HTMLElement | null }) => {
    const bar = () => volumeBarRef.current ?? volumeBarRef.value ?? null;
    const move = (e: MouseEvent | TouchEvent) => {
      const wrap = bar();
      if (!wrap) return;
      setVolume(ratioFromEvent(e, wrap));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchend', up);
    };
    const down = () => {
      document.addEventListener('mousemove', move);
      document.addEventListener('touchmove', move);
      document.addEventListener('mouseup', up);
      document.addEventListener('touchend', up);
    };
    const click = (e: MouseEvent) => {
      const wrap = bar();
      if (!wrap) return;
      setVolume(ratioFromEvent(e, wrap));
    };
    return { down, click };
  };
  const toggleVolume = () => {
    const media = readMedia(mediaRef);
    if (!media) return;
    if (media.muted || volume === 0) {
      media.muted = false;
      setVolume(volume || 0.8);
    }
    else {
      media.muted = true;
      setVolume(0);
    }
  };
  const toggleLoop = () => {
    const next = !readLoop(options.loop);
    if (typeof options.loop === 'object' && options.loop && 'value' in options.loop) {
      options.loop.value = next;
    }
    options.onLoopToggle?.(next);
  };
  return {
    volume,
    paused,
    currentTime,
    duration,
    loaded,
    loop: options.loop,
    bezelTransition,
    setBezelTransition,
    playbackRate,
    loadError,
    speedMenuVisible,
    setSpeedMenuVisible,
    playBarTimeVisible,
    setPlayBarTimeVisible,
    playBarTime,
    playBarTimeLeft,
    ptime,
    dtime,
    playedRatio,
    loadedRatio,
    volumeRatio,
    seek,
    play,
    pause,
    toggle,
    setVolume,
    speed,
    handleDurationchange,
    handleTimeupdate,
    handleEnded,
    handleProgress,
    handleError,
    handlePlay,
    handlePause,
    bindSeek,
    bindVolume,
    toggleVolume,
    toggleLoop
  };
};
