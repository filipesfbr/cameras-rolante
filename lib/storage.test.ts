import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { state } from './state.ts';
import { bucketUsage, countRange, days, dayTimes, deleteRange, frameOf, frames, framesOfDay, page, shotKey, sweep, type StorageIo } from './storage.ts';
import { cursorOf } from './time.ts';

beforeEach(() => {
  state.config = undefined;
  state.memo.clear();
});

function fakeR2(initial: string[]) {
  const all = [...initial];
  const listCalls: string[] = [];
  const delCalls: string[][] = [];
  const io: StorageIo = {
    async list(prefix: string, delimiter?: string) {
      listCalls.push(prefix);
      const under = all.filter((k) => k.startsWith(prefix));
      if (!delimiter) return { keys: [...under].sort(), prefixes: [] };
      const prefixes = new Set<string>();
      for (const k of under) {
        const rest = k.slice(prefix.length);
        const i = rest.indexOf(delimiter);
        if (i >= 0) prefixes.add(prefix + rest.slice(0, i + 1));
      }
      return { keys: under.filter((k) => !k.slice(prefix.length).includes(delimiter)).sort(), prefixes: [...prefixes].sort() };
    },
    async del(keys: string[]) {
      delCalls.push(keys);
      for (const k of keys) {
        const i = all.indexOf(k);
        if (i >= 0) all.splice(i, 1);
      }
    },
    async usage() {
      return { bytes: all.length * 10, count: all.length, prints: all.filter((k) => k.endsWith('.jpg') && !k.endsWith('.thumb.jpg')).length };
    },
  };
  return { all, delCalls, io, listCalls };
}

function withPublicUrl(fn: () => void) {
  const old = process.env.R2_PUBLIC_URL;
  process.env.R2_PUBLIC_URL = 'https://pub.exemplo';
  try {
    fn();
  } finally {
    if (old === undefined) delete process.env.R2_PUBLIC_URL;
    else process.env.R2_PUBLIC_URL = old;
  }
}

// 3 dias: ontem tem 2 quadros, hoje tem 3, anteontem 1
const data: Record<string, string[]> = {
  '2026-09-21': ['100000'],
  '2026-09-22': ['100000', '230000'],
  '2026-09-23': ['010000', '020000', '030000'],
};
const deps = { days: Object.keys(data), dayTimes: async (d: string) => data[d] };
const ids = (r: { day: string; t: string }[]) => r.map((f) => `${f.day.slice(8)}-${f.t.slice(0, 2)}`);

test('page: lote inicial, do mais novo pro mais antigo', async () => {
  assert.deepEqual(ids(await page(deps, { limit: 2 })), ['23-03', '23-02']);
});

test('page: before atravessa a virada de dia sem buraco nem repetição, e para no fim', async () => {
  const a = await page(deps, { limit: 2 });
  const b = await page(deps, { limit: 2, before: cursorOf(a.at(-1)!.day, a.at(-1)!.t) });
  const c = await page(deps, { limit: 2, before: cursorOf(b.at(-1)!.day, b.at(-1)!.t) });
  const d = await page(deps, { limit: 2, before: cursorOf(c.at(-1)!.day, c.at(-1)!.t) });
  assert.deepEqual([...ids(a), ...ids(b), ...ids(c)], ['23-03', '23-02', '23-01', '22-23', '22-10', '21-10']);
  assert.deepEqual(d, []);
});

test('page: after devolve só os mais novos, já do mais novo pro mais antigo', async () => {
  assert.deepEqual(ids(await page(deps, { limit: 10, after: cursorOf('2026-09-22', '230000') })), ['23-03', '23-02', '23-01']);
  assert.deepEqual(await page(deps, { limit: 10, after: cursorOf('2026-09-23', '030000') }), []);
});

test('shotKey e frameOf montam a key e a URL pública', () => {
  withPublicUrl(() => {
    assert.equal(shotKey('cam', '2026-09-23', '101112'), 'shots/cam/2026-09-23/101112.jpg');
    assert.equal(shotKey('cam', '2026-09-23', '101112', true), 'shots/cam/2026-09-23/101112.thumb.jpg');
    assert.deepEqual(frameOf('cam', '2026-09-23', '101112'), {
      id: '2026-09-23T101112',
      day: '2026-09-23',
      t: '101112',
      thumb: 'https://pub.exemplo/shots/cam/2026-09-23/101112.thumb.jpg',
      full: 'https://pub.exemplo/shots/cam/2026-09-23/101112.jpg',
    });
  });
});

