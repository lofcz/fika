import { useEffect } from 'react'

export default (src: string, videoRef: { current: HTMLVideoElement | null }) => {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let type = 'normal';
    if (/m3u8(#|\?|$)/i.exec(src)) type = 'hls';
    else if (/.flv(#|\?|$)/i.exec(src)) type = 'flv';
    if (type === 'hls' && (video.canPlayType('application/x-mpegURL') || video.canPlayType('application/vnd.apple.mpegURL'))) {
      type = 'normal';
    }
    if (type === 'hls') {
      // oxlint-disable-next-line typescript/no-explicit-any
      const Hls = (window as any).Hls;
      if (Hls?.isSupported()) {
        const hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        return () => { hls.destroy(); };
      }
    }
    else if (type === 'flv') {
      // oxlint-disable-next-line typescript/no-explicit-any
      const flvjs = (window as any).flvjs;
      if (flvjs?.isSupported()) {
        const flvPlayer = flvjs.createPlayer({
          type: 'flv',
          url: src
        });
        flvPlayer.attachMediaElement(video);
        flvPlayer.load();
        return () => { flvPlayer.destroy(); };
      }
    }
  }, [src, videoRef]);
};
