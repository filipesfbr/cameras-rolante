'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { addCamera, captureStatus, countPeriod, deletePeriod, logout, saveSettings, storageUsage, testCamera } from '@/app/admin/actions';
import type { Config } from '@/lib/config';
import type { CaptureStatus } from '@/lib/state';
import type { Frame } from '@/lib/storage';
import AdminCameraCard from './AdminCameraCard';
import AdminGallery from './AdminGallery';
import AdminToggle from './AdminToggle';
import { OPTIONS, agoText, fmtBytes, fmtExact, labelOf } from './adminUi';
import s from './Admin.module.css';

type Msg = { ok: boolean; text: string } | null;
type R = { ok: true } | { ok: false; error: string };
const EMPTY = { name: '', location: '', streamUrl: '', sourceUrl: '', intervalSec: '' };
const MB_PER_PRINT = 0.2; // full (~180 KB) + thumb (~10 KB) + folga

export default function AdminPanel({ config }: { config: Config }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  const [settings, setSettings] = useState({
    captureEnabled: config.captureEnabled,
    intervalSec: config.intervalSec,
    historyBatch: config.historyBatch,
    retentionDays: config.retentionDays,
    notice: config.notice ?? '',
  });
  const [newCam, setNewCam] = useState(EMPTY);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ url: string; image: string } | null>(null);
  const [delPeriod, setDelPeriod] = useState({ cam: config.cameras[0]?.id ?? '', from: '', to: '' });
  const [delCount, setDelCount] = useState<number | null>(null);

  const [status, setStatus] = useState<Record<string, CaptureStatus>>({});
  const [shots, setShots] = useState<Record<string, Frame>>({});
  const [usage, setUsage] = useState<{ bytes: number; count: number; prints: number; at: number } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [galleryCam, setGalleryCam] = useState(config.cameras[0]?.id ?? '');

  const report = useCallback((ok: boolean, text: string) => setMsg({ ok, text }), []);

  const loadStatus = useCallback(async () => {
    const r = await captureStatus();
    if (r.ok) setStatus(r.status);
  }, []);

  const measure = useCallback(async () => {
    setMeasuring(true);
    const r = await storageUsage();
    setMeasuring(false);
    if (r.ok) setUsage({ bytes: r.bytes, count: r.count, prints: r.prints, at: r.at });
  }, []);

  useEffect(() => {
    void loadStatus();
    void measure();
    const id = setInterval(loadStatus, 60_000);
    return () => clearInterval(id);
  }, [loadStatus, measure]);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(id);
  }, [msg]);

  const run = (fn: () => Promise<R>, okText: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        report(true, okText);
        after?.();
        router.refresh();
      } else report(false, r.error);
    });

  const recording = config.cameras.filter((c) => c.captureEnabled);
  const visible = config.cameras.filter((c) => c.active).length;
  const recordingCount = config.captureEnabled ? recording.length : 0;
  const printsPerDay = config.captureEnabled ? recording.reduce((n, c) => n + 86400 / (c.intervalSec ?? settings.intervalSec), 0) : 0;
  const gb = (printsPerDay * settings.retentionDays * MB_PER_PRINT) / 1024;

  let okCount = 0;
  let lateCount = 0;
  let failCount = 0;
  if (config.captureEnabled)
    for (const c of recording) {
      const st = status[c.id];
      if (!st) continue;
      if (!st.ok) failCount++;
      else if (Date.now() - st.at > 2 * (c.intervalSec ?? config.intervalSec) * 1000) lateCount++;
      else okCount++;
    }
  const healthCls = !config.captureEnabled ? '' : failCount ? s.kpiBad : lateCount ? s.kpiWarn : s.kpiOk;
  const healthValue = config.captureEnabled ? `${okCount} ok` : 'Pausada';
  const healthHint = config.captureEnabled ? `${lateCount} atrasadas · ${failCount} falhas` : 'captura mestra desligada';

  const test = async () => {
    setTesting(true);
    setTested(null);
    const r = await testCamera(newCam.streamUrl.trim());
    setTesting(false);
    if (r.ok) setTested({ url: newCam.streamUrl.trim(), image: r.image });
    else report(false, `Teste falhou: ${r.error}`);
  };

  const canSave = !!newCam.name.trim() && tested?.url === newCam.streamUrl.trim();
  const delReady = !!delPeriod.cam && !!delPeriod.from && !!delPeriod.to && delPeriod.from <= delPeriod.to;

  const onCaptured = (id: string, frame: Frame) => {
    setShots((p) => ({ ...p, [id]: frame }));
    setStatus((p) => ({ ...p, [id]: { at: Date.now(), ok: true } }));
  };

  const gotoGallery = (id: string) => {
    setGalleryCam(id);
    document.getElementById('galeria')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const gcam = config.cameras.some((c) => c.id === galleryCam) ? galleryCam : config.cameras[0]?.id ?? '';

  return (
    <div className={s.page}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <h1 className={s.title}>Rolante — Admin</h1>
          <span className={`${s.badge} ${settings.captureEnabled ? s.on : s.offBad}`}>{settings.captureEnabled ? 'Captura ligada' : 'Captura desligada'}</span>
        </div>
        <div className={s.topActions}>
          <button
            className={s.ghost}
            onClick={() => {
              void loadStatus();
              void measure();
              router.refresh();
            }}
          >
            Atualizar
          </button>
          <a className={s.ghost} href="/" target="_blank" rel="noopener">
            Ver site
          </a>
          <form action={logout}>
            <button className={s.ghost} type="submit">
              Sair
            </button>
          </form>
        </div>
      </header>

      <div className={s.content}>
        <div className={s.kpis}>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Câmeras</span>
            <span className={s.kpiValue}>
              {visible}/{config.cameras.length}
            </span>
            <span className={s.kpiHint}>visíveis no site</span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Gravando</span>
            <span className={s.kpiValue}>{recordingCount}</span>
            <span className={s.kpiHint}>{config.captureEnabled ? 'com histórico ativo' : 'captura mestra desligada'}</span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Prints guardados</span>
            <span className={s.kpiValue}>{usage ? usage.prints.toLocaleString('pt-BR') : measuring ? '…' : '—'}</span>
            <span className={s.kpiHint}>{usage ? `~${printsPerDay.toFixed(0)}/dia no ritmo atual` : 'medindo o bucket…'}</span>
          </div>
          <div className={s.kpi}>
            <span className={s.kpiLabel}>Armazenamento</span>
            <span className={s.kpiValue} title={usage ? fmtExact(usage.bytes) : undefined}>
              {usage ? fmtBytes(usage.bytes) : measuring ? '…' : `~${fmtBytes(gb * 1024 ** 3)}`}
            </span>
            <span className={s.kpiHint}>
              {usage ? `${usage.count.toLocaleString('pt-BR')} objetos · medido ${agoText(Date.now() - usage.at)}` : `estimado · retenção de ${settings.retentionDays} dias`}
            </span>
          </div>
          <div className={`${s.kpi} ${healthCls}`}>
            <span className={s.kpiLabel}>Saúde</span>
            <span className={s.kpiValue}>{healthValue}</span>
            <span className={s.kpiHint}>{healthHint}</span>
          </div>
        </div>

        <div className={s.grid}>
          <div className={s.mainCol}>
            <section className={s.card}>
              <div className={s.cardHead}>
                <div>
                  <div className={s.cardTitle}>Câmeras</div>
                  <div className={s.cardSub}>
                    {config.cameras.length} cadastrada{config.cameras.length === 1 ? '' : 's'} · {visible} visível{visible === 1 ? '' : 'is'} no site
                  </div>
                </div>
                <button className={s.btn} onClick={() => setShowAdd(!showAdd)}>
                  + Adicionar câmera
                </button>
              </div>

              {showAdd && (
                <div className={s.editBox}>
                  <input className={s.input} placeholder="Nome do ponto (ex.: Ponte do Grassmann)" value={newCam.name} onChange={(e) => setNewCam({ ...newCam, name: e.target.value })} />
                  <input className={s.input} placeholder="Rio / local" value={newCam.location} onChange={(e) => setNewCam({ ...newCam, location: e.target.value })} />
                  <input className={s.input} placeholder="URL do stream (m3u8, https)" value={newCam.streamUrl} onChange={(e) => setNewCam({ ...newCam, streamUrl: e.target.value })} />
                  <input className={s.input} placeholder="URL da página fonte" value={newCam.sourceUrl} onChange={(e) => setNewCam({ ...newCam, sourceUrl: e.target.value })} />
                  <label className={s.field}>
                    Intervalo desta câmera
                    <select className={s.select} value={newCam.intervalSec} onChange={(e) => setNewCam({ ...newCam, intervalSec: e.target.value })}>
                      <option value="">Padrão ({labelOf(settings.intervalSec)})</option>
                      {OPTIONS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  {tested?.url === newCam.streamUrl.trim() && <img className={s.preview} src={tested.image} alt="Frame de teste" />}
                  <div className={s.hint}>O teste puxa um frame do servidor, do mesmo jeito que a captura. Só entram URLs https públicas.</div>
                  <div className={s.actions}>
                    <button className={s.ghost} disabled={testing || !newCam.streamUrl.trim()} onClick={test}>
                      {testing ? 'Testando…' : 'Testar câmera'}
                    </button>
                    <button
                      className={s.btn}
                      disabled={pending || !canSave}
                      title={canSave ? '' : 'Teste a câmera com sucesso antes de salvar'}
                      onClick={() =>
                        run(
                          () => addCamera({ ...newCam, intervalSec: newCam.intervalSec ? Number(newCam.intervalSec) : undefined }),
                          'Câmera adicionada.',
                          () => {
                            setNewCam(EMPTY);
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
                </div>
              )}

              {config.cameras.length === 0 ? (
                <div className={s.hint}>Nenhuma câmera cadastrada.</div>
              ) : (
                <div className={s.cams}>
                  {config.cameras.map((c, i) => (
                    <AdminCameraCard
                      key={c.id}
                      cam={c}
                      index={i}
                      total={config.cameras.length}
                      master={settings.captureEnabled}
                      intervalSec={c.intervalSec ?? config.intervalSec}
                      status={status[c.id]}
                      shot={shots[c.id]}
                      onCaptured={(frame) => onCaptured(c.id, frame)}
                      onGallery={() => gotoGallery(c.id)}
                      report={report}
                    />
                  ))}
                </div>
              )}
            </section>

            {config.cameras.length > 0 && <AdminGallery cameras={config.cameras} cam={gcam} onCamChange={setGalleryCam} />}
          </div>

          <aside className={s.aside}>
            <section className={s.card}>
              <div className={s.cardTitle}>Configurações gerais</div>
              <div className={s.controlsRow}>
                <AdminToggle
                  name="Gravar prints (todas as câmeras)"
                  checked={settings.captureEnabled}
                  onChange={() => setSettings({ ...settings, captureEnabled: !settings.captureEnabled })}
                  on="Ligada"
                  off="Desligada"
                />
              </div>
              <div className={s.hint}>Desligado = nenhuma câmera grava no ciclo seguinte, nem as com "Gravar prints" ligado.</div>
              <div className={s.fieldsCol}>
                <label className={s.field}>
                  Intervalo padrão entre prints
                  <select className={s.select} value={settings.intervalSec} onChange={(e) => setSettings({ ...settings, intervalSec: Number(e.target.value) })}>
                    {OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>
                  Imagens no histórico
                  <input className={s.input} type="number" min={4} max={48} value={settings.historyBatch} onChange={(e) => setSettings({ ...settings, historyBatch: Number(e.target.value) })} />
                </label>
                <label className={s.field}>
                  Retenção (dias)
                  <input className={s.input} type="number" min={1} max={365} value={settings.retentionDays} onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })} />
                </label>
                <label className={s.field}>
                  Aviso na página pública (opcional)
                  <textarea
                    className={`${s.input} ${s.notice}`}
                    rows={3}
                    maxLength={280}
                    value={settings.notice}
                    onChange={(e) => setSettings({ ...settings, notice: e.target.value })}
                    placeholder="Ex.: Rio em elevação — acompanhe os níveis."
                  />
                </label>
                <button className={s.btn} disabled={pending} onClick={() => run(() => saveSettings(settings), 'Configurações salvas.')}>
                  Salvar
                </button>
              </div>
              <div className={s.hint}>
                ~{printsPerDay.toFixed(0)} prints/dia e ~{fmtBytes(gb * 1024 ** 3)} guardados na retenção (free tier do R2: 10 GB).
              </div>
            </section>

            <section className={`${s.card} ${s.dangerCard}`}>
              <div className={`${s.cardTitle} ${s.dangerTitle}`}>Zona de risco</div>
              <div className={s.hint}>Apaga prints do bucket de forma definitiva. O sistema conta antes e pede confirmação.</div>
              <div className={s.fieldsCol}>
                <label className={s.field}>
                  Câmera
                  <select className={s.select} value={delPeriod.cam} onChange={(e) => (setDelPeriod({ ...delPeriod, cam: e.target.value }), setDelCount(null))}>
                    {config.cameras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.location} — {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>
                  De
                  <input className={s.input} type="date" value={delPeriod.from} onChange={(e) => (setDelPeriod({ ...delPeriod, from: e.target.value }), setDelCount(null))} />
                </label>
                <label className={s.field}>
                  Até
                  <input className={s.input} type="date" value={delPeriod.to} onChange={(e) => (setDelPeriod({ ...delPeriod, to: e.target.value }), setDelCount(null))} />
                </label>
                <button
                  className={s.ghost}
                  disabled={pending || !delReady}
                  onClick={() =>
                    start(async () => {
                      const r = await countPeriod(delPeriod.cam, delPeriod.from, delPeriod.to);
                      if (r.ok) setDelCount(r.count);
                      else report(false, r.error);
                    })
                  }
                >
                  Contar prints
                </button>
              </div>
              {delCount !== null && (
                <div className={s.actions}>
                  <span className={s.hint}>
                    {delCount} objetos (~{Math.round(delCount / 2)} prints) entre {delPeriod.from} e {delPeriod.to}.
                  </span>
                  {delCount > 0 && (
                    <button
                      className={s.dangerSolid}
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await deletePeriod(delPeriod.cam, delPeriod.from, delPeriod.to);
                          if (r.ok) {
                            report(true, `${r.count} objetos apagados.`);
                            setDelCount(null);
                            router.refresh();
                          } else report(false, r.error);
                        })
                      }
                    >
                      Apagar definitivamente
                    </button>
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {msg && <div className={`${s.toast} ${msg.ok ? s.toastOk : s.toastBad}`}>{msg.text}</div>}
    </div>
  );
}
