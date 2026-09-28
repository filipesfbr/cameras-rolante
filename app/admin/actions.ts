'use server';

import { redirect } from 'next/navigation';
import { applyCameraEdit, applyCameraPatch, buildCamera, loginGate, settingsFrom, validRange } from '@/lib/admin';
import { endSession, requireAdmin, startSession } from '@/lib/auth';
import { captureNow, rescheduleAll, testStream } from '@/lib/capture';
import { moveCameraIn, readConfig, saveConfig } from '@/lib/config';
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
  const gate = loginGate(fails, Date.now());
  fails = gate.fails;
  if (gate.locked) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (!(await samePassword(String(form.get('password') ?? ''), process.env.ADMIN_PASSWORD ?? ''))) {
    fails.push(Date.now());
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
    await saveConfig(settingsFrom(s, cfg));
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

export async function addCamera(c: {
  name: string;
  location: string;
  streamUrl: string;
  sourceUrl: string;
  intervalSec?: number;
}): Promise<Result> {
  await requireAdmin();
  try {
    const cfg = await readConfig();
    const cam = buildCamera(cfg.cameras, c);
    await assertPublicUrl(cam.streamUrl);
    if (cam.sourceUrl) await assertPublicUrl(cam.sourceUrl);
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
    await saveConfig({ ...cfg, cameras: applyCameraPatch(cfg.cameras, id, patch) });
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
    const cameras = applyCameraEdit(cfg.cameras, id, patch);
    const edited = cameras.find((c) => c.id === id)!;
    await assertPublicUrl(edited.streamUrl);
    if (edited.sourceUrl) await assertPublicUrl(edited.sourceUrl);
    await saveConfig({ ...cfg, cameras });
    if (edited.streamUrl !== current.streamUrl) await rescheduleAll();
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
  validRange(from, to);
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