test('days lista só dias válidos, em ordem crescente', async () => {
  const { io } = fakeR2([
    'shots/cam/2026-09-23/101112.jpg',
    'shots/cam/2026-09-21/101112.thumb.jpg',
    'shots/cam/lixo/101112.jpg',
    'shots/cam/2026-09-22/101112.jpg',
  ]);
  assert.deepEqual(await days('cam', io), ['2026-09-21', '2026-09-22', '2026-09-23']);
});

test('dayTimes lista só thumbs, em ordem crescente, e ignora outros dias', async () => {
  const { io } = fakeR2([
    'shots/cam/2026-09-23/101112.jpg',
    'shots/cam/2026-09-23/101112.thumb.jpg',
    'shots/cam/2026-09-23/090000.thumb.jpg',
    'shots/cam/2026-09-22/235959.thumb.jpg',
  ]);
  assert.deepEqual(await dayTimes('cam', '2026-09-23', io), ['090000', '101112']);
});

test('framesOfDay devolve os frames do dia com URL pública', async () => {
  await withPublicUrlAsync(async () => {
    const { io } = fakeR2(['shots/cam/2026-09-23/101112.thumb.jpg']);
    const f = await framesOfDay('cam', '2026-09-23', io);
    assert.deepEqual(f.map((x) => x.id), ['2026-09-23T101112']);
    assert.equal(f[0].full, 'https://pub.exemplo/shots/cam/2026-09-23/101112.jpg');
  });
});

test('frames devolve a primeira página com URL pública', async () => {
  await withPublicUrlAsync(async () => {
    const { io } = fakeR2([
      'shots/cam/2026-09-23/030000.thumb.jpg',
      'shots/cam/2026-09-23/010000.thumb.jpg',
      'shots/cam/2026-09-22/230000.thumb.jpg',
    ]);
    const f = await frames('cam', { limit: 2 }, io);
    assert.deepEqual(f.map((x) => x.id), ['2026-09-23T030000', '2026-09-23T010000']);
    assert.equal(f[0].thumb, 'https://pub.exemplo/shots/cam/2026-09-23/030000.thumb.jpg');
  });
});

test('sweep apaga os dias anteriores ao cutoff, inclusive de câmeras removidas', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 28, 15, 0, 0) }); // 28/09 12:00 em Brasília
  const { all, io } = fakeR2([
    'shots/cam/2026-09-26/090000.jpg',
    'shots/cam/2026-09-26/090000.thumb.jpg', // dia do cutoff: mantém
    'shots/cam/2026-09-25/090000.jpg',
    'shots/cam/2026-09-25/090000.thumb.jpg',
    'shots/velha/2026-09-01/090000.jpg', // câmera removida: apaga também
    'config.json', // fora de shots/: intacto
  ]);
  assert.equal(await sweep(2, io), 3);
  assert.deepEqual(all, ['shots/cam/2026-09-26/090000.jpg', 'shots/cam/2026-09-26/090000.thumb.jpg', 'config.json']);
});

test('sweep limpa o cache de listagem', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 28, 15, 0, 0) });
  const { io, listCalls } = fakeR2(['shots/cam/2026-09-01/090000.jpg']);
  await days('cam', io);
  assert.equal(listCalls.filter((p) => p === 'shots/cam/').length, 1);
  await sweep(1, io);
  await days('cam', io);
  assert.equal(listCalls.filter((p) => p === 'shots/cam/').length, 3);
});

test('countRange e deleteRange respeitam o intervalo de dias', async () => {
  const { all, io } = fakeR2([
    'shots/cam/2026-09-01/090000.jpg',
    'shots/cam/2026-09-01/090000.thumb.jpg',
    'shots/cam/2026-09-02/090000.jpg',
    'shots/cam/2026-09-02/090000.thumb.jpg',
    'shots/cam/2026-09-03/090000.jpg',
  ]);
  assert.equal(await countRange('cam', '2026-09-01', '2026-09-02', io), 4);
  assert.equal(await deleteRange('cam', '2026-09-01', '2026-09-02', io), 4);
  assert.deepEqual(all, ['shots/cam/2026-09-03/090000.jpg']);
});

test('bucketUsage devolve o uso do bucket com o horário', async () => {
  const { io } = fakeR2(['a.jpg', 'a.thumb.jpg', 'b.jpg']);
  const u = await bucketUsage(io);
  assert.deepEqual({ bytes: u.bytes, count: u.count, prints: u.prints }, { bytes: 30, count: 3, prints: 2 });
  assert.equal(typeof u.at, 'number');
});

async function withPublicUrlAsync(fn: () => Promise<void>) {
  const old = process.env.R2_PUBLIC_URL;
  process.env.R2_PUBLIC_URL = 'https://pub.exemplo';
  try {
    await fn();
  } finally {
    if (old === undefined) delete process.env.R2_PUBLIC_URL;
    else process.env.R2_PUBLIC_URL = old;
  }
}
