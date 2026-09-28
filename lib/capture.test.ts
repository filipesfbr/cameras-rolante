import assert from 'node:assert/strict';
import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { captureNow, grab, rescheduleAll, runFfmpeg, testStream, tick, type GrabIo } from './capture.ts';
import type { Camera, Config } from './config.ts';
import { state } from './state.ts';

beforeEach(() => {
  for (const t of state.timers.values()) clearTimeout(t);
  state.timers.clear();
  state.inFlight.clear();
  state.status.clear();
  state.memo.clear();
  state.config = undefined;
});

class FakeProc extends EventEmitter {
  stderr = new EventEmitter();
}

function fakeSpawn(onSpawn: (p: FakeProc) => void) {
  const calls: { cmd: string; args: string[]; timeout?: number }[] = [];
  const spawnFn = ((cmd: string, args: string[], opts: { timeout?: number }) => {
    calls.push({ cmd, args, timeout: opts.timeout });
    const p = new FakeProc();
    setImmediate(() => onSpawn(p));
    return p;
  }) as unknown as typeof spawn;
  return { calls, spawnFn };
}

const cam = (over: Partial<Camera> = {}): Camera => ({
  id: 'cam',
  name: 'Câmera',
  location: 'Rio',
  streamUrl: 'https://cam.exemplo/video.m3u8',
  active: true,
  captureEnabled: true,
  ...over,
});

const cfgWith = (cameras: Camera[], over: Partial<Config> = {}): Config => ({
  captureEnabled: true,
  intervalSec: 900,
  historyBatch: 12,
  retentionDays: 30,
  cameras,
  ...over,
});

function grabIo(onShoot?: () => void) {
  const writes: string[] = [];
  const io: GrabIo = {
    shoot: async (_streamUrl, dir) => {
      onShoot?.();
      await writeFile(join(dir, 'full.jpg'), 'FULL');
      await writeFile(join(dir, 'thumb.jpg'), 'THUMB');
      return { full: join(dir, 'full.jpg'), thumb: join(dir, 'thumb.jpg') };
    },
    put: async (key: string) => {
      writes.push(key);
    },
  };
  return { io, writes };
}

test('runFfmpeg resolve quando o ffmpeg sai com 0', async () => {
  const { calls, spawnFn } = fakeSpawn((p) => p.emit('close', 0, null));
  await runFfmpeg(['-i', 'x'], spawnFn);
  assert.equal(calls[0].cmd, 'ffmpeg');
  assert.equal(calls[0].timeout, 30_000);
});

test('runFfmpeg rejeita com a última linha do stderr', async () => {
  const { spawnFn } = fakeSpawn((p) => {
    p.stderr.emit('data', Buffer.from('aviso\nfalhou feio'));
    p.emit('close', 1, null);
  });
  await assert.rejects(runFfmpeg(['-i', 'x'], spawnFn), /falhou feio/);
});

test('runFfmpeg rejeita como timeout quando o processo morre por sinal', async () => {
  const { spawnFn } = fakeSpawn((p) => p.emit('close', null, 'SIGKILL'));
  await assert.rejects(runFfmpeg(['-i', 'x'], spawnFn), /timeout \(30s\)/);
});

test('runFfmpeg rejeita se o binário não existe', async () => {
  const { spawnFn } = fakeSpawn((p) => p.emit('error', new Error('ENOENT')));
  await assert.rejects(runFfmpeg(['-i', 'x'], spawnFn), /ENOENT/);
});

test('grab sobe o full antes do thumb e devolve o cursor', async () => {
  const writes: { key: string; body: string; type?: string }[] = [];
  const io: GrabIo = {
    shoot: async (_streamUrl, dir) => {
      await writeFile(join(dir, 'full.jpg'), 'FULL');
      await writeFile(join(dir, 'thumb.jpg'), 'THUMB');
      return { full: join(dir, 'full.jpg'), thumb: join(dir, 'thumb.jpg') };
    },
    put: async (key: string, body: Buffer | string, type?: string) => {
      writes.push({ key, body: String(body), type });
    },
  };
  const cursor = await grab(cam(), io);
  assert.match(cursor, /^\d{4}-\d{2}-\d{2}T\d{6}$/);
  assert.equal(writes.length, 2);
  assert.match(writes[0].key, /^shots\/cam\/\d{4}-\d{2}-\d{2}\/\d{6}\.jpg$/);
  assert.equal(writes[1].key, writes[0].key.replace('.jpg', '.thumb.jpg'));
  assert.equal(writes[0].body, 'FULL');
  assert.equal(writes[1].body, 'THUMB');
  assert.equal(writes[0].type, 'image/jpeg');
});

