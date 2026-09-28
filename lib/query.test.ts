import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Camera } from './config.ts';
import { parseFramesQuery } from './query.ts';

const cam = (over: Partial<Camera> = {}): Camera => ({
  id: 'a',
  name: 'A',
  location: 'L',
  streamUrl: 'https://x/y.m3u8',
  active: true,
  captureEnabled: true,
  ...over,
});
const q = (s: string) => new URLSearchParams(s);
const [a] = [cam()];

test('parseFramesQuery exige câmera existente e ativa', () => {
  assert.deepEqual(parseFramesQuery(q('cam=b'), [a], 12), { error: 'câmera não encontrada', status: 404 });
  assert.deepEqual(parseFramesQuery(q('cam=a'), [cam({ active: false })], 12), { error: 'câmera não encontrada', status: 404 });
  assert.deepEqual(parseFramesQuery(q(''), [a], 12), { error: 'câmera não encontrada', status: 404 });
});

test('parseFramesQuery recusa cursor inválido', () => {
  assert.deepEqual(parseFramesQuery(q('cam=a&before=lixo'), [a], 12), { error: 'cursor inválido', status: 400 });
  assert.deepEqual(parseFramesQuery(q('cam=a&after=2026-09-23'), [a], 12), { error: 'cursor inválido', status: 400 });
});

test('parseFramesQuery devolve cursores válidos', () => {
  assert.deepEqual(parseFramesQuery(q('cam=a&before=2026-09-23T101112'), [a], 12), {
    cam: a,
    before: '2026-09-23T101112',
    after: null,
    limit: 12,
  });
});

test('parseFramesQuery limita o lote entre 1 e 48, com fallback no historyBatch', () => {
  const lim = (qs: string) => (parseFramesQuery(q(`cam=a&${qs}`), [a], 12) as { limit: number }).limit;
  assert.equal(lim('limit=5'), 5);
  assert.equal(lim('limit=0'), 12);
  assert.equal(lim('limit=abc'), 12);
  assert.equal(lim('limit=-3'), 1);
  assert.equal(lim('limit=999'), 48);
  assert.equal(lim(''), 12);
});
