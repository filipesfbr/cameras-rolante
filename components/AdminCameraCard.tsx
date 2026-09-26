'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { captureCamera, countCameraShots, editCamera, moveCamera, removeCamera, testCamera, updateCamera } from '@/app/admin/actions';
import type { Camera } from '@/lib/config';
import type { CaptureStatus } from '@/lib/state';
import type { Frame } from '@/lib/storage';
import s from './Admin.module.css';
import AdminToggle from './AdminToggle';
import { OPTIONS, agoText, labelOf } from './adminUi';

type R = { ok: true } | { ok: false; error: string };

export default function AdminCameraCard({
  cam,
  index,
  total,
  master,
  intervalSec,
  status,
  shot,
  onCaptured,
  onGallery,
  report,
}: {
  cam: Camera;
  index: number;
  total: number;
  master: boolean;
  intervalSec: number;
  status?: CaptureStatus;
  shot?: Frame;
  onCaptured: (frame: Frame) => void;
  onGallery: () => void;
  report: (ok: boolean, text: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [ec, setEc] = useState({ name: '', location: '', streamUrl: '', sourceUrl: '' });
  const [editTested, setEditTested] = useState<{ url: string; image: string } | null>(null);
  const [editTesting, setEditTesting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeCount, setRemoveCount] = useState<number | null>(null);
  const [removeShots, setRemoveShots] = useState(false);

  const run = (fn: () => Promise<R>, okText: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        report(true, okText);
        after?.();
        router.refresh();
      } else report(false, r.error);
    });

  const badge = (() => {
    if (!master) return { cls: s.offMuted, tone: s.camMuted, text: 'Captura mestra desligada' };
    if (!cam.captureEnabled) return { cls: s.offMuted, tone: s.camMuted, text: 'Prints pausados' };
    if (!status) return { cls: s.offMuted, tone: s.camMuted, text: 'Sem prints ainda' };
    const ago = Date.now() - status.at;
    if (!status.ok) return { cls: s.offBad, tone: s.camBad, text: `Falhou ${agoText(ago)}`, title: status.error };
    if (ago > 2 * intervalSec * 1000) return { cls: s.offWarn, tone: s.camBad, text: `Atrasado — último print ${agoText(ago)}` };
    return { cls: s.on, tone: s.camOk, text: `Último print ${agoText(ago)}` };
  })();

  const toggleEdit = () => {
    if (!editOpen) {
      setEc({ name: cam.name, location: cam.location, streamUrl: cam.streamUrl, sourceUrl: cam.sourceUrl ?? '' });
      setEditTested(null);
    }
    setEditOpen(!editOpen);
  };

  const testEdit = async () => {
    setEditTesting(true);
    setEditTested(null);
    const r = await testCamera(ec.streamUrl.trim());
    setEditTesting(false);
    if (r.ok) setEditTested({ url: ec.streamUrl.trim(), image: r.image });
    else report(false, `Teste falhou: ${r.error}`);
  };

  const askRemove = () =>
    start(async () => {
      setConfirmRemove(true);
      setRemoveShots(false);
      setRemoveCount(null);
      const r = await countCameraShots(cam.id);
      if (r.ok) setRemoveCount(r.count);
      else report(false, r.error);
    });

  const capture = () =>
    start(async () => {
      const r = await captureCamera(cam.id);
      if (r.ok) {
        onCaptured(r.frame);
        report(true, 'Print capturado e gravado no bucket.');
      } else report(false, r.error);
    });

  const urlChanged = editOpen && ec.streamUrl.trim() !== cam.streamUrl;
  const canSaveEdit = !!ec.name.trim() && (!urlChanged || editTested?.url === ec.streamUrl.trim());

  return (
    <div className={`${s.cam} ${badge.tone}`}>
      <div className={s.camTop}>
        <div className={s.camInfo}>
          <div className={s.camName}>
            {cam.location} — {cam.name}
          </div>
          <div className={s.mono}>{cam.streamUrl}</div>
          <span className={`${s.badge} ${badge.cls}`} title={badge.title}>
            {badge.text}
          </span>
        </div>
        <div className={s.actions}>
          <button className={s.ghost} disabled={index === 0 || pending} onClick={() => run(() => moveCamera(cam.id, -1), 'Ordem atualizada.')} title="Mover para cima" aria-label="Mover para cima">
            ↑
          </button>
          <button className={s.ghost} disabled={index === total - 1 || pending} onClick={() => run(() => moveCamera(cam.id, 1), 'Ordem atualizada.')} title="Mover para baixo" aria-label="Mover para baixo">
            ↓
          </button>
          {!confirmRemove && (
            <button className={s.danger} onClick={askRemove}>
              Remover
            </button>
          )}
        </div>
      </div>

      {confirmRemove && (
        <div className={s.editBox}>
          <div className={s.hint}>A câmera sai do site e do agendador. Sem marcar a opção, os prints continuam no bucket até a retenção varrer.</div>
          <label className={s.check}>
            <input type="checkbox" checked={removeShots} disabled={pending} onChange={(e) => setRemoveShots(e.target.checked)} />
            apagar também os prints {removeCount === null ? '(contando…)' : `(${removeCount} objetos)`}
          </label>
          <div className={s.actions}>
            <button
              className={s.dangerSolid}
              disabled={pending}
              onClick={() =>
                run(() => removeCamera(cam.id, removeShots), 'Câmera removida.', () => {
                  setConfirmRemove(false);
                  setRemoveCount(null);
                })
              }
            >
              Confirmar remoção
            </button>
            <button className={s.ghost} disabled={pending} onClick={() => setConfirmRemove(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className={s.controls}>
        <AdminToggle
          name="Exibir no site"
          checked={cam.active}
          disabled={pending}
          onChange={() => run(() => updateCamera(cam.id, { active: !cam.active }), cam.active ? 'Câmera oculta do site.' : 'Câmera visível no site.')}
          on="Visível"
          off="Oculta"
        />
        <AdminToggle
          name="Gravar prints"
          checked={cam.captureEnabled}
          disabled={pending}
          onChange={() => run(() => updateCamera(cam.id, { captureEnabled: !cam.captureEnabled }), cam.captureEnabled ? 'Prints pausados.' : 'Prints gravando.')}
          on="Gravando"
          off="Pausado"
        />
        <label className={s.intervalRow}>
          <span className={s.toggleName}>Intervalo entre prints</span>
          <select
            className={s.select}
            value={cam.intervalSec ?? ''}
            disabled={pending}
            onChange={(e) => run(() => updateCamera(cam.id, { intervalSec: e.target.value ? Number(e.target.value) : null }), 'Intervalo atualizado.')}
          >
            <option value="">Padrão ({labelOf(intervalSec)})</option>
            {OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {editOpen && (
        <div className={s.editBox}>
          <input className={s.input} placeholder="Nome do ponto" value={ec.name} onChange={(e) => setEc({ ...ec, name: e.target.value })} />
          <input className={s.input} placeholder="Rio / local" value={ec.location} onChange={(e) => setEc({ ...ec, location: e.target.value })} />
          <input
            className={s.input}
            placeholder="URL do stream (m3u8, https)"
            value={ec.streamUrl}
            onChange={(e) => {
              setEc({ ...ec, streamUrl: e.target.value });
              setEditTested(null);
            }}
          />
          <input className={s.input} placeholder="URL da página fonte" value={ec.sourceUrl} onChange={(e) => setEc({ ...ec, sourceUrl: e.target.value })} />
          {editTested?.url === ec.streamUrl.trim() && <img className={s.preview} src={editTested.image} alt="Frame de teste" />}
          <div className={s.hint}>O id da câmera não muda: os prints já gravados continuam ligados a ela.</div>
          <div className={s.actions}>
            {urlChanged && (
              <button className={s.ghost} disabled={editTesting || !ec.streamUrl.trim()} onClick={testEdit}>
                {editTesting ? 'Testando…' : 'Testar nova URL'}
              </button>
            )}
            <button
              className={s.btn}
              disabled={pending || !canSaveEdit}
              title={canSaveEdit ? '' : 'Teste a nova URL antes de salvar'}
              onClick={() =>
                run(() => editCamera(cam.id, ec), 'Câmera atualizada.', () => {
                  setEditOpen(false);
                  setEditTested(null);
                })
              }
            >
              Salvar
            </button>
            <button className={s.ghost} onClick={() => setEditOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className={s.actions}>
        <button className={s.ghost} disabled={pending} onClick={capture}>
          Capturar agora
        </button>
        <button className={s.ghost} onClick={toggleEdit}>
          {editOpen ? 'Fechar edição' : 'Editar'}
        </button>
        <button className={s.ghost} onClick={onGallery}>
          Prints
        </button>
        <a className={s.ghost} href="/" target="_blank" rel="noopener">
          Abrir no site
        </a>
      </div>

      {shot && <img className={s.shot} src={shot.thumb} alt="Último print capturado" title="Último print capturado agora" />}
    </div>
  );
}
