'use client';

import { useEffect, useRef } from 'react';
import { attachHls } from './attachHls';
import type { PublicCamera } from './CamerasApp';
import s from './GridView.module.css';

/** Mosaico fullscreen. Uma instância HLS por vídeo, criada ao abrir e destruída ao fechar. */
export default function GridView({ cameras, onClose }: { cameras: PublicCamera[]; onClose: () => void }) {
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  useEffect(() => {
    const off = videos.current.map((v, i) => (v ? attachHls(v, cameras[i].streamUrl) : undefined));
    return () => off.forEach((f) => f?.());
  }, [cameras]);

  // colunas conforme a contagem; a última linha incompleta fica centralizada
  const cols = Math.ceil(Math.sqrt(cameras.length));
  const rows = Math.ceil(cameras.length / cols);

  return (
    <div className={s.root}>
      <button className={s.close} onClick={onClose} title="Fechar" aria-label="Fechar">
        ✕
      </button>
      <div className={s.grid} style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}>
        {cameras.map((c, i) => (
          <video key={c.id} ref={(el) => void (videos.current[i] = el)} muted playsInline autoPlay className={s.video} />
        ))}
      </div>
    </div>
  );
}
