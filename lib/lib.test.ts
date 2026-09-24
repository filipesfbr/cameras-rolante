import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPrivateIp } from './ssrf.ts';
import { checkToken, makeToken, samePassword } from './session.ts';
import { page } from './storage.ts';
import { cursorOf, parseCursor, stamp } from './time.ts';

test('stamp usa Brasília, não UTC', () => {
  // 2026-09-24T00:30:00Z = 21:30 do dia 23 em Brasília
  assert.deepEqual(stamp(new Date('2026-09-24T00:30:00Z')), { day: '2026-09-23', t: '213000' });
  assert.deepEqual(parseCursor(cursorOf('2026-09-23', '213000')), { day: '2026-09-23', t: '213000' });
  assert.equal(parseCursor('lixo'), null);
});

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

test('ssrf: bloqueia loopback, rede privada, link-local e v4-mapeado', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1'])
    assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
});

test('sessão: token válido, adulterado, expirado, senha trocada', async () => {
  const t = await makeToken('segredo', 1000);
  assert.equal(await checkToken('segredo', t, 2000), true);
  assert.equal(await checkToken('outra', t, 2000), false);
  assert.equal(await checkToken('segredo', t.replace(/.$/, 'x'), 2000), false);
  assert.equal(await checkToken('segredo', t, 1000 + 8 * 86_400_000), false);
  assert.equal(await checkToken('segredo', undefined), false);
  assert.equal(await samePassword('abc', 'abc'), true);
  assert.equal(await samePassword('abd', 'abc'), false);
  assert.equal(await samePassword('', ''), false);
});
