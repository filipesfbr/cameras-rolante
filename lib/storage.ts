import { del, list, publicUrl } from './r2.ts';
import { memo, state } from './state.ts';
import { cursorOf, isDay, parseCursor, stamp } from './time.ts';

// shots/<camId>/<AAAA-MM-DD>/<HHmmss>.jpg  +  <HHmmss>.thumb.jpg
// A key é o id da imagem, e a ordem lexicográfica do list já é a cronológica: paginação sem índice.
export const shotKey = (cam: string, day: string, t: string, thumb = false) =>
  `shots/${cam}/${day}/${t}${thumb ? '.thumb' : ''}.jpg`;

export type Frame = { id: string; day: string; t: string; thumb: string; full: string };

const toFrame = (cam: string, day: string, t: string): Frame => ({
  id: cursorOf(day, t),
  day,
  t,
  thumb: publicUrl(shotKey(cam, day, t, true)),
  full: publicUrl(shotKey(cam, day, t)),
});

const LIST_TTL = 20_000;

/** dias existentes da câmera, em ordem crescente */
export const days = (cam: string) =>
  memo(`days:${cam}`, LIST_TTL, async () => {
    const { prefixes } = await list(`shots/${cam}/`, '/');
    return prefixes.map((p) => p.split('/')[2]).filter(isDay).sort();
  });

/** horários (HHmmss) com thumb no dia, em ordem crescente. O thumb sobe por último: se está listado, o full existe. */
export const dayTimes = (cam: string, day: string) =>
  memo(`day:${cam}:${day}`, LIST_TTL, async () => {
    const { keys } = await list(`shots/${cam}/${day}/`);
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

export async function frames(cam: string, o: { before?: string | null; after?: string | null; limit: number }) {
  const ds = await days(cam);
  const found = await page({ days: ds, dayTimes: (d) => dayTimes(cam, d) }, o);
  return found.map((f) => toFrame(cam, f.day, f.t));
}

const forget = () => state.memo.clear();

/** Varredura de retenção: apaga todo dia anterior a (hoje − retentionDays), inclusive de câmeras já removidas. */
export async function sweep(retentionDays: number) {
  const cutoff = stamp(new Date(Date.now() - retentionDays * 86_400_000)).day;
  const { prefixes: cams } = await list('shots/', '/');
  let removed = 0;
  for (const c of cams) {
    const cam = c.split('/')[1];
    const { prefixes } = await list(`shots/${cam}/`, '/');
    for (const p of prefixes) {
      const day = p.split('/')[2];
      if (!isDay(day) || day >= cutoff) continue;
      const { keys } = await list(p);
      await del(keys);
      removed += keys.length;
    }
  }
  forget();
  return removed;
}

async function rangeKeys(cam: string, from: string, to: string) {
  const out: string[] = [];
  for (const d of await days(cam)) {
    if (d < from || d > to) continue;
    out.push(...(await list(`shots/${cam}/${d}/`)).keys);
  }
  return out;
}

export async function countRange(cam: string, from: string, to: string) {
  forget();
  return (await rangeKeys(cam, from, to)).length;
}

export async function deleteRange(cam: string, from: string, to: string) {
  forget();
  const keys = await rangeKeys(cam, from, to);
  await del(keys);
  forget();
  return keys.length;
}
