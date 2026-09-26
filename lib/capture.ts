import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { intervalOf, readConfig, type Camera } from './config.ts';
import { put } from './r2.ts';
import { assertPublicUrl } from './ssrf.ts';
import { state } from './state.ts';
import { shotKey, sweep } from './storage.ts';
import { stamp } from './time.ts';

const IMMUTABLE = 'public, max-age=31536000, immutable'; // um quadro nunca muda
const log = (m: string) => console.error(`[captura] ${m}`);

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    // câmera fora do ar não trava o ciclo dela nem o das outras: kill em 30s
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30_000, killSignal: 'SIGKILL' });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    p.on('error', reject);
    p.on('close', (code, sig) =>
      code === 0 ? resolve() : reject(new Error(sig ? 'timeout (30s)' : err.trim().split('\n').pop() || `ffmpeg saiu com ${code}`)),
    );
  });
}

/** Uma chamada gera o full (1280px) e a thumb (320px). Sem browser: o ffmpeg puxa o frame direto do m3u8. */
async function shoot(streamUrl: string, dir: string) {
  await assertPublicUrl(streamUrl);
  await ffmpeg([
    '-nostdin', '-loglevel', 'error', '-y',
    '-protocol_whitelist', 'http,https,tcp,tls,crypto', // playlist remota não lê file:// nem nada além de http(s)
    '-i', streamUrl,
    '-filter_complex', '[0:v]split=2[a][b];[a]scale=1280:-2[f];[b]scale=320:-2[t]',
    '-map', '[f]', '-frames:v', '1', '-q:v', '5', join(dir, 'full.jpg'),
    '-map', '[t]', '-frames:v', '1', '-q:v', '6', join(dir, 'thumb.jpg'),
  ]);
  return { full: join(dir, 'full.jpg'), thumb: join(dir, 'thumb.jpg') };
}

async function withTmp<T>(fn: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), 'shot-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Captura, sobe pro R2 e apaga o local. Devolve o cursor do quadro. */
export function grab(cam: Camera) {
  return withTmp(async (dir) => {
    const f = await shoot(cam.streamUrl, dir);
    const { day, t } = stamp();
    await put(shotKey(cam.id, day, t), await readFile(/*turbopackIgnore: true*/ f.full), 'image/jpeg', IMMUTABLE);
    await put(shotKey(cam.id, day, t, true), await readFile(/*turbopackIgnore: true*/ f.thumb), 'image/jpeg', IMMUTABLE); // thumb por último
    return `${day}T${t}`;
  });
}

/** "Testar câmera" do admin: mesmo caminho do grab, sem gravar no R2. Devolve o frame como data URL. */
export function testStream(streamUrl: string) {
  return withTmp(async (dir) => `data:image/jpeg;base64,${(await readFile(/*turbopackIgnore: true*/ (await shoot(streamUrl, dir)).full)).toString('base64')}`);
}

/** Captura e registra o status num lugar só (o agendador e o "Capturar agora" compartilham isto). */
async function runCapture(id: string, cam: Camera) {
  state.inFlight.add(id);
  try {
    const cursor = await grab(cam);
    state.status.set(id, { at: Date.now(), ok: true });
    return cursor;
  } catch (e) {
    state.status.set(id, { at: Date.now(), ok: false, error: (e as Error).message });
    throw e;
  } finally {
    state.inFlight.delete(id);
  }
}

export async function captureNow(id: string) {
  const cfg = await readConfig();
  const cam = cfg.cameras.find((c) => c.id === id);
  if (!cam) throw new Error('câmera não encontrada');
  if (state.inFlight.has(id)) throw new Error('já existe uma captura em andamento para esta câmera');
  const cursor = await runCapture(id, cam);
  arm(id, intervalOf(cfg, cam));
  return cursor;
}

function arm(id: string, sec: number) {
  clearTimeout(state.timers.get(id));
  state.timers.set(id, setTimeout(() => tick(id), sec * 1000));
}

async function tick(id: string) {
  const gen = state.gen;
  let next = 900;
  try {
    const cfg = await readConfig(); // relê a cada ciclo: intervalo e flags mudam sem restart
    const cam = cfg.cameras.find((c) => c.id === id);
    if (!cam) return void state.timers.delete(id); // removida no admin
    next = intervalOf(cfg, cam);
    if (cfg.captureEnabled && cam.captureEnabled && !state.inFlight.has(id)) await runCapture(id, cam);
  } catch (e) {
    log(`${id}: ${(e as Error).message}`);
  }
  if (gen === state.gen) arm(id, next); // se reprogramaram no meio, a cadeia nova é a dona do timer
}

/** Derruba e recria os timers pra mudança de config valer na hora. */
export async function rescheduleAll(firstDelaySec?: number) {
  const cfg = await readConfig();
  state.gen++;
  for (const t of state.timers.values()) clearTimeout(t);
  state.timers.clear();
  for (const cam of cfg.cameras) arm(cam.id, firstDelaySec ?? intervalOf(cfg, cam));
}

async function runSweep() {
  try {
    const n = await sweep((await readConfig()).retentionDays);
    if (n) log(`retenção: ${n} objetos apagados`);
  } catch (e) {
    log(`retenção: ${(e as Error).message}`);
  }
}

/** Chamado pelo instrumentation.ts: timers por câmera + varredura de retenção ao subir e a cada 24h. */
export async function start() {
  if (state.started) return;
  state.started = true;
  try {
    await rescheduleAll(10); // primeiro print 10s depois de subir, depois no ritmo de cada câmera
  } catch (e) {
    state.started = false;
    log(`não consegui ler a config (${(e as Error).message}); nova tentativa em 60s`);
    setTimeout(start, 60_000);
    return;
  }
  setTimeout(runSweep, 30_000);
  setInterval(runSweep, 86_400_000);
}
