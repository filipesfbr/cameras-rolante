import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const SEM_AUTH = new Set(['login', 'logout']);

test('toda Server Action de mutação chama requireAdmin', async () => {
  const src = await readFile(new URL('../app/admin/actions.ts', import.meta.url), 'utf8');
  const names = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.ok(names.length >= 10, `esperava as actions no arquivo, achei ${names.length}`);
  for (const name of names) {
    if (SEM_AUTH.has(name)) continue;
    const start = src.indexOf(`export async function ${name}`);
    const end = src.indexOf('export async function', start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    assert.match(body, /await requireAdmin\(\)/, `${name} precisa chamar requireAdmin()`);
  }
});
