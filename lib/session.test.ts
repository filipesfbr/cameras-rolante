import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkToken, makeToken, samePassword } from './session.ts';

test('sessão: token válido, adulterado, expirado, senha trocada', async () => {
  const t = await makeToken('segredo', 1000);
  assert.equal(await checkToken('segredo', t, 2000), true);
  assert.equal(await checkToken('outra', t, 2000), false);
  assert.equal(await checkToken('segredo', t.replace(/.$/, 'x'), 2000), false);
  assert.equal(await checkToken('segredo', `123.@@@`, 2000), false);
  assert.equal(await checkToken('segredo', t, 1000 + 8 * 86_400_000), false);
  assert.equal(await checkToken('segredo', undefined), false);
  assert.equal(await checkToken('', t, 2000), false);
  assert.equal(await samePassword('abc', 'abc'), true);
  assert.equal(await samePassword('abd', 'abc'), false);
  assert.equal(await samePassword('', ''), false);
});