test('testStream devolve o full como data URL', async () => {
  const { io } = grabIo();
  assert.equal(await testStream('https://cam.exemplo/video.m3u8', io), `data:image/jpeg;base64,${Buffer.from('FULL').toString('base64')}`);
});

test('tick captura e rearma com o intervalo da câmera', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.config = cfgWith([cam({ intervalSec: 300 })]);
  const { io, writes } = grabIo();
  await tick('cam', io);
  assert.equal(writes.length, 2);
  assert.ok(state.timers.has('cam'));
});

test('tick não captura com o toggle mestre nem com a câmera desligada', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const cfg of [cfgWith([cam()], { captureEnabled: false }), cfgWith([cam({ captureEnabled: false })])]) {
    state.timers.clear();
    state.config = cfg;
    const { io, writes } = grabIo();
    await tick('cam', io);
    assert.equal(writes.length, 0);
    assert.ok(state.timers.has('cam'));
  }
});

test('tick não captura se já existe captura em andamento', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.config = cfgWith([cam()]);
  state.inFlight.add('cam');
  const { io, writes } = grabIo();
  await tick('cam', io);
  assert.equal(writes.length, 0);
  assert.ok(state.timers.has('cam'));
});

test('tick descarta o timer da câmera removida', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.config = cfgWith([cam()]);
  state.timers.set('cam', setTimeout(() => {}, 1000));
  state.config = cfgWith([]);
  const { io } = grabIo();
  await tick('cam', io);
  assert.equal(state.timers.has('cam'), false);
});

test('tick não rearma se a config foi reprogramada durante a captura', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.config = cfgWith([cam()]);
  const { io } = grabIo(() => state.gen++);
  await tick('cam', io);
  assert.equal(state.timers.has('cam'), false);
});

test('tick registra falha e não quebra o ciclo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.config = cfgWith([cam()]);
  const io: GrabIo = {
    shoot: async () => {
      throw new Error('câmera fora do ar');
    },
    put: async () => {},
  };
  await tick('cam', io);
  assert.equal(state.status.get('cam')?.ok, false);
  assert.equal(state.status.get('cam')?.error, 'câmera fora do ar');
  assert.ok(state.timers.has('cam'));
});

test('captureNow recusa câmera inexistente e captura concorrente', async () => {
  state.config = cfgWith([cam()]);
  const { io } = grabIo();
  await assert.rejects(captureNow('outra', io), /câmera não encontrada/);
  state.inFlight.add('cam');
  await assert.rejects(captureNow('cam', io), /já existe uma captura em andamento/);
});

test('captureNow registra sucesso, limpa o inFlight e arma o timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.config = cfgWith([cam()]);
  const { io, writes } = grabIo();
  const cursor = await captureNow('cam', io);
  assert.match(cursor, /^\d{4}-\d{2}-\d{2}T\d{6}$/);
  assert.equal(writes.length, 2);
  assert.equal(state.status.get('cam')?.ok, true);
  assert.equal(state.inFlight.has('cam'), false);
  assert.ok(state.timers.has('cam'));
});

test('captureNow registra falha e propaga o erro', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.config = cfgWith([cam()]);
  const io: GrabIo = {
    shoot: async () => {
      throw new Error('sem sinal');
    },
    put: async () => {},
  };
  await assert.rejects(captureNow('cam', io), /sem sinal/);
  assert.equal(state.status.get('cam')?.ok, false);
  assert.equal(state.status.get('cam')?.error, 'sem sinal');
  assert.equal(state.inFlight.has('cam'), false);
});

test('rescheduleAll derruba os timers antigos, recria um por câmera e sobe a geração', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  state.config = cfgWith([cam(), cam({ id: 'cam2', intervalSec: 300 })]);
  state.timers.set('velho', setTimeout(() => {}, 999999));
  const gen = state.gen;
  await rescheduleAll(1);
  assert.equal(state.timers.size, 2);
  assert.ok(state.timers.has('cam'));
  assert.ok(state.timers.has('cam2'));
  assert.equal(state.timers.has('velho'), false);
  assert.equal(state.gen, gen + 1);
});
