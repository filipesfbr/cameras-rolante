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
  captureEnabled: boolean;
  intervalSec: number;
};

type OverlayState = { title: string; live?: string; frame?: string } | null;

const titleOf = (c: PublicCamera) => `${c.location} — ${c.name}`;
const when = (f: Frame) => `${f.day.slice(8)}/${f.day.slice(5, 7)}/${f.day.slice(0, 4)} ${f.t.slice(0, 2)}:${f.t.slice(2, 4)}:${f.t.slice(4)}`;

export default function CamerasApp({ cameras, historyBatch }: { cameras: PublicCamera[]; historyBatch: number }) {
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
        <div>
          <h1 className={s.title}>Câmeras dos Rios - Rolante/RS</h1>
          <div className={s.sub}>
            Links das câmeras obtidos no portal{' '}
            <a href="https://alerta.rolante.ifrs.edu.br/niveis-rios-arroios" target="_blank" rel="noopener">
              alerta.rolante.ifrs.edu.br
            </a>
          </div>
        </div>
        <div className={s.right}>
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
          <Clock />
        </div>
      </header>

      <main className={s.main}>
        {cameras.length === 0 ? (
          <p className={s.empty}>Nenhuma câmera ativa no momento.</p>
        ) : (
          <div className={s.columns} style={{ '--cols': cols } as React.CSSProperties}>
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
