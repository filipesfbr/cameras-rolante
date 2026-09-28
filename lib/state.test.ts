import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memo, state } from './state.ts';

beforeEach(() => state.memo.clear());

test('memo devolve o valor guardado dentro do TTL', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  let calls = 0;
  const fn = async () => ++calls;
  assert.equal(await memo('k', 100, fn), 1);
  t.mock.timers.setTime(1099);
  assert.equal(await memo('k', 100, fn), 1);
  assert.equal(calls, 1);
});

test('memo chama de novo depois do TTL', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  let calls = 0;
  const fn = async () => ++calls;
  await memo('k', 100, fn);
  t.mock.timers.setTime(1100);
  assert.equal(await memo('k', 100, fn), 2);
  assert.equal(calls, 2);
});

test('memo: chaves diferentes são independentes', async () => {
  let a = 0;
  let b = 0;
  await memo('a', 60_000, async () => ++a);
  await memo('b', 60_000, async () => ++b);
  assert.equal(await memo('a', 60_000, async () => ++a), 1);
  assert.equal(b, 1);
});
