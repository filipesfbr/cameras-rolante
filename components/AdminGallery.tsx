'use client';

import { useEffect, useState, useTransition } from 'react';
import { adminDayFrames, adminDays, deletePeriod } from '@/app/admin/actions';
import type { Camera } from '@/lib/config';
import type { Frame } from '@/lib/storage';
import admin from './Admin.module.css';
import s from './AdminGallery.module.css';
import Overlay from './Overlay';

const label = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const hhmm = (t: string) => `${t.slice(0, 2)}:${t.slice(2, 4)}`;
const when = (f: Frame) => `${label(f.day)} ${hhmm(f.t)}:${f.t.slice(4)}`;

type Msg = { ok: boolean; text: string } | null;

export default function AdminGallery({
  cameras,
  cam,
  onCamChange,
}: {
  cameras: Camera[];
  cam: string;
  onCamChange: (id: string) => void;
}) {
  const [days, setDays] = useState<string[]>([]);
  const [day, setDay] = useState('');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [open, setOpen] = useState<Frame | null>(null);
  const [confirmDay, setConfirmDay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [version, setVersion] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    setMsg(null);
    setFrames([]);
    setOpen(null);
    setConfirmDay(false);
    setDay('');
    if (!cam) return void setDays([]);
    setLoading(true);
    void adminDays(cam).then((r) => {
      if (!alive) return;
      if (r.ok) {
        const list = [...r.days].reverse();
        setDays(list);
        setDay(list[0] ?? '');
      } else setMsg({ ok: false, text: r.error });
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [cam, version]);

  useEffect(() => {
    let alive = true;
    if (!cam || !day) return;
    setLoading(true);
    void adminDayFrames(cam, day).then((r) => {
      if (!alive) return;
      setFrames(r.ok ? r.frames : []);
      if (!r.ok) setMsg({ ok: false, text: r.error });
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [cam, day, version]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const del = () =>
    start(async () => {
      const r = await deletePeriod(cam, day, day);
      if (r.ok) {
        setMsg({ ok: true, text: `${r.count} objetos apagados em ${label(day)}.` });
        setConfirmDay(false);
        setVersion((v) => v + 1);
      } else setMsg({ ok: false, text: r.error });
    });

  const camera = cameras.find((c) => c.id === cam);

  return (
    <section id="galeria" className={admin.card}>
      <div className={admin.cardHead}>
        <div className={admin.cardTitle}>Galeria de prints</div>
        <span className={admin.hint}>Clique na miniatura para ampliar</span>
      </div>

      <div className={admin.fields}>
        <label className={admin.field}>
          Câmera
          <select className={admin.select} value={cam} onChange={(e) => onCamChange(e.target.value)}>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.location} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={admin.field}>
          Dia
          <select className={admin.select} value={day} disabled={!days.length} onChange={(e) => setDay(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>
                {label(d)}
              </option>
            ))}
          </select>
        </label>
        <button className={admin.ghost} disabled={loading || !cam} onClick={() => setVersion((v) => v + 1)}>
          Atualizar
        </button>
      </div>

      {msg && <div className={`${admin.msg} ${msg.ok ? admin.ok : admin.bad}`}>{msg.text}</div>}
      {loading && <div className={admin.hint}>Carregando…</div>}
      {!loading && !days.length && <div className={admin.hint}>Nenhum print gravado para esta câmera.</div>}

      {frames.length > 0 && (
        <>
          <div className={admin.actions}>
            <span className={admin.hint}>
              {frames.length} {frames.length === 1 ? 'print' : 'prints'} em {label(day)} (~{frames.length * 2} objetos).
            </span>
            {confirmDay ? (
              <>
                <button className={admin.dangerSolid} disabled={pending} onClick={del}>
                  Confirmar exclusão
                </button>
                <button className={admin.ghost} disabled={pending} onClick={() => setConfirmDay(false)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button className={admin.danger} onClick={() => setConfirmDay(true)}>
                Apagar o dia inteiro
              </button>
            )}
          </div>
          <div className={s.grid}>
            {frames.map((f) => (
              <button key={f.id} className={s.thumb} onClick={() => setOpen(f)} title={`${when(f)} — clique para ampliar`}>
                <img src={f.thumb} alt="" loading="lazy" decoding="async" width={96} height={64} />
                <span className={s.time}>{hhmm(f.t)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <Overlay
          title={`${camera ? `${camera.location} — ${camera.name}` : cam} · ${when(open)}`}
          frame={open.full}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
