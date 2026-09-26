'use server';

import { redirect } from 'next/navigation';
import { endSession, requireAdmin, startSession } from '@/lib/auth';
import { captureNow, rescheduleAll, testStream } from '@/lib/capture';
import { INTERVALS, moveCameraIn, readConfig, saveConfig, type Camera } from '@/lib/config';
import { samePassword } from '@/lib/session';
import { assertPublicUrl } from '@/lib/ssrf';
import { state, type CaptureStatus } from '@/lib/state';
import { bucketUsage, countCamera, countRange, days, deleteCamera, deleteRange, frameOf, framesOfDay, type Frame } from '@/lib/storage';
import { isDay, parseCursor } from '@/lib/time';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// ---- login (única action sem requireAdmin) ----
// ponytail: contador global em memória; por IP ou persistente só se aparecer ataque real.
let fails: number[] = [];

export async function login(_: string | null, form: FormData): Promise<string | null> {
  const now = Date.now();
  fails = fails.filter((t) => now - t < 10 * 60_000);
  if (fails.length >= 5) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (!(await samePassword(String(form.get('password') ?? ''), process.env.ADMIN_PASSWORD ?? ''))) {
    fails.push(now);
    return 'Senha incorreta.';
  }
  fails = [];
  await startSession();
  redirect('/admin');
}

export async function logout() {
  await endSession();
  redirect('/login');
}

