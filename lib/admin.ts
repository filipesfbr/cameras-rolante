import { INTERVALS, type Camera, type Config } from './config.ts';
import { isDay } from './time.ts';

export const slug = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const intOr = (v: unknown, min: number, max: number, what: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${what}: use um número inteiro entre ${min} e ${max}`);
  return n;
};

export const okInterval = (v: unknown) => {
  if (!INTERVALS.includes(Number(v))) throw new Error('intervalo inválido');
  return Number(v);
};

export type Settings = {
  captureEnabled: boolean;
  intervalSec: number;
  historyBatch: number;
  retentionDays: number;
  notice: string;
};

export function settingsFrom(s: Settings, cfg: Config): Config {
  return {
    ...cfg,
    captureEnabled: !!s.captureEnabled,
    intervalSec: okInterval(s.intervalSec),
    historyBatch: intOr(s.historyBatch, 4, 48, 'imagens no histórico'),
    retentionDays: intOr(s.retentionDays, 1, 365, 'retenção (dias)'),
    notice: String(s.notice ?? '').trim().slice(0, 280) || undefined,
  };
}

export type CameraInput = {
  name: string;
  location: string;
  streamUrl: string;
  sourceUrl: string;
  intervalSec?: number;
};

export function buildCamera(existing: Camera[], input: CameraInput): Camera {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error('informe o nome do ponto');
  const base = slug(name) || 'camera';
  let id = base;
  for (let i = 2; existing.some((x) => x.id === id); i++) id = `${base}-${i}`;
  const sourceUrl = input.sourceUrl.trim();
  return {
    id,
    name,
    location: input.location.trim().slice(0, 80),
    streamUrl: input.streamUrl.trim(),
    sourceUrl: sourceUrl || undefined,
    active: true,
    captureEnabled: true,
    intervalSec: input.intervalSec ? okInterval(input.intervalSec) : undefined,
  };
}

export function applyCameraPatch(
  cameras: Camera[],
  id: string,
  patch: { active?: boolean; captureEnabled?: boolean; intervalSec?: number | null },
): Camera[] {
  if (!cameras.some((c) => c.id === id)) throw new Error('câmera não encontrada');
  return cameras.map((c) => {
    if (c.id !== id) return c;
    const n = { ...c };
    if (patch.active !== undefined) n.active = !!patch.active;
    if (patch.captureEnabled !== undefined) n.captureEnabled = !!patch.captureEnabled;
    if (patch.intervalSec !== undefined) n.intervalSec = patch.intervalSec === null ? undefined : okInterval(patch.intervalSec);
    return n;
  });
}

export function applyCameraEdit(
  cameras: Camera[],
  id: string,
  patch: { name: string; location: string; streamUrl: string; sourceUrl: string },
): Camera[] {
  if (!cameras.some((c) => c.id === id)) throw new Error('câmera não encontrada');
  const name = patch.name.trim().slice(0, 80);
  if (!name) throw new Error('informe o nome do ponto');
  const streamUrl = patch.streamUrl.trim();
  const sourceUrl = patch.sourceUrl.trim();
  return cameras.map((c) =>
    c.id === id ? { ...c, name, location: patch.location.trim().slice(0, 80), streamUrl, sourceUrl: sourceUrl || undefined } : c,
  );
}

export function validRange(from: string, to: string) {
  if (!isDay(from) || !isDay(to) || from > to) throw new Error('período inválido');
}

const FAIL_WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 5;

/** Descarta tentativas fora da janela e diz se o login está bloqueado. */
export function loginGate(fails: number[], now: number) {
  const fresh = fails.filter((t) => now - t < FAIL_WINDOW_MS);
  return { fails: fresh, locked: fresh.length >= MAX_FAILS };
}
