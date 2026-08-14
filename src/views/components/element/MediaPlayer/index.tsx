import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { forwardRef, useImperativeHandle, useRef, useCallback, memo, useState, useEffect } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import useMediaPlayback, { SPEED_OPTIONS } from './useMediaPlayback'
import useMSE from './useMSE'

export type IMediaPlayerProps = {
  kind: 'video' | 'audio'
  width: number
  height: number
  src: string
  poster?: string
  autoplay?: boolean
  loop?: boolean
  scale?: number
  color?: string
  compact?: boolean
  docked?: boolean
  fillParent?: boolean
  synthesizing?: boolean
  interactive?: boolean
  onUpdateLoop?: (value: boolean) => void
  onPoster?: (value: string) => void
}

const MAX_CAPTURE_ATTEMPTS = 12

const MediaPlayer = memo(forwardRef<any, IMediaPlayerProps>((props, expose) => {
  const { LL } = useI18nContext()
  const {
    kind,
    width,
    height,
    src,
    poster = '',
    autoplay = false,
    loop: loopProp = false,
    scale = 1,
    color = '#71717a',
    compact = false,
    docked = false,
    fillParent = false,
    synthesizing = false,
    interactive = true,
    onUpdateLoop,
    onPoster,
  } = props

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playBarWrapRef = useRef<HTMLDivElement | null>(null)
  const volumeBarRef = useRef<HTMLDivElement | null>(null)
  const [loop, setLoop] = useState(loopProp)
  const posterCapturedRef = useRef(!!poster)
  const captureAttempts = useRef(0)
  const corsMode = /^https?:/i.test(src) ? 'anonymous' : undefined

  const markPosterCaptured = (next: boolean) => {
    posterCapturedRef.current = next
  }

  useEffect(() => {
    setLoop(loopProp)
  }, [loopProp])

  useEffect(() => {
    markPosterCaptured(false)
    captureAttempts.current = 0
  }, [src])

  useEffect(() => {
    if (poster) {
      markPosterCaptured(true)
      return
    }
    markPosterCaptured(false)
    captureAttempts.current = 0
    onVideoReady()
  }, [poster])

  const mediaRef = {
    get current() { return kind === 'video' ? videoRef.current : audioRef.current },
    get value() { return kind === 'video' ? videoRef.current : audioRef.current },
  }
  const loopBox = {
    get value() { return loop },
    set value(next: boolean) { setLoop(next) },
  }
  const playback = useMediaPlayback(mediaRef, {
    loop: loopBox,
    onLoopToggle: next => onUpdateLoop?.(next),
  })
  const {
    volume,
    paused,
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
    toggle,
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
    toggleLoop,
  } = playback

  const speedOptions = SPEED_OPTIONS
  const seekGestures = bindSeek(playBarWrapRef)
  const volumeGestures = bindVolume(volumeBarRef)
  const loadErrorText = kind === 'audio' ? LL.components.audioPlayer.loadFailed() : LL.canvas.videoPlayer.loadFailed()
  const playerStyle: Record<string, string> = { '--media-accent': color }
  if (fillParent) {
    playerStyle.width = '100%'
    playerStyle.height = '100%'
    playerStyle.transform = 'none'
  }
  else {
    playerStyle.width = width * scale + 'px'
    playerStyle.height = height * scale + 'px'
    playerStyle.transform = `scale(${1 / scale})`
  }
  const artStyle = poster ? {} : { background: `linear-gradient(145deg, ${color} 0%, #18181b 100%)` }
  const autoHideControllerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hideController, setHideController] = useState(false)

  const autoHideController = useCallback(() => {
    if (kind === 'audio' || compact) {
      setHideController(false)
      return
    }
    setHideController(false)
    if (autoHideControllerTimer.current !== null) clearTimeout(autoHideControllerTimer.current)
    autoHideControllerTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setHideController(true)
    }, 2600)
  }, [kind, compact])

  useEffect(() => {
    const media = mediaRef.current
    if (media) media.volume = volume
  }, [])

  async function tryCapturePoster() {
    if (kind !== 'video' || posterCapturedRef.current || poster) return
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    captureAttempts.current += 1
    try {
      const { captureVideoPoster } = await import('@/utils/mediaPoster')
      const next = captureVideoPoster(video, { acceptBlank: captureAttempts.current >= MAX_CAPTURE_ATTEMPTS })
      if (!next) return
      markPosterCaptured(true)
      onPoster?.(next)
    }
    catch {
      if (captureAttempts.current >= MAX_CAPTURE_ATTEMPTS) markPosterCaptured(true)
    }
  }

  function onVideoReady() {
    if (kind !== 'video' || posterCapturedRef.current || poster) return
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const grab = () => { void tryCapturePoster() }
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(grab)
      return
    }
    grab()
  }

  useMSE(kind === 'video' ? src : '', videoRef)
  useImperativeHandle(expose, () => ({
    toggle,
    play: playback.play,
    pause: playback.pause,
  }))

  return (
    <div
      className={cx('media-player', {
        video: kind === 'video',
        audio: kind === 'audio',
        compact,
        docked,
        paused,
        'hide-controller': hideController,
        synthesizing,
        'fill-parent': fillParent,
        'idle-chrome': !interactive,
      })}
      style={playerStyle}
      onMouseDown={event => { event.stopPropagation() }}
      onMouseMove={autoHideController}
      onClick={autoHideController}
    >
      {kind === 'audio' ? (
        <audio
          ref={audioRef}
          className={cx('audio-el')}
          src={src}
          autoPlay={autoplay}
          loop={false}
          onDurationChange={handleDurationchange}
          onTimeUpdate={handleTimeupdate}
          onEnded={handleEnded}
          onProgress={handleProgress}
          onPlay={handlePlay}
          onPause={handlePause}
          onError={handleError}
        />
      ) : null}

      <div className={cx('stage')} onClick={event => { event.stopPropagation(); toggle() }}>
        {loadError ? (
          <div className={cx('load-error')}>{loadErrorText}</div>
        ) : kind === 'audio' && synthesizing && !poster ? (
          <div className={cx('poster-skeleton')} aria-hidden>
            <span className={cx('shimmer')} />
          </div>
        ) : null}

        {kind === 'video' ? (
          <div className={cx('video-frame')}>
            <video
              ref={videoRef}
              className={cx('video')}
              src={src}
              autoPlay={autoplay}
              poster={poster}
              playsInline
              crossOrigin={corsMode}
              onLoadedData={onVideoReady}
              onPlaying={onVideoReady}
              onDurationChange={handleDurationchange}
              onTimeUpdate={() => { handleTimeupdate(); onVideoReady() }}
              onEnded={handleEnded}
              onProgress={handleProgress}
              onPlay={() => { handlePlay(); autoHideController() }}
              onPause={autoHideController}
              onError={handleError}
            />
          </div>
        ) : (
          <div className={cx('audio-art')} style={artStyle}>
            {poster && !synthesizing ? <img src={poster} alt="" /> : null}
          </div>
        )}

        <span
          className={cx('bezel-icon', { 'bezel-transition': bezelTransition })}
          onAnimationEnd={() => { setBezelTransition(false) }}
        >
          {paused ? <Icon icon="pause" /> : <Icon icon="play" />}
        </span>

        {paused && !loadError ? (
          <button type="button" className={cx('play-badge')} onClick={event => { event.stopPropagation(); toggle() }}>
            <Icon icon="play" />
          </button>
        ) : null}
      </div>

      <div className={cx('controller-mask')} />
      <div
        className={cx('controller')}
        onClick={event => { event.stopPropagation() }}
        onMouseDown={event => { event.stopPropagation() }}
      >
        <button type="button" className={cx('icon', 'play-icon')} onClick={toggle}>
          {paused ? <Icon icon="play" /> : <Icon icon="pause" />}
        </button>

        <div className={cx('volume')}>
          <button
            type="button"
            className={cx('icon')}
            title={volume === 0 ? LL.canvas.videoPlayer.unmute() : LL.canvas.videoPlayer.mute()}
            onClick={toggleVolume}
          >
            {volume === 0 ? (
              <Icon icon="volume-x" />
            ) : volume === 1 ? (
              <Icon icon="volume-2" />
            ) : (
              <Icon icon="volume-1" />
            )}
          </button>
          <div
            className={cx('volume-bar-wrap')}
            onMouseDown={volumeGestures.down}
            onTouchStart={volumeGestures.down}
            onClick={$event => { volumeGestures.click($event.nativeEvent) }}
          >
            <div className={cx('track')} ref={volumeBarRef}>
              <div className={cx('fill')} style={{ width: volumeRatio * 100 + '%' }}>
                <span className={cx('thumb')} />
              </div>
            </div>
          </div>
        </div>

        <span className={cx('time')}>{ptime} / {dtime}</span>

        <div
          className={cx('bar-wrap')}
          ref={playBarWrapRef}
          onMouseDown={seekGestures.down}
          onTouchStart={seekGestures.down}
          onMouseMove={$event => { seekGestures.hover($event.nativeEvent) }}
          onMouseEnter={() => { setPlayBarTimeVisible(true) }}
          onMouseLeave={() => { setPlayBarTimeVisible(false) }}
        >
          <div className={cx('bar-time', { hidden: !playBarTimeVisible })} style={{ left: playBarTimeLeft }}>
            {playBarTime}
          </div>
          <div className={cx('bar')}>
            <div className={cx('loaded')} style={{ width: loadedRatio * 100 + '%' }} />
            <div className={cx('played')} style={{ width: playedRatio * 100 + '%' }}>
              <span className={cx('thumb')} />
            </div>
          </div>
        </div>

        {kind === 'video' ? (
          <div className={cx('speed')}>
            <button type="button" className={cx('chip')} onClick={() => { setSpeedMenuVisible(!speedMenuVisible) }}>
              {playbackRate === 1 ? LL.canvas.videoPlayer.playbackSpeed() : playbackRate + '×'}
            </button>
            {speedMenuVisible ? (
              <div className={cx('speed-menu')} onMouseLeave={() => { setSpeedMenuVisible(false) }}>
                {speedOptions.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    className={cx('speed-menu-item', { active: item.value === playbackRate })}
                    onClick={() => { speed(item.value) }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className={cx('chip', 'loop', { active: loop })}
          title={loop ? LL.canvas.videoPlayer.loopOn() : LL.canvas.videoPlayer.loopOff()}
          onClick={toggleLoop}
        >
          <Icon icon="repeat" />
        </button>
      </div>
    </div>
  )
}))

export default MediaPlayer
