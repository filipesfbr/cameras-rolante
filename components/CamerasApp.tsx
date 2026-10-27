'use client';

import { useEffect, useState } from 'react';
import type { Frame } from '@/lib/storage';
import CameraCard from './CameraCard';
import Clock from './Clock';
import GridView from './GridView';
import Overlay from './Overlay';
import s from './CamerasApp.module.css';

export type PublicCamera = {
  id: string;
  name: string;
  location: string;
  streamUrl: string;
  sourceUrl?: string;
  intervalSec: number;
};

type OverlayState = { title: string; live?: string; frame?: string } | null;

const titleOf = (c: PublicCamera) => `${c.location} — ${c.name}`;
const when = (f: Frame) => `${f.day.slice(8)}/${f.day.slice(5, 7)}/${f.day.slice(0, 4)} ${f.t.slice(0, 2)}:${f.t.slice(2, 4)}:${f.t.slice(4)}`;

export default function CamerasApp({ cameras, historyBatch, notice }: { cameras: PublicCamera[]; historyBatch: number; notice?: string }) {
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const [grid, setGrid] = useState(false);
  // câmeras o maior possível: 1–3 lado a lado ocupando a largura toda; a partir de 4, ~quadrado (4→2, 5–9→3)
  const cols = cameras.length <= 3 ? cameras.length : Math.ceil(Math.sqrt(cameras.length));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (grid) setGrid(false);
      else setOverlay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grid]);

  return (
    <>
      <header className={s.header}>
        <div className={s.bar}>
          <div className={s.brand}>
            <svg width="26" height="34" viewBox="0 0 26 34" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="22" height="30" rx="11" fill="#fbf4e9" stroke="#26221d" strokeWidth="1.8" />
              <path d="M7.5 13 V10.5 H10 M16 10.5 H18.5 V13 M7.5 21 V23.5 H10 M16 23.5 H18.5 V21" stroke="#26221d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
              <circle cx="13" cy="17" r="1.9" fill="#b4622f" />
            </svg>
            <span>
              Câmeras <span className={s.brandAccent}>Rolante</span>
            </span>
          </div>
          <div className={s.right}>
            <Clock />
            {cameras.length > 0 && (
              <button className={s.gridBtn} onClick={() => setGrid(true)} title="Ver todas as câmeras" aria-label="Ver todas as câmeras">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <rect x="3" y="3" width="8" height="8" />
                  <rect x="13" y="3" width="8" height="8" />
                  <rect x="3" y="13" width="8" height="8" />
                  <rect x="13" y="13" width="8" height="8" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <h1 className={s.title}>Câmeras dos Rios - Rolante/RS</h1>
        <p className={s.sub}>
          Links das câmeras obtidos no portal{' '}
          <a href="https://alerta.rolante.ifrs.edu.br/niveis-rios-arroios" target="_blank" rel="noopener">
            alerta.rolante.ifrs.edu.br
          </a>
        </p>
      </header>

      {notice && (
        <div className={s.notice} role="status">
          {notice}
        </div>
      )}

      <main className={s.main}>
        {cameras.length === 0 ? (
          <p className={s.empty}>Nenhuma câmera ativa no momento.</p>
        ) : (
          <div className={`${s.columns} ${cameras.length === 1 ? s.solo : ''}`} style={{ '--cols': cols } as React.CSSProperties}>
            {cameras.map((c) => (
              <CameraCard
                key={c.id}
                cam={c}
                historyBatch={historyBatch}
                onOpenLive={() => setOverlay({ title: titleOf(c), live: c.streamUrl })}
                onOpenFrame={(f) => setOverlay({ title: `${titleOf(c)} · ${when(f)}`, frame: f.full })}
              />
            ))}
          </div>
        )}
      </main>

      {overlay && <Overlay {...overlay} onClose={() => setOverlay(null)} />}
      {grid && <GridView cameras={cameras} onClose={() => setGrid(false)} />}
    </>
  );
}
