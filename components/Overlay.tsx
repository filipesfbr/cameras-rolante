'use client';

import { useEffect, useRef } from 'react';
import { attachHls } from './attachHls';
import s from './Overlay.module.css';

/** Vídeo ampliado (live) OU frame cheio (histórico). Fechar: clique fora ou Escape (tratado no pai). */
export default function Overlay({ title, live, frame, onClose }: { title: string; live?: string; frame?: string; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (live && video.current) return attachHls(video.current, live);
  }, [live]);

  return (
    <div className={s.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.box}>
        {live ? <video ref={video} muted playsInline autoPlay className={s.media} /> : <img src={frame} alt={title} className={s.media} />}
        <div className={s.title}>{title}</div>
      </div>
    </div>
  );
}
