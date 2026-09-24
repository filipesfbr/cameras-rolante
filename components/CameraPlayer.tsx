'use client';

import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';

const MAX_RECONNECT = 10; // tentativas falhas seguidas antes de marcar FORA DO AR
const STALL_MS = 8000; // "ao vivo" mas currentTime parado por tanto tempo = travado

export type PlayerStatus = { text: string; ok: boolean };

/**
 * Reprodução HLS de uma câmera: reconexão com contagem regressiva, FORA DO AR e detecção de travamento.
 * Porta da lógica do index.html original (que já rodava em produção).
 */
export function useCameraPlayer(url: string) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<PlayerStatus>({ text: 'carregando…', ok: false });
  const manualReload = useRef<() => void>(() => {});

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let lastMove: number | undefined;
    let lastTime: number | undefined;

    const set = (text: string, ok: boolean) => setStatus({ text, ok });
    const markLive = () => {
      attempts = 0;
      set('AO VIVO', true);
    };

    /** registra uma falha; se estourar o máximo, marca FORA DO AR e para. Retorna true se desistiu */
    const fail = (label: string) => {
      attempts++;
      if (attempts >= MAX_RECONNECT) {
        lastMove = undefined;
        set('FORA DO AR', false); // só o botão Recarregar reinicia
        return true;
      }
      set(`${label} (${MAX_RECONNECT - attempts})`, false);
      return false;
    };

    const load = () => {
      if (Hls.isSupported()) {
        const h = new Hls();
        hls = h;
        h.on(Hls.Events.MEDIA_ATTACHED, () => set('conectando…', true));
        h.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          h.destroy();
          if (hls === h) hls = null;
          if (!fail('queda — reconectando')) retry = setTimeout(load, 3000);
        });
        h.loadSource(url);
        h.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
      } else {
        set('navegador sem suporte a HLS', false);
      }
    };

    /** recarrega do zero (nova instância HLS); não zera attempts: só voltar a tocar ou o botão manual fazem isso */
    const reload = () => {
      hls?.destroy();
      hls = null;
      clearTimeout(retry);
      video.removeAttribute('src');
      video.load();
      lastMove = undefined;
      set('recarregando…', false);
      load();
    };

    manualReload.current = () => {
      attempts = 0;
      reload();
    };

    video.addEventListener('playing', markLive);
    load();

    const watch = setInterval(() => {
      if (attempts >= MAX_RECONNECT) return; // já desistiu: não reconta
      if (video.paused || video.readyState < 2) return;
      const now = performance.now();
      if (lastMove === undefined) {
        lastMove = now;
        return;
      }
      if (lastTime !== undefined && Math.abs(video.currentTime - lastTime) > 0.05) lastMove = now;
      lastTime = video.currentTime;
      if (now - lastMove > STALL_MS) {
        lastMove = now; // dispara uma vez por janela
        if (!fail('stream travado — reconectando')) reload();
      }
    }, 1000);

    return () => {
      clearInterval(watch);
      clearTimeout(retry);
      video.removeEventListener('playing', markLive);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [url]);

  return { videoRef, status, reload: () => manualReload.current() };
}
