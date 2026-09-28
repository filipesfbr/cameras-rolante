import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cursorOf, isDay, parseCursor, stamp } from './time.ts';

test('stamp usa Brasília, não UTC', () => {
  // 2026-09-24T00:30:00Z = 21:30 do dia 23 em Brasília
  assert.deepEqual(stamp(new Date('2026-09-24T00:30:00Z')), { day: '2026-09-23', t: '213000' });
  assert.deepEqual(parseCursor(cursorOf('2026-09-23', '213000')), { day: '2026-09-23', t: '213000' });
  assert.equal(parseCursor('lixo'), null);
  assert.equal(parseCursor(null), null);
  assert.equal(parseCursor(undefined), null);
});

test('isDay só aceita AAAA-MM-DD', () => {
  assert.equal(isDay('2026-09-23'), true);
  for (const v of ['2026-9-23', '26-09-23', '2026-09-23T00', '', 'lixo', null, undefined, 42]) assert.equal(isDay(v), false, String(v));
});
