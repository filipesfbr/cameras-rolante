'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addCamera, countPeriod, deletePeriod, logout, removeCamera, saveSettings, testCamera, updateCamera } from '@/app/admin/actions';
import type { Config } from '@/lib/config';
import s from './Admin.module.css';

const OPTIONS = [
  [300, '5 minutos'],
  [900, '15 minutos'],
  [1800, '30 minutos'],
  [3600, '1 hora'],
] as const;
const labelOf = (sec: number) => OPTIONS.find(([v]) => v === sec)?.[1] ?? `${Math.round(sec / 60)} min`;

type Msg = { ok: boolean; text: string } | null;
type R = { ok: true } | { ok: false; error: string };
const EMPTY = { name: '', location: '', streamUrl: '', sourceUrl: '', intervalSec: '' };

export default function AdminPanel({ config }: { config: Config }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  const [set, setSet] = useState({
    captureEnabled: config.captureEnabled,
    intervalSec: config.intervalSec,
    historyBatch: config.historyBatch,
    retentionDays: config.retentionDays,
  });
  const [nc, setNc] = useState(EMPTY);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ url: string; image: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [dp, setDp] = useState({ cam: config.cameras[0]?.id ?? '', from: '', to: '' });
  const [dpCount, setDpCount] = useState<number | null>(null);

  const run = (fn: () => Promise<R>, okText: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg({ ok: true, text: okText });
        after?.();
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });

  // estimativa de uso: ~200KB por print (full + thumb), no ritmo de cada câmera, durante a retenção
  const printsPerDay = config.cameras
    .filter((c) => c.captureEnabled)
    .reduce((n, c) => n + 86400 / (c.intervalSec ?? set.intervalSec), 0);
  const gb = (printsPerDay * set.retentionDays * 0.2) / 1024;

  const test = async () => {
    setTesting(true);
    setTested(null);
    setMsg(null);
    const r = await testCamera(nc.streamUrl.trim());
    setTesting(false);
    if (r.ok) setTested({ url: nc.streamUrl.trim(), image: r.image });
    else setMsg({ ok: false, text: `Teste falhou: ${r.error}` });
  };

  const canSave = !!nc.name.trim() && tested?.url === nc.streamUrl.trim();
  const dpReady = dp.cam && dp.from && dp.to && dp.from <= dp.to;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>Rolante — Admin</h1>
          <div className={s.sub}>Câmeras e histórico</div>
        </div>
        <a href="/">← ver página pública</a>
      </header>

      <main className={s.main}>
        {msg && <div className={`${s.msg} ${msg.ok ? s.ok : s.bad}`}>{msg.text}</div>}

        <section className={s.card}>
          <div className={s.cardTitle}>Configurações gerais</div>
          <div className={s.pills}>
            <button
              className={`${s.pill} ${set.captureEnabled ? s.on : s.offBad}`}
              onClick={() => setSet({ ...set, captureEnabled: !set.captureEnabled })}
            >
              {set.captureEnabled ? 'Captura ligada' : 'Captura desligada'}
            </button>
            <span className={s.hint}>Toggle mestre: desligado, nenhuma câmera grava no ciclo seguinte.</span>
          </div>
          <div className={s.fields}>
            <label className={s.field}>
              Intervalo padrão entre prints
              <select className={s.select} value={set.intervalSec} onChange={(e) => setSet({ ...set, intervalSec: Number(e.target.value) })}>
                {OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              Imagens no histórico
              <input className={`${s.input} ${s.narrow}`} type="number" min={4} max={24} value={set.historyBatch} onChange={(e) => setSet({ ...set, historyBatch: Number(e.target.value) })} />
            </label>
            <label className={s.field}>
              Retenção (dias)
              <input className={`${s.input} ${s.narrow}`} type="number" min={1} max={365} value={set.retentionDays} onChange={(e) => setSet({ ...set, retentionDays: Number(e.target.value) })} />
            </label>
            <button className={s.btn} disabled={pending} onClick={() => run(() => saveSettings(set), 'Configurações salvas.')}>
              Salvar
            </button>
          </div>
          <div className={s.hint}>
            Estimativa de uso: ~{printsPerDay.toFixed(0)} prints/dia, ~{gb.toFixed(1)} GB guardados em {set.retentionDays} dias (free tier do R2: 10 GB). As imagens
            iniciais da faixa são só o primeiro lote; o público rola até o fim da retenção.
          </div>
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <div className={s.cardTitle}>Câmeras</div>
            <button className={s.btn} onClick={() => setShowAdd(!showAdd)}>
              + Adicionar câmera
            </button>
          </div>

          {showAdd && (
            <div className={s.inner}>
              <input className={s.input} placeholder="Nome do ponto (ex: Ponte do Grassmann)" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
              <input className={s.input} placeholder="Rio / local" value={nc.location} onChange={(e) => setNc({ ...nc, location: e.target.value })} />
              <input className={s.input} placeholder="URL do stream (m3u8, https)" value={nc.streamUrl} onChange={(e) => setNc({ ...nc, streamUrl: e.target.value })} />
              <input className={s.input} placeholder="URL da página fonte" value={nc.sourceUrl} onChange={(e) => setNc({ ...nc, sourceUrl: e.target.value })} />
              <label className={s.field}>
                Intervalo desta câmera
                <select className={s.select} value={nc.intervalSec} onChange={(e) => setNc({ ...nc, intervalSec: e.target.value })}>
                  <option value="">Padrão ({labelOf(set.intervalSec)})</option>
                  {OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {tested?.url === nc.streamUrl.trim() && <img className={s.preview} src={tested.image} alt="Frame de teste" />}
              <div className={s.actions}>
                <button className={s.ghost} disabled={testing || !nc.streamUrl.trim()} onClick={test}>
                  {testing ? 'Testando…' : 'Testar câmera'}
                </button>
                <button
                  className={s.btn}
                  disabled={pending || !canSave}
                  title={canSave ? '' : 'Teste a câmera com sucesso antes de salvar'}
                  onClick={() =>
                    run(
                      () => addCamera({ ...nc, intervalSec: nc.intervalSec ? Number(nc.intervalSec) : undefined }),
                      'Câmera adicionada.',
                      () => {
                        setNc(EMPTY);
                        setTested(null);
                        setShowAdd(false);
                      },
                    )
                  }
                >
                  Salvar
                </button>
                <button className={s.ghost} onClick={() => setShowAdd(false)}>
                  Cancelar
                </button>
              </div>
              <div className={s.hint}>O teste puxa um frame do servidor, do mesmo jeito que a captura. Só entram URLs https públicas.</div>
            </div>
          )}

          {config.cameras.map((c) => (
            <div key={c.id} className={s.inner}>
              <div className={s.camTop}>
                <div>
                  <div className={s.camName}>
                    {c.location} — {c.name}
                  </div>
                  <div className={s.mono}>{c.streamUrl}</div>
                </div>
                {confirmRemove === c.id ? (
                  <div className={s.actions}>
                    <button className={s.dangerSolid} disabled={pending} onClick={() => run(() => removeCamera(c.id), 'Câmera removida.', () => setConfirmRemove(null))}>
                      Confirmar remoção
                    </button>
                    <button className={s.ghost} onClick={() => setConfirmRemove(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button className={s.danger} onClick={() => setConfirmRemove(c.id)}>
                    Remover
                  </button>
                )}
              </div>
              <div className={s.pills}>
                <button className={`${s.pill} ${c.active ? s.on : s.offBad}`} disabled={pending} onClick={() => run(() => updateCamera(c.id, { active: !c.active }), c.active ? 'Câmera oculta do site.' : 'Câmera visível no site.')}>
                  {c.active ? 'Ativa' : 'Inativa'}
                </button>
                <button
                  className={`${s.pill} ${c.captureEnabled ? s.on : s.offMuted}`}
                  disabled={pending}
                  onClick={() => run(() => updateCamera(c.id, { captureEnabled: !c.captureEnabled }), c.captureEnabled ? 'Histórico desligado.' : 'Histórico ligado.')}
                >
                  {c.captureEnabled ? 'Histórico: ligado' : 'Histórico: desligado'}
                </button>
                <select
                  className={s.select}
                  value={c.intervalSec ?? ''}
                  disabled={pending}
                  aria-label="Intervalo desta câmera"
                  onChange={(e) => run(() => updateCamera(c.id, { intervalSec: e.target.value ? Number(e.target.value) : null }), 'Intervalo atualizado.')}
                >
                  <option value="">Padrão ({labelOf(config.intervalSec)})</option>
                  {OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {config.cameras.length === 0 && <div className={s.hint}>Nenhuma câmera cadastrada.</div>}
        </section>

        <section className={s.card}>
          <div className={s.cardTitle}>Apagar período</div>
          <div className={s.hint}>Remove prints do bucket de forma definitiva. O sistema conta antes e pede confirmação.</div>
          <div className={s.fields}>
            <label className={s.field}>
              Câmera
              <select className={s.select} value={dp.cam} onChange={(e) => (setDp({ ...dp, cam: e.target.value }), setDpCount(null))}>
                {config.cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.location} — {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              De
              <input className={s.input} type="date" value={dp.from} onChange={(e) => (setDp({ ...dp, from: e.target.value }), setDpCount(null))} />
            </label>
            <label className={s.field}>
              Até
              <input className={s.input} type="date" value={dp.to} onChange={(e) => (setDp({ ...dp, to: e.target.value }), setDpCount(null))} />
            </label>
            <button
              className={s.ghost}
              disabled={pending || !dpReady}
              onClick={() =>
                start(async () => {
                  const r = await countPeriod(dp.cam, dp.from, dp.to);
                  if (r.ok) setDpCount(r.count);
                  else setMsg({ ok: false, text: r.error });
                })
              }
            >
              Contar
            </button>
          </div>
          {dpCount !== null && (
            <div className={s.actions}>
              <span className={s.hint}>
                {dpCount} objetos (~{Math.round(dpCount / 2)} prints) entre {dp.from} e {dp.to}.
              </span>
              {dpCount > 0 && (
                <button
                  className={s.dangerSolid}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await deletePeriod(dp.cam, dp.from, dp.to);
                      if (r.ok) {
                        setMsg({ ok: true, text: `${r.count} objetos apagados.` });
                        setDpCount(null);
                        router.refresh();
                      } else setMsg({ ok: false, text: r.error });
                    })
                  }
                >
                  Apagar definitivamente
                </button>
              )}
            </div>
          )}
        </section>

        <form action={logout}>
          <button className={s.ghost} type="submit">
            Sair
          </button>
        </form>
      </main>
    </div>
  );
}
