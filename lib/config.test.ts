import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { DEFAULTS, intervalOf, mergeConfig, moveCameraIn, readConfig, saveConfig, type Camera } from './config.ts';
import { state } from './state.ts';

beforeEach(() => {
  state.config = undefined;
});

const cam: Camera = { id: 'a', name: 'A', location: 'L', streamUrl: 'https://x/y.m3u8', active: true, captureEnabled: true };

test('moveCameraIn troca com a vizinha e devolve o mesmo array nas pontas', () => {
  const cs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as Camera[];
  assert.deepEqual(moveCameraIn(cs, 'b', -1).map((c) => c.id), ['b', 'a', 'c']);
  assert.deepEqual(moveCameraIn(cs, 'b', 1).map((c) => c.id), ['a', 'c', 'b']);
  assert.equal(moveCameraIn(cs, 'a', -1), cs);
  assert.equal(moveCameraIn(cs, 'c', 1), cs);
  assert.equal(moveCameraIn(cs, 'x', 1), cs);
});

test('intervalOf: o intervalo da câmera sobrescreve o global', () => {
  const cfg = { ...DEFAULTS, intervalSec: 900 };
  assert.equal(intervalOf(cfg, cam), 900);
  assert.equal(intervalOf(cfg, { ...cam, intervalSec: 300 }), 300);
});

test('mergeConfig mescla o JSON parcial com os defaults', () => {
  assert.equal(mergeConfig(null), null);
  const c = mergeConfig('{"historyBatch":24,"cameras":[]}')!;
  assert.equal(c.historyBatch, 24);
  assert.deepEqual(c.cameras, []);
  assert.equal(c.captureEnabled, true);
  assert.equal(c.intervalSec, 900);
  assert.equal(c.retentionDays, 30);
});

test('readConfig no primeiro boot grava os defaults', async () => {
  const puts: { key: string; body: string }[] = [];
  const io = {
    getText: async () => null,
    put: async (key: string, body: string | Buffer) => {
      puts.push({ key, body: String(body) });
    },
  };
  const cfg = await readConfig(io);
  assert.deepEqual(cfg, DEFAULTS);
  assert.equal(state.config, cfg);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, 'config.json');
  assert.match(puts[0].body, /"historyBatch": 12/);
});

test('readConfig acha o config no bucket e usa o cache depois', async () => {
  let gets = 0;
  const io = {
    getText: async () => {
      gets++;
      return '{"captureEnabled":false}';
    },
    put: async () => {
      throw new Error('não deveria gravar');
    },
  };
  const a = await readConfig(io);
  const b = await readConfig(io);
  assert.equal(a, b);
  assert.equal(a.captureEnabled, false);
  assert.equal(a.intervalSec, 900);
  assert.equal(gets, 1);
});

test('saveConfig só troca o cache depois do put dar certo', async () => {
  state.config = DEFAULTS;
  const next = { ...DEFAULTS, intervalSec: 300 as const };
  await assert.rejects(
    saveConfig(next, {
      getText: async () => null,
      put: async () => {
        throw new Error('R2 fora do ar');
      },
    }),
    /R2 fora/,
  );
  assert.equal(state.config, DEFAULTS);

  const puts: string[] = [];
  await saveConfig(next, {
    getText: async () => null,
    put: async (key: string, body: string | Buffer, type?: string, cache?: string) => {
      puts.push(`${key}|${body}|${type}|${cache}`);
    },
  });
  assert.equal(state.config, next);
  assert.match(puts[0], /^config\.json\|.*"intervalSec": 300.*\|application\/json\|no-cache$/s);
});
