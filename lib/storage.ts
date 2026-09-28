import { del, list, publicUrl, usage } from './r2.ts';
import { memo, state } from './state.ts';
import { cursorOf, isDay, parseCursor, stamp } from './time.ts';

// shots/<camId>/<AAAA-MM-DD>/<HHmmss>.jpg  +  <HHmmss>.thumb.jpg
// A key é o id da imagem, e a ordem lexicográfica do list já é a cronológica: paginação sem índice.
export const shotKey = (cam: string, day: string, t: string, thumb = false) =>
  `shots/${cam}/${day}/${t}${thumb ? '.thumb' : ''}.jpg`;

export type Frame = { id: string; day: string; t: string; thumb: string; full: string };

export const frameOf = (cam: string, day: string, t: string): Frame => ({
  id: cursorOf(day, t),
  day,
  t,
  thumb: publicUrl(shotKey(cam, day, t, true)),
  full: publicUrl(shotKey(cam, day, t)),
});

const LIST_TTL = 20_000;

export type StorageIo = { list: typeof list; del: typeof del; usage: typeof usage };
const defaultIo: StorageIo = { list, del, usage };

/** dias existentes da câmera, em ordem crescente */
export const days = (cam: string, io: StorageIo = defaultIo) =>
  memo(`days:${cam}`, LIST_TTL, async () => {
    const { prefixes } = await io.list(`shots/${cam}/`, '/');
    return prefixes.map((p) => p.split('/')[2]).filter(isDay).sort();
  });

/** horários (HHmmss) com thumb no dia, em ordem crescente. O thumb sobe por último: se está listado, o full existe. */
export const dayTimes = (cam: string, day: string, io: StorageIo = defaultIo) =>
  memo(`day:${cam}:${day}`, LIST_TTL, async () => {
    const { keys } = await io.list(`shots/${cam}/${day}/`);
    return keys
      .map((k) => k.split('/').pop()!)
      .filter((f) => f.endsWith('.thumb.jpg'))
      .map((f) => f.slice(0, 6))
      .sort();
  });

type Deps = { days: string[]; dayTimes: (day: string) => Promise<string[]> };

/**
 * before: quadros mais antigos que o cursor (sem cursor = os mais recentes), do mais novo pro mais antigo.
 * after:  quadros mais novos que o cursor, também do mais novo pro mais antigo.
 * Atravessa a virada de dia descendo/subindo pelos prefixos.
 */
export async function page(
  { days, dayTimes }: Deps,
  o: { before?: string | null; after?: string | null; limit: number },
) {
  const out: { day: string; t: string }[] = [];
  const after = parseCursor(o.after);
  if (after) {
    for (const d of days) {
      if (d < after.day) continue;
      for (const t of await dayTimes(d)) if (d > after.day || t > after.t) out.push({ day: d, t });
    }
    // ponytail: teto de limit; se passar disso desde o último poll, o meio some. Nunca ocorre com poll de 60s.
    return out.slice(-o.limit).reverse();
  }
  const before = parseCursor(o.before);
  for (const d of [...days].reverse()) {
    if (before && d > before.day) continue;
    for (const t of [...(await dayTimes(d))].reverse()) {
      if (before && d === before.day && t >= before.t) continue;
      out.push({ day: d, t });
      if (out.length >= o.limit) return out;
    }
  }
  return out;
}

export async function frames(cam: string, o: { before?: string | null; after?: string | null; limit: number }, io: StorageIo = defaultIo) {
  const ds = await days(cam, io);
  const found = await page({ days: ds, dayTimes: (d) => dayTimes(cam, d, io) }, o);
  return found.map((f) => frameOf(cam, f.day, f.t));
}

export async function framesOfDay(cam: string, day: string, io: StorageIo = defaultIo) {
  return (await dayTimes(cam, day, io)).map((t) => frameOf(cam, day, t));
}

const forget = () => state.memo.clear();

/** Varredura de retenção: apaga todo dia anterior a (hoje − retentionDays), inclusive de câmeras já removidas. */
export async function sweep(retentionDays: number, io: StorageIo = defaultIo) {
  const cutoff = stamp(new Date(Date.now() - retentionDays * 86_400_000)).day;
  const { prefixes: cams } = await io.list('shots/', '/');
  let removed = 0;
  for (const c of cams) {
    const cam = c.split('/')[1];
    const { prefixes } = await io.list(`shots/${cam}/`, '/');
    for (const p of prefixes) {
      const day = p.split('/')[2];
      if (!isDay(day) || day >= cutoff) continue;
      const { keys } = await io.list(p);
      await io.del(keys);
      removed += keys.length;
    }
  }
  forget();
  return removed;
}

async function rangeKeys(cam: string, from: string, to: string, io: StorageIo) {
  const out: string[] = [];
  for (const d of await days(cam, io)) {
    if (d < from || d > to) continue;
    out.push(...(await io.list(`shots/${cam}/${d}/`)).keys);
  }
  return out;
}

export async function countRange(cam: string, from: string, to: string, io: StorageIo = defaultIo) {
  forget();
  return (await rangeKeys(cam, from, to, io)).length;
}

export async function deleteRange(cam: string, from: string, to: string, io: StorageIo = defaultIo) {
  forget();
  const keys = await rangeKeys(cam, from, to, io);
  await io.del(keys);
  forget();
  return keys.length;
}

const FIRST_DAY = '0000-01-01';
const LAST_DAY = '9999-12-31';

export const countCamera = (cam: string, io: StorageIo = defaultIo) => countRange(cam, FIRST_DAY, LAST_DAY, io);
export const deleteCamera = (cam: string, io: StorageIo = defaultIo) => deleteRange(cam, FIRST_DAY, LAST_DAY, io);

const USAGE_TTL = 10 * 60_000;

export const bucketUsage = (io: StorageIo = defaultIo) =>
  memo('usage', USAGE_TTL, async () => {
    const { bytes, count, prints } = await io.usage();
    return { bytes, count, prints, at: Date.now() };
  });