// ---- configurações ----
const intOr = (v: unknown, min: number, max: number, what: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${what}: use um número inteiro entre ${min} e ${max}`);
  return n;
};
const okInterval = (v: unknown) => {
  if (!INTERVALS.includes(Number(v))) throw new Error('intervalo inválido');
  return Number(v);
};

export async function saveSettings(s: {
  captureEnabled: boolean;
  intervalSec: number;
  historyBatch: number;
  retentionDays: number;
  notice: string;
}): Promise<Result> {
  await requireAdmin();
  try {
    const cfg = await readConfig();
    await saveConfig({
      ...cfg,
      captureEnabled: !!s.captureEnabled,
      intervalSec: okInterval(s.intervalSec),
      historyBatch: intOr(s.historyBatch, 4, 48,'imagens no histórico'),
      retentionDays: intOr(s.retentionDays, 1, 365, 'retenção (dias)'),
      notice: String(s.notice ?? '').trim().slice(0, 280) || undefined,
    });
    await rescheduleAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---- câmeras ----
async function cameraOrThrow(id: string) {
  const cam = (await readConfig()).cameras.find((c) => c.id === id);
  if (!cam) throw new Error('câmera não encontrada');
  return cam;
}

export async function testCamera(streamUrl: string): Promise<Result<{ image: string }>> {
  await requireAdmin();
  try {
    return { ok: true, image: await testStream(streamUrl) };
  } catch (e) {
    return fail(e);
  }
}

const slug = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export async function addCamera(c: {
  name: string;
  location: string;
  streamUrl: string;
  sourceUrl: string;
  intervalSec?: number;
}): Promise<Result> {
  await requireAdmin();
  try {
    const name = c.name.trim().slice(0, 80);
    if (!name) throw new Error('informe o nome do ponto');
    await assertPublicUrl(c.streamUrl.trim());
    const sourceUrl = c.sourceUrl.trim();
    if (sourceUrl) await assertPublicUrl(sourceUrl);
    const cfg = await readConfig();
    const base = slug(name) || 'camera';
    let id = base;
    for (let i = 2; cfg.cameras.some((x) => x.id === id); i++) id = `${base}-${i}`;
    const cam: Camera = {
      id,
      name,
      location: c.location.trim().slice(0, 80),
      streamUrl: c.streamUrl.trim(),
      sourceUrl: sourceUrl || undefined,
      active: true,
      captureEnabled: true,
      intervalSec: c.intervalSec ? okInterval(c.intervalSec) : undefined,
    };
    await saveConfig({ ...cfg, cameras: [...cfg.cameras, cam] });
    await rescheduleAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCamera(
  id: string,
  patch: { active?: boolean; captureEnabled?: boolean; intervalSec?: number | null },
): Promise<Result> {
  await requireAdmin();
  try {
    const cfg = await readConfig();
    if (!cfg.cameras.some((c) => c.id === id)) throw new Error('câmera não encontrada');
    const cameras = cfg.cameras.map((c) => {
      if (c.id !== id) return c;
      const n = { ...c };
      if (patch.active !== undefined) n.active = !!patch.active;
      if (patch.captureEnabled !== undefined) n.captureEnabled = !!patch.captureEnabled;
      if (patch.intervalSec !== undefined) n.intervalSec = patch.intervalSec === null ? undefined : okInterval(patch.intervalSec);
      return n;
    });
    await saveConfig({ ...cfg, cameras });
    await rescheduleAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function editCamera(
  id: string,
  patch: { name: string; location: string; streamUrl: string; sourceUrl: string },
): Promise<Result> {
  await requireAdmin();
  try {
    const cfg = await readConfig();
    const current = cfg.cameras.find((c) => c.id === id);
    if (!current) throw new Error('câmera não encontrada');
    const name = patch.name.trim().slice(0, 80);
    if (!name) throw new Error('informe o nome do ponto');
    const streamUrl = patch.streamUrl.trim();
    await assertPublicUrl(streamUrl);
    const sourceUrl = patch.sourceUrl.trim();
    if (sourceUrl) await assertPublicUrl(sourceUrl);
    const cameras = cfg.cameras.map((c) =>
      c.id === id ? { ...c, name, location: patch.location.trim().slice(0, 80), streamUrl, sourceUrl: sourceUrl || undefined } : c,
    );
    await saveConfig({ ...cfg, cameras });
    if (streamUrl !== current.streamUrl) await rescheduleAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moveCamera(id: string, dir: -1 | 1): Promise<Result> {
  await requireAdmin();
  try {
    if (dir !== -1 && dir !== 1) throw new Error('direção inválida');
    const cfg = await readConfig();
    const cameras = moveCameraIn(cfg.cameras, id, dir);
    if (cameras === cfg.cameras) throw new Error('não há para onde mover');
    await saveConfig({ ...cfg, cameras });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCamera(id: string, removeShots = false): Promise<Result> {
  await requireAdmin();
  try {
    await cameraOrThrow(id);
    if (removeShots) await deleteCamera(id);
    const cfg = await readConfig();
    await saveConfig({ ...cfg, cameras: cfg.cameras.filter((c) => c.id !== id) });
    await rescheduleAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function countCameraShots(cam: string): Promise<Result<{ count: number }>> {
  await requireAdmin();
  try {
    await cameraOrThrow(cam);
    return { ok: true, count: await countCamera(cam) };
  } catch (e) {
    return fail(e);
  }
}

export async function captureStatus(): Promise<Result<{ status: Record<string, CaptureStatus> }>> {
  await requireAdmin();
  return { ok: true, status: Object.fromEntries(state.status) };
}

export async function storageUsage(): Promise<Result<{ bytes: number; count: number; prints: number; at: number }>> {
  await requireAdmin();
  try {
    return { ok: true, ...(await bucketUsage()) };
  } catch (e) {
    return fail(e);
  }
}

export async function captureCamera(cam: string): Promise<Result<{ frame: Frame }>> {
  await requireAdmin();
  try {
    const p = parseCursor(await captureNow(cam));
    if (!p) throw new Error('cursor inválido');
    return { ok: true, frame: frameOf(cam, p.day, p.t) };
  } catch (e) {
    return fail(e);
  }
}

// ---- apagar período (irreversível: o admin conta antes e confirma) ----
async function range(cam: string, from: string, to: string) {
  if (!isDay(from) || !isDay(to) || from > to) throw new Error('período inválido');
  if (!(await readConfig()).cameras.some((c) => c.id === cam)) throw new Error('câmera não encontrada');
}

export async function countPeriod(cam: string, from: string, to: string): Promise<Result<{ count: number }>> {
  await requireAdmin();
  try {
    await range(cam, from, to);
    return { ok: true, count: await countRange(cam, from, to) };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePeriod(cam: string, from: string, to: string): Promise<Result<{ count: number }>> {
  await requireAdmin();
  try {
    await range(cam, from, to);
    return { ok: true, count: await deleteRange(cam, from, to) };
  } catch (e) {
    return fail(e);
  }
}

export async function adminDays(cam: string): Promise<Result<{ days: string[] }>> {
  await requireAdmin();
  try {
    await cameraOrThrow(cam);
    return { ok: true, days: await days(cam) };
  } catch (e) {
    return fail(e);
  }
}

export async function adminDayFrames(cam: string, day: string): Promise<Result<{ frames: Frame[] }>> {
  await requireAdmin();
  try {
    await cameraOrThrow(cam);
    if (!isDay(day)) throw new Error('dia inválido');
    return { ok: true, frames: await framesOfDay(cam, day) };
  } catch (e) {
    return fail(e);
  }
}
