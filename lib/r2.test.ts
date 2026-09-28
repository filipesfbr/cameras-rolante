import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { del, getText, list, put, usage, type S3ClientLike } from './r2.ts';

const client = (send: (cmd: any) => Promise<any>) => ({ send }) as unknown as S3ClientLike;

let oldBucket: string | undefined;
beforeEach(() => {
  oldBucket = process.env.R2_BUCKET;
});

test('list pagina sozinho e separa os prefixes', async () => {
  const calls: any[] = [];
  const pages = [
    { Contents: [{ Key: 'shots/a/1.jpg' }], CommonPrefixes: [{ Prefix: 'shots/a/' }], NextContinuationToken: 't1' },
    { Contents: [{ Key: 'shots/b/2.jpg' }], CommonPrefixes: [{ Prefix: 'shots/b/' }] },
  ];
  const io = client(async (cmd) => {
    calls.push(cmd);
    return pages[calls.length - 1];
  });
  const r = await list('shots/', '/', io);
  assert.deepEqual(r.keys, ['shots/a/1.jpg', 'shots/b/2.jpg']);
  assert.deepEqual(r.prefixes, ['shots/a/', 'shots/b/']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].input.Delimiter, '/');
  assert.equal(calls[1].input.ContinuationToken, 't1');
});

test('del fatia em lotes de 1000 objetos', async () => {
  const inputs: any[] = [];
  const io = client(async (cmd) => {
    inputs.push(cmd.input);
    return {};
  });
  await del(Array.from({ length: 2500 }, (_, i) => `k${i}`), io);
  assert.deepEqual(inputs.map((i) => i.Delete.Objects.length), [1000, 1000, 500]);
  assert.equal(inputs[0].Delete.Quiet, true);
  assert.equal(inputs[0].Key, undefined);
  assert.deepEqual(inputs[0].Delete.Objects[0], { Key: 'k0' });
});

test('del lança quando o R2 reporta erro parcial', async () => {
  const io = client(async () => ({ Errors: [{ Message: 'AccessDenied' }] }));
  await assert.rejects(del(['a'], io), /AccessDenied/);
});

test('usage soma bytes, objetos e prints; thumb não conta como print', async () => {
  const io = client(async () => ({
    Contents: [
      { Key: 'shots/a/1.jpg', Size: 100 },
      { Key: 'shots/a/1.thumb.jpg', Size: 10 },
      { Key: 'config.json', Size: 5 },
    ],
  }));
  assert.deepEqual(await usage(io), { bytes: 115, count: 3, prints: 1 });
});

test('getText devolve null para NoSuchKey e propaga outros erros', async () => {
  const ok = client(async () => ({ Body: { transformToString: async () => 'oi' } }));
  assert.equal(await getText('config.json', ok), 'oi');

  const missing = client(async () => {
    const e = new Error('nope');
    e.name = 'NoSuchKey';
    throw e;
  });
  assert.equal(await getText('config.json', missing), null);

  const broken = client(async () => {
    throw new Error('rede fora');
  });
  await assert.rejects(getText('config.json', broken), /rede fora/);
});

test('put manda bucket, key, content type e cache control', async () => {
  process.env.R2_BUCKET = 'meu-bucket';
  try {
    const inputs: any[] = [];
    const io = client(async (cmd) => {
      inputs.push(cmd.input);
      return {};
    });
    await put('shots/a/1.jpg', Buffer.from('x'), 'image/jpeg', 'no-cache', io);
    assert.equal(inputs[0].Bucket, 'meu-bucket');
    assert.equal(inputs[0].Key, 'shots/a/1.jpg');
    assert.equal(inputs[0].ContentType, 'image/jpeg');
    assert.equal(inputs[0].CacheControl, 'no-cache');
    assert.equal(String(inputs[0].Body), 'x');
  } finally {
    if (oldBucket === undefined) delete process.env.R2_BUCKET;
    else process.env.R2_BUCKET = oldBucket;
  }
});
