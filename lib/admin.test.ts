import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCameraEdit, applyCameraPatch, buildCamera, loginGate, settingsFrom, slug, validRange } from './admin.ts';
import type { Camera, Config } from './config.ts';

const cam = (over: Partial<Camera> = {}): Camera => ({
  id: 'a',
  name: 'A',
  location: 'L',
  streamUrl: 'https://x/y.m3u8',
  active: true,
  captureEnabled: true,
  ...over,
});
const cfg = (cameras: Camera[] = []): Config => ({ captureEnabled: true, intervalSec: 900, historyBatch: 12, retentionDays: 30, cameras });

test('slug normaliza acentos e símbolos e limita a 40 caracteres', () => {
  assert.equal(slug('Ponte do Grassmann'), 'ponte-do-grassmann');
  assert.equal(slug('Ação & Cia!'), 'acao-cia');
  assert.equal(slug('  --Rio Areia--  '), 'rio-areia');
  assert.equal(slug('!!!'), '');
  assert.equal(slug('a'.repeat(50)).length, 40);
});

test('buildCamera gera id livre, trima os campos e aplica os defaults', () => {
  const c = buildCamera([cam({ id: 'ponte' })], { name: ' Ponte ', location: ' Lado ', streamUrl: ' https://x/y ', sourceUrl: ' ' });
  assert.equal(c.id, 'ponte-2');
  assert.equal(c.name, 'Ponte');
  assert.equal(c.location, 'Lado');
  assert.equal(c.streamUrl, 'https://x/y');
  assert.equal(c.sourceUrl, undefined);
  assert.equal(c.active, true);
  assert.equal(c.captureEnabled, true);
  assert.equal(c.intervalSec, undefined);
});

test('buildCamera sem slug usa o prefixo camera e pula ids ocupados', () => {
  const c = buildCamera([cam({ id: 'camera' }), cam({ id: 'camera-2' })], { name: '!!!', location: '', streamUrl: 'https://x', sourceUrl: '' });
  assert.equal(c.id, 'camera-3');
});

test('buildCamera exige nome e valida o intervalo', () => {
  assert.throws(() => buildCamera([], { name: '  ', location: '', streamUrl: 'https://x', sourceUrl: '' }), /informe o nome/);
  assert.throws(() => buildCamera([], { name: 'A', location: '', streamUrl: 'https://x', sourceUrl: '', intervalSec: 42 }), /intervalo inválido/);
  assert.equal(buildCamera([], { name: 'A', location: '', streamUrl: 'https://x', sourceUrl: '', intervalSec: 300 }).intervalSec, 300);
});

test('applyCameraPatch só mexe na câmera alvo e aceita limpar o intervalo', () => {
  const out = applyCameraPatch([cam(), cam({ id: 'b', intervalSec: 300 })], 'b', { captureEnabled: false, intervalSec: null });
  assert.equal(out[0].captureEnabled, true);
  assert.equal(out[0].intervalSec, undefined);
  assert.equal(out[1].captureEnabled, false);
  assert.equal(out[1].intervalSec, undefined);
  assert.throws(() => applyCameraPatch([cam()], 'x', {}), /câmera não encontrada/);
  assert.throws(() => applyCameraPatch([cam()], 'a', { intervalSec: 42 }), /intervalo inválido/);
});

test('applyCameraEdit trima e valida os campos', () => {
  const out = applyCameraEdit([cam()], 'a', { name: ' Nome ', location: ' Loc ', streamUrl: ' https://z/w ', sourceUrl: ' ' });
  assert.deepEqual(
    { name: out[0].name, location: out[0].location, streamUrl: out[0].streamUrl, sourceUrl: out[0].sourceUrl },
    { name: 'Nome', location: 'Loc', streamUrl: 'https://z/w', sourceUrl: undefined },
  );
  assert.throws(() => applyCameraEdit([cam()], 'a', { name: ' ', location: '', streamUrl: 'https://z', sourceUrl: '' }), /informe o nome/);
  assert.throws(() => applyCameraEdit([cam()], 'x', { name: 'N', location: '', streamUrl: 'https://z', sourceUrl: '' }), /câmera não encontrada/);
});

test('settingsFrom valida os limites e corta o aviso em 280', () => {
  const c = settingsFrom({ captureEnabled: false, intervalSec: 300, historyBatch: 4, retentionDays: 365, notice: `  ${'x'.repeat(300)}  ` }, cfg());
  assert.equal(c.captureEnabled, false);
  assert.equal(c.notice, 'x'.repeat(280));

  const semAviso = settingsFrom({ captureEnabled: true, intervalSec: 900, historyBatch: 12, retentionDays: 30, notice: '   ' }, cfg());
  assert.equal(semAviso.notice, undefined);

  const s = { captureEnabled: true, intervalSec: 900, historyBatch: 12, retentionDays: 30, notice: '' };
  assert.throws(() => settingsFrom({ ...s, intervalSec: 42 }, cfg()), /intervalo inválido/);
  assert.throws(() => settingsFrom({ ...s, historyBatch: 3 }, cfg()), /entre 4 e 48/);
  assert.throws(() => settingsFrom({ ...s, retentionDays: 0 }, cfg()), /entre 1 e 365/);
});

test('validRange aceita o intervalo válido e rejeita o resto', () => {
  validRange('2026-09-01', '2026-09-30');
  validRange('2026-09-30', '2026-09-30');
  assert.throws(() => validRange('2026-09-30', '2026-09-01'), /período inválido/);
  assert.throws(() => validRange('2026-9-1', '2026-09-30'), /período inválido/);
});

test('loginGate descarta tentativas vencidas e trava depois de 5', () => {
  const now = 1_000_000_000;
  assert.deepEqual(loginGate([now - 1000, now - 2000], now), { fails: [now - 1000, now - 2000], locked: false });
  const g = loginGate([now - 10 * 60_000 - 1, now, now, now, now], now);
  assert.deepEqual(g.fails, [now, now, now, now]);
  assert.equal(g.locked, false);
  assert.equal(loginGate([now, now, now, now, now], now).locked, true);
});
