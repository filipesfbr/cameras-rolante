import Hls from 'hls.js';

/** Liga um stream a um <video> e devolve a função que destrói tudo (overlay e mosaico usam isto). */
export function attachHls(video: HTMLVideoElement, url: string) {
  let hls: Hls | null = null;
  if (Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
  } else {
    video.src = url; // Safari: HLS nativo
  }
  video.play().catch(() => {});
  return () => {
    hls?.destroy();
    video.removeAttribute('src');
    video.load();
  };
}
