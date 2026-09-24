'use client';

import { useState } from 'react';
import type { Frame } from '@/lib/storage';
import type { PublicCamera } from './CamerasApp';
import { useCameraPlayer } from './CameraPlayer';
import HistoryStrip from './HistoryStrip';
import s from './CameraCard.module.css';

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);

const REFRESH = 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 9.998h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z';
const HISTORY = 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z';
const LIVE = 'M7.76 16.24C6.67 15.16 6 13.66 6 12s.67-3.16 1.76-4.24l1.42 1.42C8.45 9.9 8 10.9 8 12c0 1.1.45 2.1 1.17 2.83l-1.41 1.41zm8.48 0C17.33 15.16 18 13.66 18 12s-.67-3.16-1.76-4.24l-1.42 1.42C15.55 9.9 16 10.9 16 12c0 1.1-.45 2.1-1.17 2.83l1.41 1.41zM12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm8 2c0 2.21-.9 4.21-2.35 5.65l1.42 1.42C20.88 17.26 22 14.76 22 12s-1.12-5.26-2.93-7.07l-1.42 1.42C19.1 7.79 20 9.79 20 12zM6.35 6.35L4.93 4.93C3.12 6.74 2 9.24 2 12s1.12 5.26 2.93 7.07l1.42-1.42C4.9 16.21 4 14.21 4 12s.9-4.21 2.35-5.65z';
const EXTERNAL = 'M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z';
const CHEVRON_L = 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z';
const CHEVRON_R = 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z';

const stampOf = (f: Frame) => `${f.day.slice(8)}/${f.day.slice(5, 7)} ${f.t.slice(0, 2)}:${f.t.slice(2, 4)}`;

export default function CameraCard({ cam, historyBatch, onOpenLive, onOpenFrame }: { cam: PublicCamera; historyBatch: number; onOpenLive: () => void; onOpenFrame: (f: Frame) => void }) {
  const { videoRef, status, reload } = useCameraPlayer(cam.streamUrl);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null); // print aberto por cima do vídeo ao vivo
  const [frames, setFrames] = useState<Frame[]>([]); // lista carregada pela faixa (mais recente primeiro)
  const title = `${cam.location} — ${cam.name}`;

  // setas só com a faixa aberta: é ela que carrega os mais antigos ao chegar na ponta
  const idx = frame && historyOpen ? frames.findIndex((f) => f.id === frame.id) : -1;
  const go = (d: number) => {
    const n = frames[idx + d];
    if (idx >= 0 && n) setFrame(n);
  };
  const canNewer = idx > 0;
  const canOlder = idx >= 0 && idx < frames.length - 1;

  return (
    <div
      className={s.card}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1); // esquerda = mais recente, igual à faixa
        else if (e.key === 'ArrowRight') go(1);
      }}
    >
      <div className={s.media}>
        {/* o vídeo segue rodando por baixo: voltar ao vivo é instantâneo */}
        <video ref={videoRef} muted playsInline autoPlay onClick={onOpenLive} className={s.video} />
        {frame && <img src={frame.full} alt={`Print de ${title} em ${stampOf(frame)}`} className={s.frame} onClick={() => onOpenFrame(frame)} title="Clique para ampliar" />}
        {frame && (
          <div className={s.stamp}>
            <span className={s.stampDate}>
              {frame.day.slice(8)}/{frame.day.slice(5, 7)}/{frame.day.slice(0, 4)}
            </span>
            <b>
              {frame.t.slice(0, 2)}:{frame.t.slice(2, 4)}
            </b>
          </div>
        )}
        {idx >= 0 && (
          <>
            <button className={`${s.nav} ${s.prev}`} onClick={() => go(-1)} disabled={!canNewer} title="Print mais recente (←)" aria-label="Print mais recente">
              <Icon d={CHEVRON_L} size={24} />
            </button>
            <button className={`${s.nav} ${s.next}`} onClick={() => go(1)} disabled={!canOlder} title="Print mais antigo (→)" aria-label="Print mais antigo">
              <Icon d={CHEVRON_R} size={24} />
            </button>
          </>
        )}
      </div>

      <div className={s.label}>
        <div className={s.name} title={title}>
          <span className={s.nameText}>
            {cam.location} — <strong>{cam.name}</strong>
          </span>
          {cam.sourceUrl && (
            <a href={cam.sourceUrl} target="_blank" rel="noopener" className={s.src} title="Fonte: página da câmera" aria-label="Fonte: página da câmera (abre em nova aba)">
              <Icon d={EXTERNAL} size={12} />
            </a>
          )}
        </div>

        <span className={`${s.badge} ${frame ? s.print : status.ok ? s.ok : s.bad}`}>
          <span className={s.dot} />
          {frame ? `PRINT · ${stampOf(frame)}` : status.text}
        </span>

        <div className={s.actions}>
          {frame && (
            <button className={`${s.iconBtn} ${s.iconActive} ${s.liveBtn}`} onClick={() => setFrame(null)} title="Voltar ao vivo" aria-label="Voltar ao vivo">
              <Icon d={LIVE} />
              Ao vivo
            </button>
          )}
          <button
            className={s.iconBtn}
            onClick={() => {
              setFrame(null);
              reload();
            }}
            title="Atualizar imagem"
            aria-label="Atualizar imagem"
          >
            <Icon d={REFRESH} />
          </button>
          {cam.captureEnabled && (
            <button
              className={`${s.iconBtn} ${historyOpen ? s.iconActive : ''}`}
              onClick={() => setHistoryOpen((o) => !o)}
              title={historyOpen ? 'Ocultar histórico' : 'Mostrar histórico'}
              aria-label={historyOpen ? 'Ocultar histórico' : 'Mostrar histórico'}
              aria-pressed={historyOpen}
            >
              <Icon d={HISTORY} />
            </button>
          )}
        </div>
      </div>

      {historyOpen && <HistoryStrip cam={cam.id} batch={historyBatch} intervalMin={Math.round(cam.intervalSec / 60)} selected={frame?.id ?? null} onOpen={setFrame} onFrames={setFrames} />}
    </div>
  );
}
