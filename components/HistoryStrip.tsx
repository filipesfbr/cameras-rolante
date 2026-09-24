'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame } from '@/lib/storage';
import s from './HistoryStrip.module.css';

const POLL_MS = 60_000;
const LIVE_EDGE_PX = 8; // "na ponta ao vivo" = scroll colado à esquerda (mais recente à esquerda)

const hhmm = (t: string) => `${t.slice(0, 2)}:${t.slice(2, 4)}`;
const ddmm = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}`;

async function fetchFrames(cam: string, qs: string): Promise<Frame[]> {
  const r = await fetch(`/api/frames?cam=${encodeURIComponent(cam)}&${qs}`);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).frames;
}

/**
 * Faixa horizontal: lote inicial de K thumbs, scroll infinito pra direita (mais antigos),
 * print novo entra sozinho na esquerda, mas só se o usuário estiver na ponta ao vivo.
 */
export default function HistoryStrip({ cam, batch, intervalMin, selected, onOpen, onFrames }: { cam: string; batch: number; intervalMin: number; selected: string | null; onOpen: (f: Frame) => void; onFrames: (f: Frame[]) => void }) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const buffer = useRef<Frame[]>([]); // chegaram enquanto o usuário estava no passado
  const [buffered, setBuffered] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const oldest = useRef<string | null>(null);
  const newest = useRef<string | null>(null);

  const loadOlder = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const got = await fetchFrames(cam, oldest.current ? `before=${oldest.current}&limit=${batch}` : `limit=${batch}`);
      if (got.length) {
        setFrames((f) => [...f, ...got]);
        oldest.current = got[got.length - 1].id;
        newest.current ??= got[0].id;
      }
      setMore(got.length >= batch);
      setStatus('ready');
    } catch {
      setStatus('error');
      setMore(false);
    } finally {
      busy.current = false;
    }
  }, [cam, batch]);

  useEffect(() => {
    void loadOlder();
  }, [loadOlder]);

  // o card navega pelas setas usando esta lista
  useEffect(() => onFrames(frames), [frames, onFrames]);

  // seta mudou o print: traz o thumb selecionado pra dentro da faixa (só rola a faixa, nunca a página).
  // Chegar na ponta direita também dispara o scroll infinito.
  useEffect(() => {
    const sc = scroller.current;
    const el = sc?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!sc || !el) return;
    const a = el.getBoundingClientRect();
    const b = sc.getBoundingClientRect();
    if (a.left < b.left) sc.scrollBy({ left: a.left - b.left - 8, behavior: 'smooth' });
    else if (a.right > b.right) sc.scrollBy({ left: a.right - b.right + 8, behavior: 'smooth' });
  }, [selected]);

  // scroll infinito: sentinela na ponta direita. Recria ao crescer a lista pra re-checar se ainda está visível.
  useEffect(() => {
    if (!more || status !== 'ready' || !sentinel.current) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void loadOlder(), {
      root: scroller.current,
      rootMargin: '0px 160px 0px 0px',
    });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [more, status, frames.length, loadOlder]);

  const flush = useCallback(() => {
    const b = buffer.current;
    if (!b.length) return;
    buffer.current = [];
    setBuffered(0);
    setFrames((f) => [...b, ...f]);
  }, []);

  // polling de prints novos
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        if (!newest.current) return void (await loadOlder()); // câmera ainda sem nenhum print
        const got = await fetchFrames(cam, `after=${newest.current}&limit=48`);
        if (!got.length) return;
        newest.current = got[0].id;
        const atLive = (scroller.current?.scrollLeft ?? 0) < LIVE_EDGE_PX;
        if (atLive) setFrames((f) => [...got, ...f]);
        else {
          buffer.current = [...got, ...buffer.current];
          setBuffered(buffer.current.length);
        }
      } catch {
        /* próxima volta tenta de novo */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [cam, loadOlder]);

  const showNew = () => {
    flush();
    scroller.current?.scrollTo({ left: 0 });
  };

  return (
    <div className={s.panel}>
      <div className={s.eyebrow}>
        Histórico · a cada {intervalMin} min
        {buffered > 0 && (
          <button className={s.news} onClick={showNew}>
            {buffered} {buffered === 1 ? 'nova' : 'novas'}
          </button>
        )}
      </div>

      {status === 'loading' && <div className={s.hint}>Carregando…</div>}
      {status === 'error' && frames.length === 0 && (
        <div className={s.hint}>
          Não foi possível carregar.{' '}
          <button
            className={s.retry}
            onClick={() => {
              setStatus('loading');
              setMore(true);
              void loadOlder();
            }}
          >
            tentar de novo
          </button>
        </div>
      )}
      {status === 'ready' && frames.length === 0 && <div className={s.hint}>Sem prints ainda para esta câmera.</div>}

      {frames.length > 0 && (
        <div
          ref={scroller}
          className={s.strip}
          data-history-scroll
          onScroll={(e) => e.currentTarget.scrollLeft < LIVE_EDGE_PX && flush()}
        >
          {frames.map((f, i) => (
            <button key={f.id} className={`${s.item} ${f.id === selected ? s.selected : ''}`} aria-pressed={f.id === selected} onClick={() => onOpen(f)} title={`${ddmm(f.day)} ${hhmm(f.t)}`}>
              <span className={s.thumb}>
                <img src={f.thumb} alt="" loading="lazy" decoding="async" width={96} height={64} />
                {(i === 0 || frames[i - 1].day !== f.day) && <span className={s.day}>{ddmm(f.day)}</span>}
              </span>
              <span className={s.time}>{hhmm(f.t)}</span>
            </button>
          ))}
          {more && <div ref={sentinel} className={s.sentinel} />}
        </div>
      )}
    </div>
  );
}
